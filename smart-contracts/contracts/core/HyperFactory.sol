// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./HyperMarket.sol";

/**
 * @title HyperFactory
 * @dev Factory for deploying and managing HyperMarket instances
 */
contract HyperFactory is Ownable {
    address public immutable pendleRouter;
    address public immutable pendleFactory;
    
    address[] public markets;
    mapping(address => bool) public isMarket;
    
    event MarketCreated(
        address indexed market,
        address indexed underlyingToken,
        uint256 minTimeLock,
        uint256 maxTimeLock,
        uint256 resolutionDate
    );

    constructor(address _pendleRouter, address _pendleFactory) Ownable(msg.sender) {
        require(_pendleRouter != address(0), "Invalid router");
        require(_pendleFactory != address(0), "Invalid factory");
        pendleRouter = _pendleRouter;
        pendleFactory = _pendleFactory;
    }

    /**
     * @dev Create a new betting market
     * @param underlyingToken Underlying token address (USDY)
     * @param minTimeLock Minimum lock period in days
     * @param maxTimeLock Maximum lock period in days
     * @param resolutionDate When betting closes and market can be resolved
     * @param oracle Oracle address for market resolution
     * @return market Address of the deployed HyperMarket
     */
    function createMarket(
        address underlyingToken,
        uint256 minTimeLock,
        uint256 maxTimeLock,
        uint256 resolutionDate,
        address oracle
    ) external returns (address market) {
        require(underlyingToken != address(0), "Invalid underlying");
        require(minTimeLock > 0 && minTimeLock <= maxTimeLock, "Invalid time locks");
        require(maxTimeLock <= 365, "Max time lock too high"); // Sanity check
        require(resolutionDate > block.timestamp, "Invalid resolution date");
        require(oracle != address(0), "Invalid oracle");
        
        // Deploy new HyperMarket
        HyperMarket newMarket = new HyperMarket(
            underlyingToken,
            pendleRouter,
            pendleFactory,
            minTimeLock,
            maxTimeLock,
            resolutionDate,
            oracle
        );
        
        market = address(newMarket);
        markets.push(market);
        isMarket[market] = true;
        
        // Transfer ownership to caller
        newMarket.transferOwnership(msg.sender);
        
        emit MarketCreated(market, underlyingToken, minTimeLock, maxTimeLock, resolutionDate);
        
        return market;
    }

    /**
     * @dev Get all market addresses
     * @return Array of market addresses
     */
    function getMarkets() external view returns (address[] memory) {
        return markets;
    }

    /**
     * @dev Get market count
     * @return Number of markets created
     */
    function getMarketCount() external view returns (uint256) {
        return markets.length;
    }
}

