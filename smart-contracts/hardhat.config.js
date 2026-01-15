require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();  // Add this line


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000, // Higher runs = smaller bytecode, more gas for execution
      },
      viaIR: true, // Enable IR-based code generation to avoid "stack too deep" errors
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    mantleTestnet: {
      url: "https://rpc.testnet.mantle.xyz",
      chainId: 5001,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    mantleMainnet: {
      url: "https://rpc.mantle.xyz",
      chainId: 5000,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    mantleSepolia: {
      url: "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Let ethers estimate gas automatically - don't set explicit limits
    },
  },
  etherscan: {
    // Use single API key for Etherscan v2 API (recommended)
    // If not set, falls back to network-specific keys for backward compatibility
    apiKey: (() => {
      const singleKey = process.env.MANTLE_API_KEY || process.env.ETHERSCAN_API_KEY;
      if (singleKey) {
        return singleKey;
      }
      // Fallback to network-specific keys (v1 API - deprecated)
      return {
        mantleTestnet: process.env.MANTLE_API_KEY || "",
        mantleMainnet: process.env.MANTLE_API_KEY || "",
        mantleSepolia: process.env.MANTLE_API_KEY || "",
      };
    })(),
    customChains: [
      {
        network: "mantleTestnet",
        chainId: 5001,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
        },
      },
      {
        network: "mantleMainnet",
        chainId: 5000,
        urls: {
          apiURL: "https://explorer.mantle.xyz/api",
          browserURL: "https://explorer.mantle.xyz",
        },
      },
      {
        network: "mantleSepolia",
        chainId: 5003,
        urls: {
          apiURL: "https://explorer.sepolia.mantle.xyz/api",
          browserURL: "https://explorer.sepolia.mantle.xyz",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

