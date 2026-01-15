# Frontend Integration Guide

This guide provides comprehensive documentation for integrating the HyperWin smart contracts into your frontend application.

## 0. Deployed Contract Addresses (Mantle Sepolia Testnet)

**Network:** Mantle Sepolia Testnet

**Core Contracts:**
- **USDY Token (underlying):** `0x36ec3E9208f0B177bd72283ED54E3f3bf42c0A8e`
- **Pendle Router:** `0x38993cF046d4531cC75E114fF5BFeC44001C92a9`
- **Pendle Factory:** `0xb787672C9D77B518d9bE1A2883653259439787D5`
- **HyperFactory:** `0xd0EBBa4BA3f1f6102c23A975e6cd7789943C830b`
- **HyperMarket (example):** `0x8879e98f0704dc414e4486F05f1d527e6819A41F`

**Available Markets (Time Lock Periods):**

| Time Lock | Market Address | PT Token | YT Token |
|-----------|----------------|----------|----------|
| 30 days | `0xd8b1a24d16339b0ad19c070C0209D1F03FC10651` | `0xB93e9F640fAA179454292efE6C99Adce33F91ba4` | `0x09d3E52a8fA1dd8f423348766CaD157b82F14777` |
| 90 days | `0xF7FAE8cCcd0Eb11345c30E71dF329e7DFEeD584E` | `0xc48a515f783c59d818378150f75F25EC5316C23e` | `0x46F182837A69aDFeaa41e58ae0E047A959372885` |
| 180 days | `0xc96a9742458E6969BeAFe67dfFee43d68e372a50` | `0xE4179529BD5AD59260BEdB89883D70d0d1e87D88` | `0x6400FCcb42906346A507772b0413a01b1a57DEA3` |
| 365 days | `0x22C8D4fCA47Ac496280B7673f8732Bd592487C98` | `0x70501D9BCd658a872a54513e75F3797c5C1356aA` | `0xb6EafED75612EeA5EF6dF26100F951aC166FcEf9` |

**Note:** You can also fetch all markets dynamically using `HyperFactory.getMarkets()`.

## 1. Contract Surfaces

### 1.1 HyperFactory (entrypoint)

**Address (Mantle Sepolia):** `0xd0EBBa4BA3f1f6102c23A975e6cd7789943C830b`

**Key methods:**

```solidity
function getMarkets() external view returns (address[] memory)
function getMarketCount() external view returns (uint256)
function isMarket(address) external view returns (bool)
```

**Usage (frontend):**

To list all active markets: call `getMarkets()`, then for each market, create a contract instance for `HyperMarket`.

### 1.2 HyperMarket (per binary market)

**Core read methods you'll use on the frontend:**

#### `function market() external view returns (MarketParams)`

Access:
- `underlyingToken`
- `resolutionDate`
- `minTimeLock`
- `maxTimeLock`
- `resolved`
- `outcome` (0 = pending, 1 = YES, 2 = NO)

#### `function positions(address user) external view returns (Position)`

Access:
- `principalAmount`
- `bettingPower`
- `maturityDate`
- `ptBalance`
- `ytBalance`
- `side`
- `claimed`

#### `function sideBPPool(uint8 side) external view returns (uint256)`

BP for side 1 (YES) or 2 (NO).

#### `function totalBPPot() external view returns (uint256)`

Sum of all BP in the market (YES + NO).

#### `function maturitySideYtBalance(uint256 maturity, uint8 side) external view returns (uint256)`

YT per maturity/side (for analytics/visualizations).

#### `function getActiveMaturities() external view returns (uint256[] memory)`

List of maturity timestamps with registered Pendle markets.

#### `function oracle() external view returns (address)`

#### `function underlyingToken() external view returns (address)`

**Write methods (user actions):**

```solidity
function deposit(uint256 amount, uint256 timeLockDays, uint8 side) external
function claim(uint8 mode) external
```

- `mode = 0`: PT+YT tokens.
- `mode = 1`: Exit-to-cash (USDY).

**Oracle-only:**

```solidity
function resolveMarket(uint8 winningSide) external
```

## 2. Frontend Data & Flows

### 2.1 User Current Bet

From the market address + user address:

**Call `positions(userAddress)`:**
- `principalAmount`
- `bettingPower`
- `maturityDate`
- `ptBalance`
- `side`
- `claimed`

**Call `market()`:**
- `resolved`
- `outcome`
- `minTimeLock`, `maxTimeLock`
- `resolutionDate`

**UI recommended fields:**

- **Side:**
  - `side == 1` → YES
  - `side == 2` → NO
  - `side == 0` or `principalAmount == 0` → no active bet.
