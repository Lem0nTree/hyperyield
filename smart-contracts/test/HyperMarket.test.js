const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("HyperMarket", function () {
  let hyperMarket;
  let hyperFactory;
  let underlyingToken;
  let mockPendleRouter;
  let mockPendleFactory;
  let mockPendleMarket1; // 30 days
  let mockPendleMarket2; // 90 days
  let ptToken1, ytToken1;
  let ptToken2, ytToken2;
  let owner;
  let oracle;
  let user1, user2, user3;

  const MIN_TIME_LOCK = 30;
  const MAX_TIME_LOCK = 365;
  const RESOLUTION_DATE_OFFSET = 60 * 24 * 60 * 60; // 60 days from now

  beforeEach(async function () {
    [owner, oracle, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    underlyingToken = await MockERC20.deploy("USDY", "USDY");
    ptToken1 = await MockERC20.deploy("PT-USDY-30D", "PT-30D");
    ytToken1 = await MockERC20.deploy("YT-USDY-30D", "YT-30D");
    ptToken2 = await MockERC20.deploy("PT-USDY-90D", "PT-90D");
    ytToken2 = await MockERC20.deploy("YT-USDY-90D", "YT-90D");

    // Deploy mock Pendle contracts
    const MockPendleMarket = await ethers.getContractFactory("MockPendleMarket");
    const MockPendleRouter = await ethers.getContractFactory("MockPendleRouter");
    const MockPendleFactory = await ethers.getContractFactory("MockPendleFactory");

    mockPendleRouter = await MockPendleRouter.deploy();
    mockPendleFactory = await MockPendleFactory.deploy();

    // Create markets for different maturities
    const maturity1 = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days
    const maturity2 = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days

    mockPendleMarket1 = await MockPendleMarket.deploy(ptToken1.address, ytToken1.address, maturity1);
    mockPendleMarket2 = await MockPendleMarket.deploy(ptToken2.address, ytToken2.address, maturity2);

    // Register markets in factory
    await mockPendleFactory.registerMarket(
      underlyingToken.address,
      ptToken1.address,
      maturity1,
      mockPendleMarket1.address
    );
    await mockPendleFactory.registerMarket(
      underlyingToken.address,
      ptToken2.address,
      maturity2,
      mockPendleMarket2.address
    );

    // Set yield rates (5% annual for market1, 6% for market2)
    await mockPendleMarket1.setYieldRate(500, 30); // 5% annual, 30 days
    await mockPendleMarket2.setYieldRate(600, 90); // 6% annual, 90 days

    // Deploy factory
    const HyperFactory = await ethers.getContractFactory("HyperFactory");
    hyperFactory = await HyperFactory.deploy(mockPendleRouter.address, mockPendleFactory.address);

    // Create market
    const resolutionDate = Math.floor(Date.now() / 1000) + RESOLUTION_DATE_OFFSET;
    await hyperFactory.createMarket(
      underlyingToken.address,
      MIN_TIME_LOCK,
      MAX_TIME_LOCK,
      resolutionDate,
      oracle.address
    );

    const markets = await hyperFactory.getMarkets();
    const marketAddress = markets[0];

    hyperMarket = await ethers.getContractAt("HyperMarket", marketAddress);

    // Register Pendle markets in HyperMarket
    await hyperMarket.registerPendleMarket(maturity1, mockPendleMarket1.address);
    await hyperMarket.registerPendleMarket(maturity2, mockPendleMarket2.address);

    // Mint tokens to users
    await underlyingToken.mint(user1.address, ethers.parseEther("10000"));
    await underlyingToken.mint(user2.address, ethers.parseEther("10000"));
    await underlyingToken.mint(user3.address, ethers.parseEther("10000"));

    // Mint PT/YT tokens to router (for mock to work)
    await ptToken1.mint(mockPendleRouter.address, ethers.parseEther("1000000"));
    await ytToken1.mint(mockPendleRouter.address, ethers.parseEther("1000000"));
    await ptToken2.mint(mockPendleRouter.address, ethers.parseEther("1000000"));
    await ytToken2.mint(mockPendleRouter.address, ethers.parseEther("1000000"));
  });

  describe("Deployment", function () {
    it("Should set correct parameters", async function () {
      expect(await hyperMarket.underlyingToken()).to.equal(underlyingToken.address);
      expect(await hyperMarket.oracle()).to.equal(oracle.address);
      const marketParams = await hyperMarket.market();
      expect(marketParams.minTimeLock).to.equal(MIN_TIME_LOCK);
      expect(marketParams.maxTimeLock).to.equal(MAX_TIME_LOCK);
    });
  });

  describe("Deposit", function () {
    it("Should allow deposit with valid time lock", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount);

      await expect(
        hyperMarket.connect(user1).deposit(amount, 30, 1) // 30 days, YES
      ).to.emit(hyperMarket, "Deposited");

      const position = await hyperMarket.positions(user1.address);
      expect(position.principalAmount).to.equal(amount);
      expect(position.side).to.equal(1);
    });

    it("Should reject deposit with time lock below minimum", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount);

      await expect(
        hyperMarket.connect(user1).deposit(amount, MIN_TIME_LOCK - 1, 1)
      ).to.be.revertedWith("Invalid time lock");
    });

    it("Should reject deposit with time lock above maximum", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount);

      await expect(
        hyperMarket.connect(user1).deposit(amount, MAX_TIME_LOCK + 1, 1)
      ).to.be.revertedWith("Invalid time lock");
    });

    it("Should calculate BP correctly", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount);

      await hyperMarket.connect(user1).deposit(amount, 30, 1);

      const position = await hyperMarket.positions(user1.address);
      expect(position.bettingPower).to.be.gt(0);
      
      // BP = 1000 * (0.05 / 10000) * (30 / 365) = 1000 * 0.0005 * 0.08219 ≈ 0.0411
      // With 1e18 precision, this should be around 0.0411 * 1e18
      expect(position.bettingPower).to.be.gt(ethers.parseEther("0.04"));
    });

    it("Should allow multiple deposits with different maturities", async function () {
      const amount1 = ethers.parseEther("1000");
      const amount2 = ethers.parseEther("500");
      
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount1 + amount2);

      await hyperMarket.connect(user1).deposit(amount1, 30, 1);
      await hyperMarket.connect(user1).deposit(amount2, 90, 1);

      const position = await hyperMarket.positions(user1.address);
      expect(position.principalAmount).to.equal(amount1 + amount2);
    });

    it("Should reject deposit on different side if user already has position", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount * 2n);

      await hyperMarket.connect(user1).deposit(amount, 30, 1);

      await expect(
        hyperMarket.connect(user1).deposit(amount, 30, 2)
      ).to.be.revertedWith("Cannot hedge");
    });
  });

  describe("Resolution", function () {
    it("Should allow oracle to resolve market", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount);
      await hyperMarket.connect(user1).deposit(amount, 30, 1);

      // Fast forward to resolution date
      const resolutionDate = (await hyperMarket.market()).resolutionDate;
      await time.increaseTo(resolutionDate);

      await expect(hyperMarket.connect(oracle).resolveMarket(1))
        .to.emit(hyperMarket, "Resolved")
        .withArgs(1);

      const marketParams = await hyperMarket.market();
      expect(marketParams.resolved).to.be.true;
      expect(marketParams.outcome).to.equal(1);
    });

    it("Should reject resolution from non-oracle", async function () {
      const resolutionDate = (await hyperMarket.market()).resolutionDate;
      await time.increaseTo(resolutionDate);

      await expect(
        hyperMarket.connect(user1).resolveMarket(1)
      ).to.be.revertedWith("Not oracle");
    });

    it("Should reject resolution before resolution date", async function () {
      await expect(
        hyperMarket.connect(oracle).resolveMarket(1)
      ).to.be.revertedWith("Too early");
    });
  });

  describe("Claim - Token Mode", function () {
    beforeEach(async function () {
      // Setup: user1 and user2 bet YES, user3 bets NO
      const amount1 = ethers.parseEther("1000");
      const amount2 = ethers.parseEther("500");
      const amount3 = ethers.parseEther("800");

      await underlyingToken.connect(user1).approve(hyperMarket.address, amount1);
      await underlyingToken.connect(user2).approve(hyperMarket.address, amount2);
      await underlyingToken.connect(user3).approve(hyperMarket.address, amount3);

      await hyperMarket.connect(user1).deposit(amount1, 30, 1); // YES, 30 days
      await hyperMarket.connect(user2).deposit(amount2, 90, 1); // YES, 90 days
      await hyperMarket.connect(user3).deposit(amount3, 30, 2); // NO, 30 days

      // Resolve with YES winning
      const resolutionDate = (await hyperMarket.market()).resolutionDate;
      await time.increaseTo(resolutionDate);
      await hyperMarket.connect(oracle).resolveMarket(1);
    });

    it("Should allow winner to claim tokens", async function () {
      const ptBalanceBefore = await ptToken1.balanceOf(user1.address);
      const ytBalanceBefore = await ytToken1.balanceOf(user1.address);

      await hyperMarket.connect(user1).claim(0);

      const ptBalanceAfter = await ptToken1.balanceOf(user1.address);
      const ytBalanceAfter = await ytToken1.balanceOf(user1.address);

      expect(ptBalanceAfter).to.be.gt(ptBalanceBefore);
      // Winner should receive YT from losers
      expect(ytBalanceAfter).to.be.gt(ytBalanceBefore);
    });

    it("Should allow loser to claim only PT", async function () {
      const ptBalanceBefore = await ptToken1.balanceOf(user3.address);
      const ytBalanceBefore = await ytToken1.balanceOf(user3.address);

      await hyperMarket.connect(user3).claim(0);

      const ptBalanceAfter = await ptToken1.balanceOf(user3.address);
      const ytBalanceAfter = await ytToken1.balanceOf(user3.address);

      expect(ptBalanceAfter).to.be.gt(ptBalanceBefore);
      // Loser should not receive YT
      expect(ytBalanceAfter).to.equal(ytBalanceBefore);
    });

    it("Should distribute YT proportionally based on BP", async function () {
      // Both winners should get proportional share
      await hyperMarket.connect(user1).claim(0);
      await hyperMarket.connect(user2).claim(0);

      // Check that both received YT (from user3's losing bet)
      const yt1Balance = await ytToken1.balanceOf(user1.address);
      const yt2Balance = await ytToken2.balanceOf(user2.address);

      expect(yt1Balance).to.be.gt(0);
      expect(yt2Balance).to.be.gt(0);
    });

    it("Should reject double claim", async function () {
      await hyperMarket.connect(user1).claim(0);

      await expect(
        hyperMarket.connect(user1).claim(0)
      ).to.be.revertedWith("Already claimed");
    });
  });

  describe("Claim - Exit to Cash Mode", function () {
    beforeEach(async function () {
      const amount1 = ethers.parseEther("1000");
      const amount3 = ethers.parseEther("800");

      await underlyingToken.connect(user1).approve(hyperMarket.address, amount1);
      await underlyingToken.connect(user3).approve(hyperMarket.address, amount3);

      await hyperMarket.connect(user1).deposit(amount1, 30, 1); // YES
      await hyperMarket.connect(user3).deposit(amount3, 30, 2); // NO

      const resolutionDate = (await hyperMarket.market()).resolutionDate;
      await time.increaseTo(resolutionDate);
      await hyperMarket.connect(oracle).resolveMarket(1);
    });

    it("Should allow winner to exit to cash", async function () {
      const usdyBalanceBefore = await underlyingToken.balanceOf(user1.address);

      await hyperMarket.connect(user1).claim(1);

      const usdyBalanceAfter = await underlyingToken.balanceOf(user1.address);
      expect(usdyBalanceAfter).to.be.gt(usdyBalanceBefore);
    });

    it("Should allow loser to exit (PT only)", async function () {
      const ptBalanceBefore = await ptToken1.balanceOf(user3.address);

      await hyperMarket.connect(user3).claim(1);

      const ptBalanceAfter = await ptToken1.balanceOf(user3.address);
      expect(ptBalanceAfter).to.be.gt(ptBalanceBefore);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle deposit at min time lock boundary", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount);

      await expect(
        hyperMarket.connect(user1).deposit(amount, MIN_TIME_LOCK, 1)
      ).to.not.be.reverted;
    });

    it("Should handle deposit at max time lock boundary", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount);

      // Need to register a market for max time lock
      const maxMaturity = Math.floor(Date.now() / 1000) + MAX_TIME_LOCK * 24 * 60 * 60;
      const MockPendleMarket = await ethers.getContractFactory("MockPendleMarket");
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const ptMax = await MockERC20.deploy("PT-MAX", "PT-MAX");
      const ytMax = await MockERC20.deploy("YT-MAX", "YT-MAX");
      const marketMax = await MockPendleMarket.deploy(ptMax.address, ytMax.address, maxMaturity);
      
      await mockPendleFactory.registerMarket(
        underlyingToken.address,
        ptMax.address,
        maxMaturity,
        marketMax.address
      );
      await marketMax.setYieldRate(500, MAX_TIME_LOCK);
      await hyperMarket.registerPendleMarket(maxMaturity, marketMax.address);
      await ptMax.mint(mockPendleRouter.address, ethers.parseEther("1000000"));
      await ytMax.mint(mockPendleRouter.address, ethers.parseEther("1000000"));

      await expect(
        hyperMarket.connect(user1).deposit(amount, MAX_TIME_LOCK, 1)
      ).to.not.be.reverted;
    });

    it("Should reject deposit after resolution", async function () {
      const amount = ethers.parseEther("1000");
      await underlyingToken.connect(user1).approve(hyperMarket.address, amount);
      await hyperMarket.connect(user1).deposit(amount, 30, 1);

      const resolutionDate = (await hyperMarket.market()).resolutionDate;
      await time.increaseTo(resolutionDate);
      await hyperMarket.connect(oracle).resolveMarket(1);

      await expect(
        hyperMarket.connect(user2).deposit(amount, 30, 1)
      ).to.be.revertedWith("Market resolved");
    });
  });
});

