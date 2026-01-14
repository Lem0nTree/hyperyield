// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPendleRouter.sol";
import "../interfaces/IPendleMarket.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockPendleRouter
 * @dev Mock Pendle Router for testing
 * @notice Simulates PT/YT minting, redemption, and swapping
 */
contract MockPendleRouter is IPendleRouter {
    /**
     * @dev Mint PT + YT from underlying token
     * @notice Transfers underlying token and mints equal amounts of PT and YT
     */
    function mintPyFromToken(
        address receiver,
        address market,
        uint256 /* minPyOut */,
        TokenInput calldata input
    ) external override returns (uint256 netPyOut) {
        // Transfer underlying token from caller
        IERC20(input.tokenIn).transferFrom(msg.sender, address(this), input.netTokenIn);
        
        // Get PT and YT token addresses
        IPendleMarket marketContract = IPendleMarket(market);
        (address ptToken, address ytToken) = marketContract.readTokens();
        
        // Mint equal amounts of PT and YT (1:1 ratio for simplicity)
        // In reality, the ratio depends on time to maturity and yield rate
        netPyOut = input.netTokenIn;
        
        IERC20(ptToken).transfer(receiver, netPyOut);
        IERC20(ytToken).transfer(receiver, netPyOut);
        
        return netPyOut;
    }

    /**
     * @dev Redeem PT + YT back to underlying token
     * @notice Burns PT and YT and returns underlying token
     */
    function redeemPyToToken(
        address receiver,
        address market,
        uint256 netPyIn,
        TokenOutput calldata output
    ) external override returns (uint256 netTokenOut) {
        // Get PT and YT token addresses
        IPendleMarket marketContract = IPendleMarket(market);
        (address ptToken, address ytToken) = marketContract.readTokens();
        
        // Transfer PT and YT from caller
        IERC20(ptToken).transferFrom(msg.sender, address(this), netPyIn);
        IERC20(ytToken).transferFrom(msg.sender, address(this), netPyIn);
        
        // Return underlying token (1:1 ratio for simplicity)
        netTokenOut = netPyIn;
        IERC20(output.tokenOut).transfer(receiver, netTokenOut);
        
        return netTokenOut;
    }

    /**
     * @dev Swap YT tokens for underlying token
     * @notice Burns YT and returns underlying token at current market rate
     */
    function swapExactYtForToken(
        address receiver,
        address market,
        uint256 exactYtIn,
        TokenOutput calldata output,
        LimitOrderData calldata /* limit */
    ) external override returns (uint256 netTokenOut) {
        // Get YT token address
        IPendleMarket marketContract = IPendleMarket(market);
        (, address ytToken) = marketContract.readTokens();
        
        // Transfer YT from caller
        IERC20(ytToken).transferFrom(msg.sender, address(this), exactYtIn);
        
        // For simplicity, return underlying at 1:1 ratio
        // In reality, this would depend on time to maturity and yield rate
        netTokenOut = exactYtIn;
        IERC20(output.tokenOut).transfer(receiver, netTokenOut);
        
        return netTokenOut;
    }
}