- **Principal:** convert `principalAmount` from wei to USDY.
- **Selected time horizon:** from `maturityDate - depositTimestamp` (off-chain, see events below).
- **Betting Power (BP):** from `bettingPower` directly (display normalized, e.g., divide by 1e18 depending on implementation).

### 2.2 Placing a Bet (New Deposit)

**Steps (frontend):**

1. **User selects:**
   - **Market (Time Lock Period):** Choose from available markets:
     - `30` days → Market address: `0xd8b1a24d16339b0ad19c070C0209D1F03FC10651`
     - `90` days → Market address: `0xF7FAE8cCcd0Eb11345c30E71dF329e7DFEeD584E`
     - `180` days → Market address: `0xc96a9742458E6969BeAFe67dfFee43d68e372a50`
     - `365` days → Market address: `0x22C8D4fCA47Ac496280B7673f8732Bd592487C98`
   - **Bet Outcome (Side):**
     - `1` = YES (user bets the market outcome will be YES)
     - `2` = NO (user bets the market outcome will be NO)
   - **Amount:** Amount in USDY (in wei, e.g., `ethers.utils.parseUnits("100", 18)` for 100 USDY)
   - **Time Lock Days:** Must match the selected market (30, 90, 180, or 365)

2. **Approve USDY Token:**
   ```javascript
   // USDY token address: 0x36ec3E9208f0B177bd72283ED54E3f3bf42c0A8e
   const usdyAddress = '0x36ec3E9208f0B177bd72283ED54E3f3bf42c0A8e';
   const usdyToken = new ethers.Contract(usdyAddress, erc20ABI, signer);
   await usdyToken.approve(hyperMarketAddress, amount);
   ```

3. **Deposit (Place Bet):**
   ```javascript
   const hyperMarket = new ethers.Contract(hyperMarketAddress, hyperMarketABI, signer);
   // timeLockDays must match the market: 30, 90, 180, or 365
   // side: 1 for YES, 2 for NO
   const depositTx = await hyperMarket.deposit(amount, timeLockDays, side);
   await depositTx.wait();
   ```

4. **Listen to `Deposited` event:**
   ```
   Deposited(address user, uint256 amount, uint8 side, uint256 bettingPowerOrPy)
   ```
   (exact fields depend on implementation, but you know the event from the contract).

**Example: Placing a 100 USDY bet on YES for 90 days:**
```javascript
const marketAddress = '0xF7FAE8cCcd0Eb11345c30E71dF329e7DFEeD584E'; // 90D market
const amount = ethers.utils.parseUnits("100", 18); // 100 USDY
const timeLockDays = 90; // Must match the market
const side = 1; // 1 = YES, 2 = NO

// Approve
await usdyToken.approve(marketAddress, amount);

// Deposit
await hyperMarket.deposit(amount, timeLockDays, side);
```

**For UX:**

- **Validate inputs before transaction:**
  - Fetch `market()` to validate user's chosen `timeLockDays` matches the selected market.
  - Ensure `side` is either `1` (YES) or `2` (NO).
  - Check user has sufficient USDY balance.
- **Show an estimated BP:**
  - Frontend can approximately compute BP using the same formula if it also reads current `yieldRate` from Pendle, or rely on the position after tx confirmation.
- **Display market selection clearly:**
  - Show available markets as buttons/cards: "30 Days", "90 Days", "180 Days", "365 Days"
  - Show bet outcome selection: "YES" (side=1) or "NO" (side=2) as toggle buttons

### 2.3 User Past Bets

The on-chain storage keeps one aggregate `Position` per user per market, not a list of historical bets.

**To show past bets history:**

Index events off-chain (via The Graph, custom indexer, or backend):
- `Deposited(user, amount, side, ...)`
- `Resolved(winningSide)`
- `Claimed(user, principalReturned, yieldWinnings)`

**Suggested event-based model:**

For each HyperMarket:
- Track all `Deposited` events (per user).
- Track `Resolved` event (timestamp, outcome).
- Track `Claimed` events.

From these you can reconstruct:
- All deposits (with timestamps, maturity, side).
- When user exited (claimed) and what they received.
- Status history across markets.

### 2.4 Bet Status: Pending / Lost / Won

For a given user + market:

**Fetch `Position` and `MarketParams`:**

If `position.principalAmount == 0` → **No bet**.

Otherwise:

- If `market.resolved == false`:
  - **Status = Pending**
- If `market.resolved == true`:
  - If `position.side == market.outcome`
    - If `position.claimed == false` → **Won (unclaimed)**
    - If `position.claimed == true` → **Won (claimed)**
  - Else:
    - If `position.claimed == false` → **Lost (unclaimed)**
    - If `position.claimed == true` → **Lost (claimed)**

Expose this status as a simple enum/string in your frontend state.

