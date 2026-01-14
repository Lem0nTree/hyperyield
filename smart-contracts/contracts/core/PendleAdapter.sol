// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPendleRouter.sol";
import "../interfaces/IPendleMarket.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PendleAdapter
 * @dev Abstract contract providing Pendle Finance integration functions
 * @notice Handles PT/YT minting, redemption, swapping, and yield rate calculation
 */
abstract contract PendleAdapter {
    IPendleRouter public immutable pendleRouter;

    constructor(address _pendleRouter) {
        require(_pendleRouter != address(0), "Invalid router address");
        pendleRouter = IPendleRouter(_pendleRouter);
    }

    /**
     * @dev Swap underlying token (USDY) to PT + YT
     * @param market Pendle market address
     * @param underlyingToken Underlying token address (USDY)
     * @param amountIn Amount of underlying token to swap
     * @return netPyOut Amount of PY (PT+YT) tokens received
     */
    function _swapToPTYT(
        address market,
        address underlyingToken,
        uint256 amountIn
    ) internal returns (uint256 netPyOut) {
        
        // Approve router
        IERC20(underlyingToken).approve(address(pendleRouter), amountIn);
        
        // Prepare input
        IPendleRouter.TokenInput memory input = IPendleRouter.TokenInput({
            tokenIn: underlyingToken,
            netTokenIn: amountIn,
            tokenMintSy: underlyingToken,
            pendleSwap: address(0),
            swapData: IPendleRouter.SwapData(0, address(0), "", false)
        });
        
        // Execute mint
        netPyOut = pendleRouter.mintPyFromToken(
            address(this),
            market,
            0, // minPyOut = 0 for MVP (add slippage protection in production)
            input
        );
        
        // Reset approval
        IERC20(underlyingToken).approve(address(pendleRouter), 0);
    }

    /**
     * @dev Redeem PT + YT back to underlying token
     * @param market Pendle market address
     * @param underlyingToken Underlying token address (USDY)
     * @param pyAmount Amount of PY (PT+YT) to redeem
     * @return netTokenOut Amount of underlying token received
     */
    function _redeemPYToToken(
        address market,
        address underlyingToken,
        uint256 pyAmount
    ) internal returns (uint256 netTokenOut) {
        IPendleMarket marketContract = IPendleMarket(market);
        (address ptToken, ) = marketContract.readTokens();
        
        // Approve router
        IERC20(ptToken).approve(address(pendleRouter), pyAmount);
        // Note: YT approval handled separately if needed
        
        // Prepare output
        IPendleRouter.TokenOutput memory output = IPendleRouter.TokenOutput({
            tokenOut: underlyingToken,
            minTokenOut: 0, // minTokenOut = 0 for MVP
            tokenRedeemSy: underlyingToken,
            pendleSwap: address(0),
            swapData: IPendleRouter.SwapData(0, address(0), "", false)
        });
        
        // Execute redeem
        netTokenOut = pendleRouter.redeemPyToToken(
            address(this),
            market,
            pyAmount,
            output
        );
        
        // Reset approvals
        IERC20(ptToken).approve(address(pendleRouter), 0);
    }

    /**
     * @dev Swap YT tokens for underlying token
     * @param market Pendle market address
     * @param underlyingToken Underlying token address (USDY)
     * @param ytAmount Amount of YT tokens to swap
     * @return netTokenOut Amount of underlying token received
     */
    function _swapYTForToken(
        address market,
        address underlyingToken,
        uint256 ytAmount
    ) internal returns (uint256 netTokenOut) {
        IPendleMarket marketContract = IPendleMarket(market);
        (, address ytToken) = marketContract.readTokens();
        
        // Approve router
        IERC20(ytToken).approve(address(pendleRouter), ytAmount);
        
        // Prepare output
        IPendleRouter.TokenOutput memory output = IPendleRouter.TokenOutput({
            tokenOut: underlyingToken,
            minTokenOut: 0, // minTokenOut = 0 for MVP
            tokenRedeemSy: underlyingToken,
            pendleSwap: address(0),
            swapData: IPendleRouter.SwapData(0, address(0), "", false)
        });
        
        // Prepare limit order data (empty for MVP)
        IPendleRouter.LimitOrderData memory limit = IPendleRouter.LimitOrderData({
            limitRouter: address(0),
            epsSkipMarket: 0,
            normalFillsFirst: true,
            fillPublishModal: false,
            adminData: ""
        });
        
        // Execute swap
        netTokenOut = pendleRouter.swapExactYtForToken(
            address(this),
            market,
            ytAmount,
            output,
            limit
        );
        
        // Reset approval
        IERC20(ytToken).approve(address(pendleRouter), 0);
    }

    /**
     * @dev Get annual yield rate from Pendle market state
     * @param market Pendle market address
     * @return yieldRateBps Annual yield rate in basis points (e.g., 500 = 5%)
     * @notice Calculates implied yield rate from PT/YT pricing
     */
    function _getYieldRate(address market) internal view returns (uint256 yieldRateBps) {
        IPendleMarket marketContract = IPendleMarket(market);
        
        // Get market state
        (uint256 syIndex, uint256 pyIndex, , ) = marketContract.readState();
        
        // Get maturity date
        uint256 expiry = marketContract.expiry();
        uint256 now_ = block.timestamp;
        
        require(expiry > now_, "Market expired");
        uint256 daysToMaturity = (expiry - now_) / 1 days;
        require(daysToMaturity > 0, "Invalid maturity");
        
        // Calculate yield rate
        // PY / SY = 1 + (yieldRate * daysToMaturity / 365)
        // yieldRate = ((PY / SY) - 1) * (365 / daysToMaturity) * 10000
        if (syIndex == 0) {
            return 0;
        }
        
        // Calculate (PY / SY - 1) with precision
        uint256 ratio = (pyIndex * 1e18) / syIndex;
        if (ratio <= 1e18) {
            return 0; // No yield or negative yield
        }
        
        uint256 excess = ratio - 1e18; // Excess over 1.0
        uint256 annualFactor = (365 * 1e18) / daysToMaturity;
        uint256 yieldRate = (excess * annualFactor) / 1e18;
        
        // Convert to basis points (multiply by 10000 / 1e18)
        yieldRateBps = (yieldRate * 10000) / 1e18;
        
        // Sanity check: cap at 50% annual (5000 basis points)
        if (yieldRateBps > 5000) {
            yieldRateBps = 5000;
        }
    }
}

