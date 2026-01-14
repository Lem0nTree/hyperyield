// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IPendleRouter.sol";
import "../interfaces/IPendleMarket.sol";
import "../interfaces/IPendleFactory.sol";
import "../libraries/HyperStructs.sol";
import "./PendleAdapter.sol";

/**
 * @title HyperMarket
 * @dev Core betting market with Betting Power normalization
 * @notice Supports multiple time horizons with BP-based fair distribution
 */
contract HyperMarket is ReentrancyGuard, Ownable, PendleAdapter {
    using HyperStructs for HyperStructs.MarketParams;
    using HyperStructs for HyperStructs.Position;
    using HyperStructs for HyperStructs.PendleMarketInfo;

    // --- Configuration ---
    IERC20 public immutable underlyingToken; // USDY
    IPendleFactory public pendleFactory; // For market validation
    
    // --- Market State ---
    HyperStructs.MarketParams public market;
    
    // --- Betting State (Normalized by BP) ---
    uint256 public totalBPPot; // Total BP from all users
    mapping(uint8 => uint256) public sideBPPool; // BP per side (1 = YES, 2 = NO)
    
    // --- User Positions ---
    mapping(address => HyperStructs.Position) public positions;
    
    // --- Multi-Maturity Support ---
    mapping(uint256 => HyperStructs.PendleMarketInfo) public pendleMarkets; // maturityDate => market info
    uint256[] public activeMaturities; // List of maturity dates in use
    mapping(uint256 => mapping(uint8 => uint256)) public maturitySideYtBalance; // maturity => side => YT balance
    
    // --- Oracle ---
    address public oracle;
    modifier onlyOracle() {
        require(msg.sender == oracle, "Not oracle");
        _;
    }

    // --- Events ---
    event Deposited(
        address indexed user,
        uint256 amount,
        uint256 timeLockDays,
        uint256 maturityDate,
        uint256 bettingPower,
        uint8 side
    );
    event Resolved(uint8 winningSide);
    event Claimed(
        address indexed user,
        uint256 principalReturned,
        uint256 yieldWinnings
    );
    event PendleMarketRegistered(
        uint256 indexed maturityDate,
        address indexed market,
        address ptToken,
        address ytToken
    );

    constructor(
        address _underlyingToken,
        address _pendleRouter,
        address _pendleFactory,
        uint256 _minTimeLock,
        uint256 _maxTimeLock,
        uint256 _resolutionDate,
        address _oracle
    ) PendleAdapter(_pendleRouter) Ownable(msg.sender) {
        require(_underlyingToken != address(0), "Invalid underlying");
        require(_pendleFactory != address(0), "Invalid factory");
        require(_minTimeLock > 0 && _minTimeLock <= _maxTimeLock, "Invalid time locks");
        require(_resolutionDate > block.timestamp, "Invalid resolution date");
        require(_oracle != address(0), "Invalid oracle");
        
        underlyingToken = IERC20(_underlyingToken);
        pendleFactory = IPendleFactory(_pendleFactory);
        oracle = _oracle;
        
        market = HyperStructs.MarketParams({
            underlyingToken: _underlyingToken,
            resolutionDate: _resolutionDate,
            minTimeLock: _minTimeLock,
            maxTimeLock: _maxTimeLock,
            resolved: false,
            outcome: 0
        });
    }

    /**
     * @dev Register a Pendle market for a specific maturity
     * @param maturityDate Maturity timestamp
     * @param pendleMarket Pendle market address
     */
    function registerPendleMarket(
        uint256 maturityDate,
        address pendleMarket
    ) external onlyOwner {
        require(maturityDate > block.timestamp, "Invalid maturity");
        require(pendleMarkets[maturityDate].market == address(0), "Already registered");
        require(pendleFactory.isValidMarket(pendleMarket), "Invalid market");
        
        IPendleMarket marketContract = IPendleMarket(pendleMarket);
        (address ptToken, address ytToken) = marketContract.readTokens();
        uint256 marketExpiry = marketContract.expiry();
        
        require(marketExpiry == maturityDate, "Maturity mismatch");
        
        pendleMarkets[maturityDate] = HyperStructs.PendleMarketInfo({
            market: pendleMarket,
            ptToken: ptToken,
            ytToken: ytToken,
            maturityDate: maturityDate,
            isActive: true
        });
        
        activeMaturities.push(maturityDate);
        
        emit PendleMarketRegistered(maturityDate, pendleMarket, ptToken, ytToken);
    }

    /**
     * @dev Deposit with custom time lock
     * @param amount Principal amount in USDY
     * @param timeLockDays User-selected lock period in days
     * @param side 1 = YES, 2 = NO
     */
    function deposit(
        uint256 amount,
        uint256 timeLockDays,
        uint8 side
    ) external nonReentrant {
        require(!market.resolved, "Market resolved");
        require(block.timestamp < market.resolutionDate, "Betting closed");
        require(side == 1 || side == 2, "Invalid side");
        require(amount > 0, "Amount must be > 0");
        require(
            timeLockDays >= market.minTimeLock && timeLockDays <= market.maxTimeLock,
            "Invalid time lock"
        );
        
        // Calculate maturity date
        uint256 maturityDate = block.timestamp + (timeLockDays * 1 days);
        
        // Validate Pendle market exists
        _validatePendleMarketExists(maturityDate);
        HyperStructs.PendleMarketInfo storage marketInfo = pendleMarkets[maturityDate];
        require(marketInfo.isActive, "Market not active");
        
        // Fetch yield rate and calculate BP
        uint256 yieldRateBps = _getYieldRate(marketInfo.market);
        uint256 bp = _calculateBP(amount, yieldRateBps, timeLockDays);
        
        // Transfer USDY from user
        underlyingToken.transferFrom(msg.sender, address(this), amount);
        
        // Approve and zap USDY → PT+YT
        underlyingToken.approve(address(pendleRouter), amount);
        
        IPendleRouter.TokenInput memory input = IPendleRouter.TokenInput({
            tokenIn: address(underlyingToken),
            netTokenIn: amount,
            tokenMintSy: address(underlyingToken),
            pendleSwap: address(0),
            swapData: IPendleRouter.SwapData(0, address(0), "", false)
        });
        
        uint256 mintedPy = pendleRouter.mintPyFromToken(
            address(this),
            marketInfo.market,
            0, // minPyOut = 0 for MVP
            input
        );
        
        // Reset approval
        underlyingToken.approve(address(pendleRouter), 0);
        
        // Update position
        HyperStructs.Position storage pos = positions[msg.sender];
        
        // If user already has a position, ensure same side
        if (pos.principalAmount > 0) {
            require(pos.side == side, "Cannot hedge");
            // For MVP, we allow same side but different maturities
            // In production, you might want to restrict this
        } else {
            pos.side = side;
        }
        
        pos.principalAmount += amount;
        pos.bettingPower += bp;
        pos.maturityDate = maturityDate; // Use latest maturity
        pos.ptBalance += mintedPy;
        pos.ytBalance += mintedPy;
        
        // Update global pools
        totalBPPot += bp;
        sideBPPool[side] += bp;
        maturitySideYtBalance[maturityDate][side] += mintedPy;
        
        emit Deposited(msg.sender, amount, timeLockDays, maturityDate, bp, side);
    }

    /**
     * @dev Resolve market (oracle only)
     * @param winningSide 1 = YES, 2 = NO
     */
    function resolveMarket(uint8 winningSide) external onlyOracle {
        require(!market.resolved, "Already resolved");
        require(block.timestamp >= market.resolutionDate, "Too early");
        require(winningSide == 1 || winningSide == 2, "Invalid outcome");
        
        market.resolved = true;
        market.outcome = winningSide;
        
        emit Resolved(winningSide);
    }

    /**
     * @dev Claim winnings
     * @param mode 0 = Claim tokens, 1 = Exit to cash
     */
    function claim(uint8 mode) external nonReentrant {
        require(market.resolved, "Not resolved");
        HyperStructs.Position storage pos = positions[msg.sender];
        require(!pos.claimed, "Already claimed");
        require(pos.principalAmount > 0, "No position");
        
        pos.claimed = true;
        
        bool isWinner = pos.side == market.outcome;
        
        if (mode == 0) {
            // Claim tokens
            _claimTokens(msg.sender, pos, isWinner);
        } else if (mode == 1) {
            // Exit to cash
            _exitToCash(msg.sender, pos, isWinner);
        } else {
            revert("Invalid mode");
        }
    }

    /**
     * @dev Internal: Claim tokens (PT + YT basket)
     */
    function _claimTokens(
        address user,
        HyperStructs.Position memory pos,
        bool isWinner
    ) internal {
        HyperStructs.PendleMarketInfo memory marketInfo = pendleMarkets[pos.maturityDate];
        IERC20 ptToken = IERC20(marketInfo.ptToken);
        
        // Transfer PT (safety chamber)
        ptToken.transfer(user, pos.ptBalance);
        
        uint256 totalWinningsYt = 0;
        
        if (isWinner) {
            // Calculate YT winnings based on BP share
            uint256 totalWinnerBP = sideBPPool[market.outcome];
            require(totalWinnerBP > 0, "No winners");
            
            // User's share of total BP pot
            uint256 userBPShare = (pos.bettingPower * totalBPPot) / totalWinnerBP;
            
            // Distribute YT from all losing-side maturities
            uint8 losingSide = market.outcome == 1 ? 2 : 1;
            uint256 totalLosingYt = 0;
            
            // Calculate total losing-side YT
            for (uint256 i = 0; i < activeMaturities.length; i++) {
                totalLosingYt += maturitySideYtBalance[activeMaturities[i]][losingSide];
            }
            
            if (totalLosingYt > 0) {
                // Distribute proportionally across maturities
                for (uint256 i = 0; i < activeMaturities.length; i++) {
                    uint256 maturity = activeMaturities[i];
                    uint256 maturityYt = maturitySideYtBalance[maturity][losingSide];
                    
                    if (maturityYt > 0) {
                        uint256 userShare = (userBPShare * maturityYt) / totalLosingYt;
                        if (userShare > 0) {
                            HyperStructs.PendleMarketInfo memory maturityInfo = pendleMarkets[maturity];
                            IERC20 ytToken = IERC20(maturityInfo.ytToken);
                            ytToken.transfer(user, userShare);
                            totalWinningsYt += userShare;
                        }
                    }
                }
            }
        }
        
        emit Claimed(user, pos.ptBalance, totalWinningsYt);
    }

    /**
     * @dev Internal: Exit to cash (auto-swap to USDY)
     */
    function _exitToCash(
        address user,
        HyperStructs.Position memory pos,
        bool isWinner
    ) internal {
        HyperStructs.PendleMarketInfo memory marketInfo = pendleMarkets[pos.maturityDate];
        IERC20 ptToken = IERC20(marketInfo.ptToken);
        IERC20 ytToken = IERC20(marketInfo.ytToken);
        
        uint256 totalUsdyOut = 0;
        
        if (isWinner) {
            // Calculate YT winnings
            uint256 totalWinnerBP = sideBPPool[market.outcome];
            require(totalWinnerBP > 0, "No winners");
            
            uint256 userBPShare = (pos.bettingPower * totalBPPot) / totalWinnerBP;
            uint8 losingSide = market.outcome == 1 ? 2 : 1;
            uint256 totalLosingYt = 0;
            
            for (uint256 i = 0; i < activeMaturities.length; i++) {
                totalLosingYt += maturitySideYtBalance[activeMaturities[i]][losingSide];
            }
            
            // Calculate YT winnings first
            uint256 userYtWinnings = 0;
            if (totalLosingYt > 0) {
                // Calculate user's share of losing-side YT
                for (uint256 i = 0; i < activeMaturities.length; i++) {
                    uint256 maturity = activeMaturities[i];
                    uint256 maturityYt = maturitySideYtBalance[maturity][losingSide];
                    
                    if (maturityYt > 0) {
                        uint256 userShare = (userBPShare * maturityYt) / totalLosingYt;
                        userYtWinnings += userShare;
                    }
                }
            }
            
            // Match PT with equivalent YT from user's maturity (if available)
            // Only match if user has YT winnings from their own maturity
            uint256 userMaturityYtWinnings = 0;
            if (totalLosingYt > 0) {
                uint256 userMaturityYt = maturitySideYtBalance[pos.maturityDate][losingSide];
                if (userMaturityYt > 0) {
                    userMaturityYtWinnings = (userBPShare * userMaturityYt) / totalLosingYt;
                }
            }
            
            uint256 matchAmount = pos.ptBalance < userMaturityYtWinnings ? pos.ptBalance : userMaturityYtWinnings;
            
            if (matchAmount > 0) {
                // Approve and redeem matched pair
                ptToken.approve(address(pendleRouter), matchAmount);
                ytToken.approve(address(pendleRouter), matchAmount);
                
                IPendleRouter.TokenOutput memory output = IPendleRouter.TokenOutput({
                    tokenOut: address(underlyingToken),
                    minTokenOut: 0,
                    tokenRedeemSy: address(underlyingToken),
                    pendleSwap: address(0),
                    swapData: IPendleRouter.SwapData(0, address(0), "", false)
                });
                
                uint256 redeemed = pendleRouter.redeemPyToToken(
                    user,
                    marketInfo.market,
                    matchAmount,
                    output
                );
                totalUsdyOut += redeemed;
                
                // Reset approvals
                ptToken.approve(address(pendleRouter), 0);
                ytToken.approve(address(pendleRouter), 0);
            }
            
            // Handle excess PT (transfer to user)
            if (pos.ptBalance > matchAmount) {
                ptToken.transfer(user, pos.ptBalance - matchAmount);
            }
            
            // Handle excess YT (winnings from losers) - swap for USDY
            // Swap all YT winnings except what was used for matching
            uint256 excessYtToSwap = userYtWinnings;
            if (pos.maturityDate == marketInfo.maturityDate && matchAmount > 0) {
                // Subtract matched YT from user's maturity
                excessYtToSwap -= matchAmount;
            }
            
            if (excessYtToSwap > 0 && totalLosingYt > 0) {
                for (uint256 i = 0; i < activeMaturities.length; i++) {
                    uint256 maturity = activeMaturities[i];
                    uint256 maturityYt = maturitySideYtBalance[maturity][losingSide];
                    
                    if (maturityYt > 0) {
                        uint256 userShare = (userBPShare * maturityYt) / totalLosingYt;
                        
                        // If this is user's maturity and we matched some, subtract matched amount
                        if (maturity == pos.maturityDate && matchAmount > 0) {
                            if (userShare >= matchAmount) {
                                userShare -= matchAmount;
                            } else {
                                userShare = 0;
                            }
                        }
                        
                        if (userShare > 0) {
                            HyperStructs.PendleMarketInfo memory maturityInfo = pendleMarkets[maturity];
                            IERC20 maturityYtToken = IERC20(maturityInfo.ytToken);
                            
                            // Approve and swap YT for USDY
                            maturityYtToken.approve(address(pendleRouter), userShare);
                            
                            IPendleRouter.TokenOutput memory ytOutput = IPendleRouter.TokenOutput({
                                tokenOut: address(underlyingToken),
                                minTokenOut: 0,
                                tokenRedeemSy: address(underlyingToken),
                                pendleSwap: address(0),
                                swapData: IPendleRouter.SwapData(0, address(0), "", false)
                            });
                            
                            IPendleRouter.LimitOrderData memory limit = IPendleRouter.LimitOrderData({
                                limitRouter: address(0),
                                epsSkipMarket: 0,
                                normalFillsFirst: true,
                                fillPublishModal: false,
                                adminData: ""
                            });
                            
                            uint256 swapped = pendleRouter.swapExactYtForToken(
                                user,
                                maturityInfo.market,
                                userShare,
                                ytOutput,
                                limit
                            );
                            totalUsdyOut += swapped;
                            
                            // Reset approval
                            maturityYtToken.approve(address(pendleRouter), 0);
                        }
                    }
                }
            }
        } else {
            // Loser: just transfer PT
            ptToken.transfer(user, pos.ptBalance);
        }
        
        emit Claimed(user, pos.ptBalance, totalUsdyOut);
    }

    /**
     * @dev Internal: Calculate Betting Power
     * @param principal Principal amount
     * @param yieldRateBps Annual yield rate in basis points
     * @param timeLockDays Lock period in days
     * @return bp Betting Power
     */
    function _calculateBP(
        uint256 principal,
        uint256 yieldRateBps,
        uint256 timeLockDays
    ) internal pure returns (uint256 bp) {
        // BP = Principal × (YieldRate / 10000) × (TimeLock / 365)
        // Using fixed-point math with 1e18 precision
        uint256 timeFactor = (timeLockDays * 1e18) / 365;
        uint256 yieldFactor = (yieldRateBps * 1e18) / 10000;
        bp = (principal * yieldFactor * timeFactor) / (1e18 * 1e18);
    }

    /**
     * @dev Internal: Validate Pendle market exists for maturity
     */
    function _validatePendleMarketExists(uint256 maturityDate) internal view {
        // Check if market is registered
        require(pendleMarkets[maturityDate].market != address(0), "Market not registered");
        
        // Additional validation: check factory
        address marketAddress = pendleMarkets[maturityDate].market;
        require(pendleFactory.isValidMarket(marketAddress), "Invalid market");
    }

    /**
     * @dev Get active maturities
     */
    function getActiveMaturities() external view returns (uint256[] memory) {
        return activeMaturities;
    }

    /**
     * @dev Set oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
    }
}

