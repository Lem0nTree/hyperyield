// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPendleFactory.sol";

/**
 * @title MockPendleFactory
 * @dev Mock Pendle Factory for testing market validation
 */
contract MockPendleFactory is IPendleFactory {
    // Mapping: (SY, PT, expiry) => market address
    mapping(address => mapping(address => mapping(uint256 => address))) public markets;
    
    // Mapping: market => isValid
    mapping(address => bool) public marketValidity;

    /**
     * @dev Register a market for testing
     */
    function registerMarket(
        address SY,
        address PT,
        uint256 expiry,
        address market
    ) external {
        markets[SY][PT][expiry] = market;
        marketValidity[market] = true;
    }

    function getMarket(
        address SY,
        address PT,
        uint256 expiry
    ) external view override returns (address market) {
        return markets[SY][PT][expiry];
    }

    function isValidMarket(address market) external view override returns (bool isValid) {
        return marketValidity[market];
    }
}

