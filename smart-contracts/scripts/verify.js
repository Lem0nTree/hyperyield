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
      console.error(`Error loading deployment state: ${error.message}`);
      return null;
    }
  }
  return null;
}

// Helper function to verify a contract
async function verifyContract(address, constructorArguments, contractName) {
  try {
    console.log(`\n  Verifying ${contractName} at ${address}...`);
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArguments,
    });
    console.log(`  ✓ ${contractName} verified successfully`);
    return true;
  } catch (error) {
    if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
      console.log(`  ℹ ${contractName} is already verified`);
      return true;
    } else {
      console.log(`  ✗ ${contractName} verification failed: ${error.message}`);
      return false;
    }
  }
}

// Helper function to read token name and symbol from contract
async function getTokenInfo(tokenAddress) {
  try {
    const token = await hre.ethers.getContractAt("MintableERC20", tokenAddress);
    const name = await token.name();
    const symbol = await token.symbol();
    return { name, symbol };
  } catch (error) {
    console.error(`  ⚠ Could not read token info from ${tokenAddress}: ${error.message}`);
    return null;
  }
}

// Helper function to read market expiry from contract
async function getMarketExpiry(marketAddress) {
  try {
    const market = await hre.ethers.getContractAt("MockPendleMarket", marketAddress);
    const expiry = await market.expiry();
    return expiry;
  } catch (error) {
    console.error(`  ⚠ Could not read expiry from ${marketAddress}: ${error.message}`);
    return null;
  }
}

async function main() {
  const network = hre.network.name;
  console.log(`\n=== Verifying Contracts on ${network} ===\n`);

  // Check if API key is set
  const apiKey = process.env.MANTLE_API_KEY || process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    console.log("⚠ Warning: No API key found in environment variables.");
    console.log("Set MANTLE_API_KEY or ETHERSCAN_API_KEY in your .env file to enable verification.");
    console.log("Continuing anyway (verification will likely fail)...\n");
  }

  // Load deployment state
  const deploymentState = loadDeploymentState(network);
  if (!deploymentState) {
    console.error(`❌ Could not load deployment state for ${network}`);
    console.error(`Expected file: deployments-${network}.json`);
    process.exit(1);
  }

  console.log("📂 Loaded deployment state:");
  console.log(`  USDY: ${deploymentState.usdy || "not set"}`);
  console.log(`  Router: ${deploymentState.router || "not set"}`);
  console.log(`  Factory: ${deploymentState.factory || "not set"}`);
  console.log(`  Markets: ${Object.keys(deploymentState.markets || {}).length} found`);

  let verifiedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // Verify MockUSDY
  if (deploymentState.usdy) {
    const success = await verifyContract(
      deploymentState.usdy,
      [], // No constructor arguments
      "MockUSDY"
    );
    if (success) verifiedCount++;
    else failedCount++;
  } else {
    console.log("\n  ⏭ Skipping MockUSDY (not in deployment state)");
    skippedCount++;
  }

  // Verify MockPendleRouter
  if (deploymentState.router) {
    const success = await verifyContract(
      deploymentState.router,
      [], // No constructor arguments
      "MockPendleRouter"
    );
    if (success) verifiedCount++;
    else failedCount++;
  } else {
    console.log("\n  ⏭ Skipping MockPendleRouter (not in deployment state)");
    skippedCount++;
  }

  // Verify MockPendleFactory
  if (deploymentState.factory) {
    const success = await verifyContract(
      deploymentState.factory,
      [], // No constructor arguments
      "MockPendleFactory"
    );
    if (success) verifiedCount++;
    else failedCount++;
  } else {
    console.log("\n  ⏭ Skipping MockPendleFactory (not in deployment state)");
    skippedCount++;
  }

  // Verify markets (PT tokens, YT tokens, and Pendle markets)
  if (deploymentState.markets && Object.keys(deploymentState.markets).length > 0) {
    console.log("\n=== Verifying Market Contracts ===");
    
    for (const [marketKey, marketInfo] of Object.entries(deploymentState.markets)) {
      console.log(`\n📦 Processing ${marketKey} market...`);

      // Verify PT Token
      if (marketInfo.ptToken) {
        console.log(`  Reading PT token info...`);
        const ptInfo = await getTokenInfo(marketInfo.ptToken);
        if (ptInfo) {
          const success = await verifyContract(
            marketInfo.ptToken,
            [ptInfo.name, ptInfo.symbol],
            `MintableERC20 (PT-${marketKey})`
          );
          if (success) verifiedCount++;
          else failedCount++;
        } else {
          console.log(`  ⚠ Skipping PT token verification (could not read info)`);
          skippedCount++;
        }
      }

      // Verify YT Token
      if (marketInfo.ytToken) {
        console.log(`  Reading YT token info...`);
        const ytInfo = await getTokenInfo(marketInfo.ytToken);
        if (ytInfo) {
          const success = await verifyContract(
            marketInfo.ytToken,
            [ytInfo.name, ytInfo.symbol],
            `MintableERC20 (YT-${marketKey})`
          );
          if (success) verifiedCount++;
          else failedCount++;
        } else {
          console.log(`  ⚠ Skipping YT token verification (could not read info)`);
          skippedCount++;
        }
      }

      // Verify MockPendleMarket
      if (marketInfo.market) {
        console.log(`  Reading market expiry...`);
        let expiry = marketInfo.maturity;
        
        // If maturity is not in JSON, try to read from contract
        if (!expiry) {
          const contractExpiry = await getMarketExpiry(marketInfo.market);
          if (contractExpiry) {
            expiry = Number(contractExpiry);
          }
        }

        if (expiry && marketInfo.ptToken && marketInfo.ytToken) {
          const success = await verifyContract(
            marketInfo.market,
            [marketInfo.ptToken, marketInfo.ytToken, expiry],
            `MockPendleMarket (${marketKey})`
          );
          if (success) verifiedCount++;
          else failedCount++;
        } else {
          console.log(`  ⚠ Skipping market verification (missing required data)`);
          if (!expiry) console.log(`    - Missing expiry/maturity`);
          if (!marketInfo.ptToken) console.log(`    - Missing PT token address`);
          if (!marketInfo.ytToken) console.log(`    - Missing YT token address`);
          skippedCount++;
        }
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Verification Summary:");
  console.log(`  ✓ Verified: ${verifiedCount}`);
  console.log(`  ✗ Failed: ${failedCount}`);
  console.log(`  ⏭ Skipped: ${skippedCount}`);
  console.log(`  📝 Total: ${verifiedCount + failedCount + skippedCount}`);
  console.log("=".repeat(50));

  if (failedCount > 0) {
    console.log("\n💡 Tips for failed verifications:");
    console.log("  - Ensure compiler settings match (optimizer, runs, viaIR)");
    console.log("  - Wait a few minutes after deployment for explorer to index");
    console.log("  - Check that API key is valid");
    console.log("  - Verify manually on explorer if needed");
    process.exit(1);
  } else {
    console.log("\n✅ All verifications completed successfully!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Script error:", error);
    process.exit(1);
  });

