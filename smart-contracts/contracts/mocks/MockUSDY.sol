// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDY
 * @dev Mock USDY token for testing on Sepolia
 * @notice Mints tokens to deployer on construction
 */
contract MockUSDY is ERC20 {
    constructor() ERC20("Mock USDY", "mUSDY") {
        // Mint 1,000,000 tokens to deployer
        _mint(msg.sender, 1000000 * 10**18);
    }

    /**
     * @dev Mint additional tokens (for testing purposes)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

