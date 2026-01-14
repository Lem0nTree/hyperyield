// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPendleMarket
 * @dev Interface for Pendle Finance Market
 * @notice Provides access to market state, tokens, and expiry information
 */
interface IPendleMarket {
    /**
     * @dev Get PT and YT token addresses for this market
     * @return pt Principal Token address
     * @return yt Yield Token address
     */
    function readTokens() external view returns (address pt, address yt);

    /**
     * @dev Get the expiry/maturity date of this market
     * @return expiry Timestamp of market expiry
     */
    function expiry() external view returns (uint256 expiry);

    /**
     * @dev Read current market state
     * @return syIndex Current SY (Standardized Yield) index
     * @return pyIndex Current PY (Principal + Yield) index
     * @return totalSy Total SY in the market
     * @return totalPy Total PY in the market
     * @notice Used to calculate implied yield rate
     */
    function readState() external view returns (
        uint256 syIndex,
        uint256 pyIndex,
        uint256 totalSy,
        uint256 totalPy
    );
}

