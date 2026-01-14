// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPendleMarket.sol";

/**
 * @title MockPendleMarket
 * @dev Mock Pendle Market for testing with configurable yield rates
 */
contract MockPendleMarket is IPendleMarket {
    address public immutable ptToken;
    address public immutable ytToken;
    uint256 public immutable expiry;
    
    // Configurable state for yield rate calculation
    uint256 public syIndex;  // Standardized Yield index
    uint256 public pyIndex;  // Principal + Yield index
    uint256 public totalSy;
    uint256 public totalPy;

    constructor(
        address _ptToken,
        address _ytToken,
        uint256 _expiry
    ) {
        ptToken = _ptToken;
        ytToken = _ytToken;
        expiry = _expiry;
        
        // Default values (1:1 ratio, can be adjusted)
        syIndex = 1e18;
        pyIndex = 1e18;
        totalSy = 0;
        totalPy = 0;
    }

    function readTokens() external view override returns (address pt, address yt) {
        return (ptToken, ytToken);
    }

    function readState() external view override returns (
        uint256 _syIndex,
        uint256 _pyIndex,
        uint256 _totalSy,
        uint256 _totalPy
    ) {
        return (syIndex, pyIndex, totalSy, totalPy);
    }

    /**
     * @dev Set market state for yield rate calculation
     * @param _syIndex New SY index
     * @param _pyIndex New PY index
     * @notice Used to simulate different yield rates
     */
    function setState(
        uint256 _syIndex,
        uint256 _pyIndex,
        uint256 _totalSy,
        uint256 _totalPy
    ) external {
        syIndex = _syIndex;
        pyIndex = _pyIndex;
        totalSy = _totalSy;
        totalPy = _totalPy;
    }

    /**
     * @dev Set yield rate directly (annual percentage in basis points)
     * @param yieldRateBps Annual yield rate in basis points (e.g., 500 = 5%)
     * @param daysToMaturity Days until maturity
     */
    function setYieldRate(uint256 yieldRateBps, uint256 daysToMaturity) external {
        // Calculate implied PY index from yield rate
        // PY = SY * (1 + yieldRate * daysToMaturity / 365)
        // For simplicity, we set SY = 1e18 and calculate PY
        syIndex = 1e18;
        uint256 timeFactor = (daysToMaturity * 1e18) / 365;
        uint256 yieldFactor = (yieldRateBps * 1e18) / 10000;
        pyIndex = syIndex + (syIndex * yieldFactor * timeFactor) / 1e18;
    }
}

