const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

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

// Mantle Sepolia Testnet addresses (update these with actual addresses)
const MANTLE_SEPOLIA = {
  USDY: "0x0000000000000000000000000000000000000000", // Update with actual USDY address on Sepolia
  PENDLE_ROUTER: "0x0000000000000000000000000000000000000000", // Update with actual router
  PENDLE_FACTORY: "0x0000000000000000000000000000000000000000", // Update with actual factory
};

// Helper functions for deployment state management
function getDeploymentStatePath(network) {
  // Look in the smart-contracts root directory (parent of scripts)
  return path.join(__dirname, "..", `deployments-${network}.json`);
}

function loadDeploymentState(network) {
  const filePath = getDeploymentStatePath(network);
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

function saveDeploymentState(network, state, silent = false) {
  const filePath = getDeploymentStatePath(network);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  if (!silent) {
    console.log(`💾 State saved`);
  }
}

async function isContractDeployed(address) {
  if (!address || address === "0x0000000000000000000000000000000000000000") {
    return false;
  }
  try {
    const code = await hre.ethers.provider.getCode(address);
    return code && code !== "0x";
  } catch (error) {
    return false;
  }
}

async function checkContractSize(contractFactory, contractName) {
  try {
    const deployTx = await contractFactory.getDeployTransaction();
    const bytecode = deployTx.data;
    const bytecodeSize = (bytecode.length - 2) / 2; // Remove '0x' prefix, divide by 2 for bytes
    
    console.log(`  ${contractName} bytecode size: ${bytecodeSize} bytes (limit: 24576 bytes)`);
    
    if (bytecodeSize > 24576) {
      throw new Error(`Contract ${contractName} exceeds size limit! Size: ${bytecodeSize} bytes`);
    }
    
    // Calculate intrinsic gas: 32000 + 200 * bytecode_size
    const intrinsicGas = 32000 + (200 * bytecodeSize);
    console.log(`  Intrinsic gas needed: ${intrinsicGas.toLocaleString()}`);
    
    return { bytecodeSize, intrinsicGas };
  } catch (error) {
    console.error(`  Could not check contract size: ${error.message}`);
    return null;
  }
}

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log("Network:", network);

  // Get addresses based on network
  let addresses;
  let useMocks = false;
  let pendleMarkets = []; // Store deployed Pendle markets for later registration
  if (network === "mantleTestnet" || network === "hardhat") {
    addresses = MANTLE_TESTNET;
  } else if (network === "mantleMainnet") {
    addresses = MANTLE_MAINNET;
  } else if (network === "mantleSepolia") {
    addresses = MANTLE_SEPOLIA;
    useMocks = true; // Use mocks for Sepolia
  } else {
    throw new Error(`Unknown network: ${network}`);
  }

  // Deploy mocks for Sepolia
  if (useMocks) {
    console.log("\n=== Deploying Mock Contracts for Sepolia ===");
    
    // Load existing deployment state
    let deploymentState = loadDeploymentState(network);
    if (deploymentState) {
      console.log("📂 Loaded deployment state from file");
      console.log("  USDY:", deploymentState.usdy || "not set");
      console.log("  Router:", deploymentState.router || "not set");
      console.log("  Factory:", deploymentState.factory || "not set");
      console.log("  Markets:", Object.keys(deploymentState.markets || {}).length, "deployed");
    } else {
      console.log("📝 No existing deployment state found, starting fresh");
      deploymentState = {
        usdy: null,
        router: null,
        factory: null,
        markets: {},
        hyperFactory: null,
        hyperMarket: null
      };
    }
    
    // Deploy or reuse MockUSDY
    console.log("\n1. Checking MockUSDY...");
    let usdyAddress = deploymentState.usdy;
    if (usdyAddress) {
      console.log(`  Checking if contract exists at ${usdyAddress}...`);
      const isDeployed = await isContractDeployed(usdyAddress);
      if (isDeployed) {
        console.log("  ✓ MockUSDY already deployed at:", usdyAddress);
      } else {
        console.log("  ⚠ Contract not found at saved address, deploying new one...");
        const MockUSDY = await hre.ethers.getContractFactory("MockUSDY");
        const mockUSDY = await MockUSDY.deploy();
        await mockUSDY.waitForDeployment();
        usdyAddress = await mockUSDY.getAddress();
        console.log("  ✓ MockUSDY deployed to:", usdyAddress);
        deploymentState.usdy = usdyAddress;
      }
    } else {
      console.log("  Deploying MockUSDY...");
      const MockUSDY = await hre.ethers.getContractFactory("MockUSDY");
      
      try {
        // Check contract size first
        await checkContractSize(MockUSDY, "MockUSDY");
        
        // Try to estimate gas first to catch any issues
        const deployTx = await MockUSDY.getDeployTransaction();
        let estimatedGas;
        try {
          estimatedGas = await deployer.estimateGas(deployTx);
          console.log(`  Estimated gas: ${estimatedGas.toString()}`);
          
          // Sanity check - if gas is unreasonably high, something is wrong
          if (estimatedGas > 10000000n) { // 10M gas
            throw new Error(`Gas estimation too high (${estimatedGas.toString()}). This usually means the transaction would revert.`);
          }
        } catch (gasError) {
          console.error("  ⚠ Gas estimation failed:", gasError.message);
          console.error("  This usually means the transaction would revert.");
          console.error("  Common causes:");
          console.error("    - Constructor logic error");
          console.error("    - Insufficient balance for constructor operations");
          console.error("    - Network/RPC issue");
          throw gasError;
        }
        
        // Deploy without explicit gas limit - let ethers estimate
        const mockUSDY = await MockUSDY.deploy();
        await mockUSDY.waitForDeployment();
        usdyAddress = await mockUSDY.getAddress();
        console.log("  ✓ MockUSDY deployed to:", usdyAddress);
        deploymentState.usdy = usdyAddress;
        saveDeploymentState(network, deploymentState, true); // Save immediately (silent)
      } catch (error) {
        console.error("  ✗ Deployment failed!");
        console.error("  Error:", error.message);
        
        // Check if it's a gas estimation error
        if (error.message.includes("gas") || error.message.includes("revert") || error.message.includes("intrinsic")) {
          console.error("\n  💡 Diagnosis:");
          if (error.message.includes("intrinsic gas")) {
            console.error("  - 'Intrinsic gas too low' usually means:");
            console.error("    * Contract bytecode is too large (check compilation)");
            console.error("    * Network is misinterpreting the transaction");
            console.error("    * RPC node issue");
          } else if (error.message.includes("revert")) {
            console.error("  - Transaction would revert, check:");
            console.error("    * Constructor logic");
            console.error("    * Initial state requirements");
          }
          console.error("\n  🔧 Try:");
          console.error("  - Recompiling: npm run compile");
          console.error("  - Checking contract constructor logic");
          console.error("  - Verifying network connection");
          console.error("  - Checking account balance");
        }
        throw error;
      }
    }
    addresses.USDY = usdyAddress;

    // Deploy or reuse MockPendleRouter
    console.log("\n2. Checking MockPendleRouter...");
    let routerAddress = deploymentState.router;
    let mockPendleRouter;
    if (routerAddress) {
      console.log(`  Checking if contract exists at ${routerAddress}...`);
      const isDeployed = await isContractDeployed(routerAddress);
      if (isDeployed) {
        console.log("  ✓ MockPendleRouter already deployed at:", routerAddress);
        mockPendleRouter = await hre.ethers.getContractAt("MockPendleRouter", routerAddress);
      } else {
        console.log("  ⚠ Contract not found at saved address, deploying new one...");
        const MockPendleRouter = await hre.ethers.getContractFactory("MockPendleRouter");
        mockPendleRouter = await MockPendleRouter.deploy();
        await mockPendleRouter.waitForDeployment();
        routerAddress = await mockPendleRouter.getAddress();
        console.log("  ✓ MockPendleRouter deployed to:", routerAddress);
        deploymentState.router = routerAddress;
      }
    } else {
      console.log("  Deploying MockPendleRouter...");
      const MockPendleRouter = await hre.ethers.getContractFactory("MockPendleRouter");
      
      // Deploy without explicit gas limit - let ethers estimate
      mockPendleRouter = await MockPendleRouter.deploy();
      await mockPendleRouter.waitForDeployment();
      routerAddress = await mockPendleRouter.getAddress();
      console.log("  ✓ MockPendleRouter deployed to:", routerAddress);
      deploymentState.router = routerAddress;
      saveDeploymentState(network, deploymentState, true); // Save immediately (silent)
    }
    addresses.PENDLE_ROUTER = routerAddress;

    // Deploy or reuse MockPendleFactory
    console.log("\n3. Checking MockPendleFactory...");
    let factoryAddress = deploymentState.factory;
    let mockPendleFactory;
    if (factoryAddress) {
      console.log(`  Checking if contract exists at ${factoryAddress}...`);
      const isDeployed = await isContractDeployed(factoryAddress);
      if (isDeployed) {
        console.log("  ✓ MockPendleFactory already deployed at:", factoryAddress);
        mockPendleFactory = await hre.ethers.getContractAt("MockPendleFactory", factoryAddress);
      } else {
        console.log("  ⚠ Contract not found at saved address, deploying new one...");
        const MockPendleFactory = await hre.ethers.getContractFactory("MockPendleFactory");
        mockPendleFactory = await MockPendleFactory.deploy();
        await mockPendleFactory.waitForDeployment();
        factoryAddress = await mockPendleFactory.getAddress();
        console.log("  ✓ MockPendleFactory deployed to:", factoryAddress);
        deploymentState.factory = factoryAddress;
      }
    } else {
      console.log("  Deploying MockPendleFactory...");
      const MockPendleFactory = await hre.ethers.getContractFactory("MockPendleFactory");
      mockPendleFactory = await MockPendleFactory.deploy();
      await mockPendleFactory.waitForDeployment();
      factoryAddress = await mockPendleFactory.getAddress();
      console.log("  ✓ MockPendleFactory deployed to:", factoryAddress);
      deploymentState.factory = factoryAddress;
      saveDeploymentState(network, deploymentState, true); // Save immediately (silent)
    }
    addresses.PENDLE_FACTORY = factoryAddress;

    // Create PT/YT token pairs and markets for common maturities
    console.log("\n4. Creating PT/YT tokens and Pendle markets...");
    const MintableERC20 = await hre.ethers.getContractFactory("MintableERC20");
    const MockPendleMarket = await hre.ethers.getContractFactory("MockPendleMarket");
    
    const maturities = [30, 90, 180, 365]; // Days

    for (const days of maturities) {
      let maturityTimestamp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
      const marketKey = `${days}D`;
      
      // Check if market already exists
      let marketInfo = deploymentState.markets[marketKey];
      let ptAddress, ytAddress, marketAddress;
      let ptToken, ytToken, pendleMarket;
      
      if (marketInfo && 
          marketInfo.ptToken &&
          marketInfo.ytToken &&
          marketInfo.market &&
          await isContractDeployed(marketInfo.ptToken) &&
          await isContractDeployed(marketInfo.ytToken) &&
          await isContractDeployed(marketInfo.market)) {
        console.log(`  ✓ Market for ${days} days already deployed:`);
        console.log(`    PT Token: ${marketInfo.ptToken}`);
        console.log(`    YT Token: ${marketInfo.ytToken}`);
        console.log(`    Market: ${marketInfo.market}`);
        
        ptAddress = marketInfo.ptToken;
        ytAddress = marketInfo.ytToken;
        marketAddress = marketInfo.market;
        
        // Get contract instances
        ptToken = await hre.ethers.getContractAt("MintableERC20", ptAddress);
        ytToken = await hre.ethers.getContractAt("MintableERC20", ytAddress);
        pendleMarket = await hre.ethers.getContractAt("MockPendleMarket", marketAddress);
        
        // Get the actual maturity timestamp from the market contract
        const actualMaturity = await pendleMarket.expiry();
        if (actualMaturity > 0) {
          maturityTimestamp = Number(actualMaturity);
        }
        
        // Ensure router is minter (in case it wasn't set before)
        try {
          const isMinter = await ptToken.minters(routerAddress);
          if (!isMinter) {
            console.log(`    Setting router as minter for PT token...`);
            await ptToken.addMinter(routerAddress);
          }
        } catch (e) {
          // If already minter or other error, continue
        }
        
        try {
          const isMinter = await ytToken.minters(routerAddress);
          if (!isMinter) {
            console.log(`    Setting router as minter for YT token...`);
            await ytToken.addMinter(routerAddress);
          }
        } catch (e) {
          // If already minter or other error, continue
        }
      } else {
        console.log(`  Deploying market for ${days} days...`);
        
        // Deploy PT token
        ptToken = await MintableERC20.deploy(
          `PT-USDY-${days}D`,
          `PT-${days}D`
        );
        await ptToken.waitForDeployment();
        ptAddress = await ptToken.getAddress();
        
        // Deploy YT token
        ytToken = await MintableERC20.deploy(
          `YT-USDY-${days}D`,
          `YT-${days}D`
        );
        await ytToken.waitForDeployment();
        ytAddress = await ytToken.getAddress();
        
        // Set router as minter for both tokens
        await ptToken.addMinter(routerAddress);
        await ytToken.addMinter(routerAddress);
        
        // Deploy MockPendleMarket
        pendleMarket = await MockPendleMarket.deploy(
          ptAddress,
          ytAddress,
          maturityTimestamp
        );
        await pendleMarket.waitForDeployment();
        marketAddress = await pendleMarket.getAddress();
        
        // Set yield rate (5% annual for simplicity)
        await pendleMarket.setYieldRate(500, days);
        
        // Save to state
        marketInfo = {
          ptToken: ptAddress,
          ytToken: ytAddress,
          market: marketAddress,
          maturity: maturityTimestamp
        };
        deploymentState.markets[marketKey] = marketInfo;
        saveDeploymentState(network, deploymentState, true); // Save immediately after each market (silent)
        
        console.log(`  ✓ Created market for ${days} days:`);
        console.log(`    PT Token: ${ptAddress}`);
        console.log(`    YT Token: ${ytAddress}`);
        console.log(`    Market: ${marketAddress}`);
      }
      
      // Register market in factory (idempotent - will skip if already registered)
      try {
        const isRegistered = await mockPendleFactory.isValidMarket(marketAddress);
        if (!isRegistered) {
          await mockPendleFactory.registerMarket(
            usdyAddress,
            ptAddress,
            maturityTimestamp,
            marketAddress
          );
          console.log(`    Registered in factory`);
        } else {
          console.log(`    Already registered in factory`);
        }
      } catch (e) {
        // Try to register anyway (might fail if already registered, that's ok)
        try {
          await mockPendleFactory.registerMarket(
            usdyAddress,
            ptAddress,
            maturityTimestamp,
            marketAddress
          );
        } catch (e2) {
          // Ignore if already registered
        }
      }
      
      pendleMarkets.push({
        days,
        maturity: maturityTimestamp,
        ptToken: ptAddress,
        ytToken: ytAddress,
        market: marketAddress
      });
    }
    
    // Final save of deployment state (redundant but ensures everything is saved)
    saveDeploymentState(network, deploymentState);

    console.log("\n✅ Mock ecosystem deployed!");
    console.log("\nMock Contract Addresses:");
    console.log("  USDY:", addresses.USDY);
    console.log("  Pendle Router:", addresses.PENDLE_ROUTER);
    console.log("  Pendle Factory:", addresses.PENDLE_FACTORY);
  }

  // Validate addresses
  if (addresses.USDY === "0x0000000000000000000000000000000000000000") {
    throw new Error("USDY address not set. For Sepolia, mocks should have been deployed above.");
  }
  if (addresses.PENDLE_ROUTER === "0x0000000000000000000000000000000000000000") {
    throw new Error("Pendle Router address not set. For Sepolia, mocks should have been deployed above.");
  }
  if (addresses.PENDLE_FACTORY === "0x0000000000000000000000000000000000000000") {
    throw new Error("Pendle Factory address not set. For Sepolia, mocks should have been deployed above.");
  }

  // Deploy HyperFactory
  console.log("\n=== Deploying HyperWin Contracts ===");
  
  // Load deployment state for HyperFactory and HyperMarket
  let deploymentState = loadDeploymentState(network);
  if (!deploymentState) {
    deploymentState = {
      usdy: null,
      router: null,
      factory: null,
      markets: {},
      hyperFactory: null,
      hyperMarket: null
    };
  }
  
  console.log("\n1. Deploying HyperFactory...");
  let factoryAddress = deploymentState.hyperFactory;
  let hyperFactory;
  
  if (factoryAddress) {
    console.log(`  Checking if contract exists at ${factoryAddress}...`);
    const isDeployed = await isContractDeployed(factoryAddress);
    if (isDeployed) {
      console.log("  ✓ HyperFactory already deployed at:", factoryAddress);
      hyperFactory = await hre.ethers.getContractAt("HyperFactory", factoryAddress);
    } else {
      console.log("  ⚠ Contract not found at saved address, deploying new one...");
      const HyperFactory = await hre.ethers.getContractFactory("HyperFactory");
      hyperFactory = await HyperFactory.deploy(
        addresses.PENDLE_ROUTER,
        addresses.PENDLE_FACTORY
      );
      await hyperFactory.waitForDeployment();
      factoryAddress = await hyperFactory.getAddress();
      console.log("HyperFactory deployed to:", factoryAddress);
      deploymentState.hyperFactory = factoryAddress;
      saveDeploymentState(network, deploymentState, true);
    }
  } else {
    const HyperFactory = await hre.ethers.getContractFactory("HyperFactory");
    hyperFactory = await HyperFactory.deploy(
      addresses.PENDLE_ROUTER,
      addresses.PENDLE_FACTORY
    );
    await hyperFactory.waitForDeployment();
    factoryAddress = await hyperFactory.getAddress();
    console.log("HyperFactory deployed to:", factoryAddress);
    deploymentState.hyperFactory = factoryAddress;
    saveDeploymentState(network, deploymentState, true);
  }

  // Create a test market
  console.log("\n2. Creating test market...");
  let marketAddress = deploymentState.hyperMarket;
  let hyperMarket;
  
  if (marketAddress) {
    console.log(`  Checking if contract exists at ${marketAddress}...`);
    const isDeployed = await isContractDeployed(marketAddress);
    if (isDeployed) {
      console.log("  ✓ HyperMarket already deployed at:", marketAddress);
      hyperMarket = await hre.ethers.getContractAt("HyperMarket", marketAddress);
    } else {
      console.log("  ⚠ Contract not found at saved address, creating new one...");
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
      if (marketCreatedEvent) {
        marketAddress = marketCreatedEvent.args[0];
      } else {
        // Fallback: get from factory
        const markets = await hyperFactory.getMarkets();
        marketAddress = markets[0];
      }
      console.log("HyperMarket deployed to:", marketAddress);
      deploymentState.hyperMarket = marketAddress;
      saveDeploymentState(network, deploymentState, true);
      hyperMarket = await hre.ethers.getContractAt("HyperMarket", marketAddress);
    }
  } else {
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
    if (marketCreatedEvent) {
      marketAddress = marketCreatedEvent.args[0];
    } else {
      // Fallback: get from factory
      const markets = await hyperFactory.getMarkets();
      marketAddress = markets[0];
    }
    console.log("HyperMarket deployed to:", marketAddress);
    deploymentState.hyperMarket = marketAddress;
    saveDeploymentState(network, deploymentState, true);
    hyperMarket = await hre.ethers.getContractAt("HyperMarket", marketAddress);
  }

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
    
    // Check if API key is set
    const apiKey = process.env.MANTLE_API_KEY || process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      console.log("  ⚠ Warning: No API key found in environment variables.");
      console.log("  Set MANTLE_API_KEY or ETHERSCAN_API_KEY in your .env file to enable verification.");
      console.log("  Skipping verification...");
    } else {
      try {
        console.log("  Verifying HyperFactory...");
        await hre.run("verify:verify", {
          address: factoryAddress,
          constructorArguments: [addresses.PENDLE_ROUTER, addresses.PENDLE_FACTORY],
        });
        console.log("  ✓ Factory verified");

        console.log("  Verifying HyperMarket...");
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
        console.log("  ✓ Market verified");
      } catch (error) {
        console.log("  ✗ Verification failed:", error.message);
        if (error.message.includes("Unexpected token") || error.message.includes("<html>")) {
          console.log("\n  💡 This error usually means:");
          console.log("     - The API endpoint URL is incorrect");
          console.log("     - The API key is invalid or expired");
          console.log("     - The explorer API is temporarily unavailable");
          console.log("\n  🔧 Try:");
          console.log("     1. Verify your MANTLE_API_KEY is correct");
          console.log("     2. Check the explorer website for the correct API endpoint");
          console.log("     3. Wait a few minutes and try again");
          console.log("     4. Verify manually on the explorer website if needed");
        } else if (error.message.includes("Already Verified")) {
          console.log("  ℹ Contract is already verified on the explorer");
        } else {
          console.log("  💡 Common causes:");
          console.log("     - Compiler settings mismatch (check optimizer settings)");
          console.log("     - Constructor arguments mismatch");
          console.log("     - Contract not yet indexed by explorer (wait a few minutes)");
        }
      }
    }
  }

  // If using mocks, register Pendle markets automatically
  if (useMocks && typeof pendleMarkets !== 'undefined' && pendleMarkets.length > 0) {
    console.log("\n5. Registering Pendle markets in HyperMarket...");
    for (const pm of pendleMarkets) {
      try {
        // Check if market is already registered
        const marketInfo = await hyperMarket.pendleMarkets(pm.maturity);
        if (marketInfo.market !== "0x0000000000000000000000000000000000000000") {
          console.log(`  ✓ ${pm.days}-day market already registered: ${pm.market}`);
          continue;
        }
        
        // Register the market and wait for confirmation
        console.log(`  Registering ${pm.days}-day market: ${pm.market}...`);
        const tx = await hyperMarket.registerPendleMarket(pm.maturity, pm.market);
        await tx.wait(); // Wait for transaction to be mined
        console.log(`  ✓ Registered ${pm.days}-day market: ${pm.market}`);
        
        // Small delay to avoid nonce issues
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        if (error.message.includes("Already registered") || error.message.includes("nonce")) {
          console.log(`  ⚠ ${pm.days}-day market registration skipped: ${error.message}`);
        } else {
          console.error(`  ✗ Failed to register ${pm.days}-day market: ${error.message}`);
          // Don't throw - continue with other markets
        }
      }
    }
    
    // Set default market (use 90D market as default)
    console.log("\n6. Setting default market for bypass mode...");
    try {
      const defaultMarket90D = pendleMarkets.find(pm => pm.days === 90);
      if (defaultMarket90D) {
        const currentDefault = await hyperMarket.defaultMarket();
        if (currentDefault === "0x0000000000000000000000000000000000000000") {
          console.log(`  Setting default market to 90D: ${defaultMarket90D.market}...`);
          const tx = await hyperMarket.setDefaultMarket(defaultMarket90D.market);
          await tx.wait();
          console.log(`  ✓ Default market set to: ${defaultMarket90D.market}`);
        } else {
          console.log(`  ✓ Default market already set: ${currentDefault}`);
        }
      } else {
        console.log("  ⚠ Warning: 90D market not found, default market not set");
        console.log("  You can set it manually using: hyperMarket.setDefaultMarket(marketAddress)");
      }
    } catch (error) {
      console.error(`  ✗ Failed to set default market: ${error.message}`);
      console.log("  You can set it manually using: hyperMarket.setDefaultMarket(marketAddress)");
    }
  }

  console.log("\n✅ Deployment complete!");
  console.log("\nNext steps:");
  if (!useMocks) {
    console.log("  1. Register Pendle markets for desired maturities using registerPendleMarket()");
    console.log("  2. Set default market using setDefaultMarket() for bypass mode");
  }
  console.log("  3. Set oracle address if different from deployer");
  console.log("  4. Users can now deposit with custom time locks (bypass mode enabled)");
  
  if (useMocks) {
    console.log("\n📝 Note: Using mock contracts for Sepolia testnet");
    console.log("   - MockUSDY: Mints tokens to deployer");
    console.log("   - MockPendleRouter: Splits USDY into PT+YT tokens");
    console.log("   - Pendle markets registered for 30, 90, 180, and 365 days");
    console.log("   - BYPASS MODE: Default market set, maturity validation bypassed");
    console.log("   - PT tokens are sent to users, YT tokens stay in contract");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

