// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HyperStructs
 * @dev Gas-optimized packed structs for HYPER ZERO LOSS MVP
 * @notice Structs are designed to minimize storage slots while maintaining functionality
 */
library HyperStructs {
    /**
     * @dev Market configuration parameters
     * @notice Packed to optimize gas usage
     */
    struct MarketParams {
        address underlyingToken;  // USDY token address
        uint256 resolutionDate;  // When betting closes and market can be resolved
        uint256 minTimeLock;      // Minimum lock period in days
        uint256 maxTimeLock;      // Maximum lock period in days
        bool resolved;            // Whether market has been resolved
        uint8 outcome;            // 0 = Pending, 1 = YES, 2 = NO
    }

    /**
     * @dev User position data with Betting Power tracking
     * @notice Tracks user's bet across different maturities
     */
    struct Position {
        uint256 principalAmount;  // Original USDY deposited
        uint256 bettingPower;     // BP = Principal × YieldRate × Time
        uint256 maturityDate;      // Selected maturity timestamp
        uint256 ptBalance;        // PT tokens in safety chamber
        uint256 ytBalance;        // YT tokens contributed
        uint8 side;               // 1 = YES, 2 = NO
        bool claimed;             // Whether position has been claimed
    }

    /**
     * @dev Per-maturity Pendle market information
     * @notice Tracks Pendle markets for different maturity dates
     */
    struct PendleMarketInfo {
        address market;           // Pendle market address
        address ptToken;          // Principal Token address
        address ytToken;          // Yield Token address
        uint256 maturityDate;     // Maturity timestamp
        bool isActive;            // Whether this market is active
    }
}

