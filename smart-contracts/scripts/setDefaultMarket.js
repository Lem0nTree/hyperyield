const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper function to load deployment state
function loadDeploymentState(network) {
  const filePath = path.join(__dirname, "..", `deployments-${network}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.log(`Warning: Could not load deployment state: ${error.message}`);
      return null;
    }
  }
  return null;
}

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log("Setting default market with account:", deployer.address);
  console.log("Network:", network);

  // Load deployment state
  const deploymentState = loadDeploymentState(network);
  if (!deploymentState || !deploymentState.hyperMarket) {
    throw new Error("HyperMarket not found in deployment state. Please deploy first.");
  }

  const hyperMarketAddress = deploymentState.hyperMarket;
  const hyperMarket = await hre.ethers.getContractAt("HyperMarket", hyperMarketAddress);

  // Get default market address (use 90D market by default, or specify via env)
  let defaultMarketAddress;
  
  if (deploymentState.markets && deploymentState.markets["90D"]) {
    defaultMarketAddress = deploymentState.markets["90D"].market;
    console.log(`Using 90D market from deployment: ${defaultMarketAddress}`);
  } else if (process.env.DEFAULT_MARKET) {
    defaultMarketAddress = process.env.DEFAULT_MARKET;
    console.log(`Using DEFAULT_MARKET from environment: ${defaultMarketAddress}`);
  } else {
    throw new Error("No default market found. Set DEFAULT_MARKET environment variable or ensure 90D market exists in deployment state.");
  }

  // Check current default market
  const currentDefault = await hyperMarket.defaultMarket();
  if (currentDefault.toLowerCase() === defaultMarketAddress.toLowerCase()) {
    console.log(`✓ Default market already set to: ${defaultMarketAddress}`);
    return;
  }

  // Set default market
  console.log(`Setting default market to: ${defaultMarketAddress}...`);
  const tx = await hyperMarket.setDefaultMarket(defaultMarketAddress);
  await tx.wait();
  
  console.log(`✓ Default market set successfully!`);
  console.log(`  HyperMarket: ${hyperMarketAddress}`);
  console.log(`  Default Market: ${defaultMarketAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

