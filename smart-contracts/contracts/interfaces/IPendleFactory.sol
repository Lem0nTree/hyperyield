// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPendleFactory
 * @dev Interface for Pendle Finance Factory
 * @notice Used to validate if a Pendle market exists for a given maturity
 */
interface IPendleFactory {
    /**
     * @dev Get market address for given parameters
     * @param SY Standardized Yield token address
     * @param PT Principal Token address
     * @param expiry Expiry timestamp
     * @return market Market address, or address(0) if not found
     */
    function getMarket(
        address SY,
        address PT,
        uint256 expiry
    ) external view returns (address market);

    /**
     * @dev Check if a market exists
     * @param market Market address to check
     * @return isValid True if market is valid
     */
    function isValidMarket(address market) external view returns (bool isValid);
}

