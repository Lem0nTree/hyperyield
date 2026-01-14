// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPendleRouter
 * @dev Interface for Pendle Finance Router V3
 * @notice Handles token swaps, PT/YT minting, and redemptions
 */
interface IPendleRouter {
    struct TokenInput {
        address tokenIn;
        uint256 netTokenIn;
        address tokenMintSy;
        address pendleSwap; // Address of swap helper (use address(0) for simple SY wraps)
        SwapData swapData;
    }

    struct SwapData {
        uint8 swapType;
        address extRouter;
        bytes extCalldata;
        bool needScale;
    }

    struct TokenOutput {
        address tokenOut;
        uint256 minTokenOut;
        address tokenRedeemSy;
        address pendleSwap;
        SwapData swapData;
    }

    struct LimitOrderData {
        address limitRouter;
        uint256 epsSkipMarket;
        bool normalFillsFirst;
        bool fillPublishModal;
        bytes adminData;
    }

    /**
     * @dev Mint PT + YT from underlying token (USDY)
     * @param receiver Address to receive the PT and YT tokens
     * @param market Pendle market address
     * @param minPyOut Minimum PY (PT+YT) tokens to receive
     * @param input Token input data
     * @return netPyOut Amount of PY tokens minted
     */
    function mintPyFromToken(
        address receiver,
        address market,
        uint256 minPyOut,
        TokenInput calldata input
    ) external returns (uint256 netPyOut);

    /**
     * @dev Redeem PT + YT back to underlying token (USDY)
     * @param receiver Address to receive the underlying token
     * @param market Pendle market address
     * @param netPyIn Amount of PY (PT+YT) tokens to redeem
     * @param output Token output data
     * @return netTokenOut Amount of underlying tokens received
     */
    function redeemPyToToken(
        address receiver,
        address market,
        uint256 netPyIn,
        TokenOutput calldata output
    ) external returns (uint256 netTokenOut);

    /**
     * @dev Swap YT tokens for underlying token
     * @param receiver Address to receive the underlying token
     * @param market Pendle market address
     * @param exactYtIn Exact amount of YT tokens to swap
     * @param output Token output data
     * @param limit Limit order data
     * @return netTokenOut Amount of underlying tokens received
     */
    function swapExactYtForToken(
        address receiver,
        address market,
        uint256 exactYtIn,
        TokenOutput calldata output,
        LimitOrderData calldata limit
    ) external returns (uint256 netTokenOut);
}