### 2.5 User Shares (User's BP Share)

You care about:
- User's Betting Power.
- User's fraction of the winning pool.

**From contract:**
- `userBP = positions(user).bettingPower`
- `totalWinnerBP = sideBPPool[winningSide]` (if resolved).
- `totalBPPot` – to show global share.

**User share of winner pool:**

```
userShare = userBP / totalWinnerBP
```

**Frontend steps:**

1. Call:
   - `positions(user).bettingPower`
   - `sideBPPool(outcome)` (use 1 or 2, depending on outcome).

2. If market not resolved yet, you can still show `userBP / sideBPPool[side]` as "share within side".

3. **Display:**
   - "You hold X% of the YES pool" before resolution.
   - "You held X% of the winning pool" after resolution.

### 2.6 Overall Pool Shares & BP Visualization

For a given market:

**Total BP:**
- `totalBPPot()`

**Per side BP:**
- `sideBPPool(1)` – YES
- `sideBPPool(2)` – NO

**Per-maturity YT (for analytics):**
- `getActiveMaturities()` → `maturities[]`
- For each:
  - `maturitySideYtBalance(maturity, 1)` – YES
  - `maturitySideYtBalance(maturity, 2)` – NO

**Frontend can compute:**

**YES share of total BP:**
```
yesShare = sideBPPool(1) / totalBPPot
```

**NO share of total BP:**
```
noShare = sideBPPool(2) / totalBPPot
```

Show this as a bar or pie chart: "Distribution of Betting Power between YES and NO".

**Per maturity breakdown (optional advanced UI):**

For each maturity, show YT in YES/NO; cross that with total BP to visualize how much future yield is at stake in each expiry.

## 3. Frontend Call Cheatsheet

### To show markets list:
```javascript
factory.getMarkets()
// For each address m → new ethers Contract(m, HyperMarketABI, provider)
```

### To show market header:
```javascript
market.market()
// Returns: resolutionDate, minTimeLock, maxTimeLock, resolved, outcome
```

### To show user's current bet:
```javascript
market.positions(userAddress)
// Returns: principalAmount, bettingPower, side, claimed, maturityDate
```

### To show status text:
Combine `market.resolved`, `market.outcome`, `position.side`, `position.claimed` as described in section 2.4.

### To show pool stats:
```javascript
totalBPPot()
sideBPPool(1) / sideBPPool(2)
```

### To place a bet:
```javascript
// 1. Select market (30, 90, 180, or 365 days)
const marketAddress = MARKETS[90]; // e.g., 90 days market

// 2. Select bet outcome: 1 = YES, 2 = NO
const side = 1; // or 2 for NO

// 3. Convert amount to wei (USDY has 18 decimals)
const amount = ethers.utils.parseUnits("100", 18); // 100 USDY

// 4. Approve USDY token
await usdyToken.approve(marketAddress, amount);

// 5. Deposit (place bet)
await market.deposit(amount, timeLockDays, side);
// Note: timeLockDays must match the market (30, 90, 180, or 365)
```

### To claim:
```javascript
market.claim(0)  // 0 = tokens, 1 = exit to cash
```

## 4. Example Integration Code

### 4.1 Initialize Contracts

```javascript
import { ethers } from 'ethers';

// Mantle Sepolia addresses
const HYPER_FACTORY_ADDRESS = '0xd0EBBa4BA3f1f6102c23A975e6cd7789943C830b';
const USDY_ADDRESS = '0x36ec3E9208f0B177bd72283ED54E3f3bf42c0A8e';

// Market addresses by time lock
const MARKETS = {
  30: '0xd8b1a24d16339b0ad19c070C0209D1F03FC10651',
  90: '0xF7FAE8cCcd0Eb11345c30E71dF329e7DFEeD584E',
  180: '0xc96a9742458E6969BeAFe67dfFee43d68e372a50',
  365: '0x22C8D4fCA47Ac496280B7673f8732Bd592487C98'
};

const factoryABI = [...]; // HyperFactory ABI
const marketABI = [...]; // HyperMarket ABI
const erc20ABI = [...]; // Standard ERC20 ABI

const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();

const factory = new ethers.Contract(HYPER_FACTORY_ADDRESS, factoryABI, signer);
const usdyToken = new ethers.Contract(USDY_ADDRESS, erc20ABI, signer);
```

### 4.2 Fetch All Markets

```javascript
async function getAllMarkets() {
  const marketAddresses = await factory.getMarkets();
  const markets = await Promise.all(
    marketAddresses.map(async (address) => {
      const market = new ethers.Contract(address, marketABI, provider);
      const marketParams = await market.market();
      return {
        address,
        ...marketParams,
      };
    })
  );
  return markets;
}
```

