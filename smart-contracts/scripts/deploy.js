const hre = require("hardhat");

// Mantle Testnet addresses (update these with actual addresses)
const MANTLE_TESTNET = {
  USDY: "0x5bE26527e817999639B6811Ae877a976FD2E9d56", // Example - verify actual address
  PENDLE_ROUTER: "0x0000000000000000000000000000000000000000", // Update with actual router
  PENDLE_FACTORY: "0x0000000000000000000000000000000000000000", // Update with actual factory
};

// Mantle Mainnet addresses (update these with actual addresses)
const MANTLE_MAINNET = {
  USDY: "0x5bE26527e817999639B6811Ae877a976FD2E9d56", // Example - verify actual address
  PENDLE_ROUTER: "0x0000000000000000000000000000000000000000", // Update with actual router
  PENDLE_FACTORY: "0x0000000000000000000000000000000000000000", // Update with actual factory
};

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log("Network:", network);

  // Get addresses based on network
  let addresses;
  if (network === "mantleTestnet" || network === "hardhat") {
    addresses = MANTLE_TESTNET;
  } else if (network === "mantleMainnet") {
    addresses = MANTLE_MAINNET;
  } else {
    throw new Error(`Unknown network: ${network}`);
  }

  // Deploy HyperFactory
  console.log("\n1. Deploying HyperFactory...");
  const HyperFactory = await hre.ethers.getContractFactory("HyperFactory");
  const hyperFactory = await HyperFactory.deploy(
    addresses.PENDLE_ROUTER,
    addresses.PENDLE_FACTORY
  );
  await hyperFactory.waitForDeployment();
  const factoryAddress = await hyperFactory.getAddress();
  console.log("HyperFactory deployed to:", factoryAddress);

  // Create a test market
  console.log("\n2. Creating test market...");
  const minTimeLock = 30; // 30 days
  const maxTimeLock = 365; // 365 days
  const resolutionDate = Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60; // 60 days from now
  const oracle = deployer.address; // Use deployer as oracle for testing

  const tx = await hyperFactory.createMarket(
    addresses.USDY,
    minTimeLock,
    maxTimeLock,
    resolutionDate,
    oracle
  );
  const receipt = await tx.wait();

  // Get market address from event
  const marketCreatedEvent = receipt.logs.find(
    (log) => log.fragment && log.fragment.name === "MarketCreated"
  );
  let marketAddress;
  if (marketCreatedEvent) {
    marketAddress = marketCreatedEvent.args[0];
  } else {
    // Fallback: get from factory
    const markets = await hyperFactory.getMarkets();
    marketAddress = markets[0];
  }
  console.log("HyperMarket deployed to:", marketAddress);

  const hyperMarket = await hre.ethers.getContractAt("HyperMarket", marketAddress);

  // Display market info
  console.log("\n3. Market Configuration:");
  const marketParams = await hyperMarket.market();
  console.log("  Underlying Token:", marketParams.underlyingToken);
  console.log("  Min Time Lock:", marketParams.minTimeLock.toString(), "days");
  console.log("  Max Time Lock:", marketParams.maxTimeLock.toString(), "days");
  console.log("  Resolution Date:", new Date(Number(marketParams.resolutionDate) * 1000).toISOString());
  console.log("  Oracle:", await hyperMarket.oracle());

  console.log("\n4. Deployment Summary:");
  console.log("  Factory:", factoryAddress);
  console.log("  Market:", marketAddress);
  console.log("  Network:", network);

  // Verify contracts if on testnet/mainnet
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\n5. Verifying contracts...");
    try {
      await hre.run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [addresses.PENDLE_ROUTER, addresses.PENDLE_FACTORY],
      });
      console.log("  Factory verified");

      await hre.run("verify:verify", {
        address: marketAddress,
        constructorArguments: [
          addresses.USDY,
          addresses.PENDLE_ROUTER,
          addresses.PENDLE_FACTORY,
          minTimeLock,
          maxTimeLock,
          resolutionDate,
          oracle,
        ],
      });
      console.log("  Market verified");
    } catch (error) {
      console.log("  Verification failed:", error.message);
    }
  }

  console.log("\n✅ Deployment complete!");
  console.log("\nNext steps:");
  console.log("  1. Register Pendle markets for desired maturities using registerPendleMarket()");
  console.log("  2. Set oracle address if different from deployer");
  console.log("  3. Users can now deposit with custom time locks");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