### 4.3 Get User Position

```javascript
async function getUserPosition(marketAddress, userAddress) {
  const market = new ethers.Contract(marketAddress, marketABI, provider);
  const position = await market.positions(userAddress);
  const marketParams = await market.market();
  
  return {
    position,
    marketParams,
    status: calculateStatus(position, marketParams),
  };
}
```

### 4.4 Place a Bet

**Complete example with market selection and bet outcome:**

```javascript
/**
 * Place a bet on a HyperMarket
 * @param {number} timeLockDays - Market time lock: 30, 90, 180, or 365
 * @param {number} side - Bet outcome: 1 for YES, 2 for NO
 * @param {string} amountUSDY - Amount in USDY (as string, e.g., "100")
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
async function placeBet(timeLockDays, side, amountUSDY) {
  // Validate inputs
  if (![30, 90, 180, 365].includes(timeLockDays)) {
    throw new Error('Invalid time lock. Must be 30, 90, 180, or 365 days');
  }
  if (side !== 1 && side !== 2) {
    throw new Error('Invalid side. Must be 1 (YES) or 2 (NO)');
  }

  // Get market address
  const marketAddress = MARKETS[timeLockDays];
  if (!marketAddress) {
    throw new Error(`Market not found for ${timeLockDays} days`);
  }

  // Convert amount to wei (USDY has 18 decimals)
  const amount = ethers.utils.parseUnits(amountUSDY, 18);

  // Create contract instances
  const market = new ethers.Contract(marketAddress, marketABI, signer);

  // Check user balance
  const balance = await usdyToken.balanceOf(await signer.getAddress());
  if (balance.lt(amount)) {
    throw new Error('Insufficient USDY balance');
  }

  // Check current allowance
  const allowance = await usdyToken.allowance(await signer.getAddress(), marketAddress);
  if (allowance.lt(amount)) {
    // Approve USDY token
    console.log('Approving USDY token...');
    const approveTx = await usdyToken.approve(marketAddress, amount);
    await approveTx.wait();
    console.log('Approval confirmed');
  }

  // Deposit (place bet)
  console.log(`Placing bet: ${amountUSDY} USDY, ${timeLockDays} days, side ${side === 1 ? 'YES' : 'NO'}`);
  const depositTx = await market.deposit(amount, timeLockDays, side);
  const receipt = await depositTx.wait();
  
  console.log('Bet placed! Transaction:', receipt.transactionHash);
  return receipt;
}

// Usage examples:
// Place 100 USDY bet on YES for 90 days
// await placeBet(90, 1, "100");

// Place 50 USDY bet on NO for 30 days
// await placeBet(30, 2, "50");
```

**Simplified version (if you already have the market address):**

```javascript
async function placeBetWithAddress(marketAddress, amount, timeLockDays, side) {
  const market = new ethers.Contract(marketAddress, marketABI, signer);
  
  // Approve if needed
  const allowance = await usdyToken.allowance(await signer.getAddress(), marketAddress);
  if (allowance.lt(amount)) {
    const approveTx = await usdyToken.approve(marketAddress, amount);
    await approveTx.wait();
  }
  
  // Deposit
  const depositTx = await market.deposit(amount, timeLockDays, side);
  const receipt = await depositTx.wait();
  
  return receipt;
}
```

### 4.5 Claim Winnings

```javascript
async function claimWinnings(marketAddress, mode = 0) {
  const market = new ethers.Contract(marketAddress, marketABI, signer);
  const claimTx = await market.claim(mode);
  const receipt = await claimTx.wait();
  return receipt;
}
```

## 5. Event Listening

### 5.1 Listen for Deposits

```javascript
market.on('Deposited', (user, amount, side, bettingPower, event) => {
  console.log('New deposit:', { user, amount, side, bettingPower });
  // Update UI
});
```

### 5.2 Listen for Resolution

```javascript
market.on('Resolved', (winningSide, event) => {
  console.log('Market resolved:', winningSide);
  // Update UI, notify users
});
```

### 5.3 Listen for Claims

```javascript
market.on('Claimed', (user, principalReturned, yieldWinnings, event) => {
  console.log('User claimed:', { user, principalReturned, yieldWinnings });
  // Update UI
});
```

## 6. Best Practices

1. **Always validate inputs** before sending transactions (time locks, amounts, sides).
2. **Handle errors gracefully** - check for revert reasons and display user-friendly messages.
3. **Cache market data** - don't fetch the same data repeatedly in a short time.
4. **Use event indexing** for historical data rather than querying on-chain storage.
5. **Show loading states** during transaction confirmation.
6. **Estimate gas** before sending transactions to avoid failures.
7. **Format numbers properly** - convert from wei to human-readable format for display.

