# Frontend Integration Guide

This guide provides comprehensive documentation for integrating the HyperWin smart contracts into your frontend application.

## 1. Contract Surfaces

### 1.1 HyperFactory (entrypoint)

**Address:** backend/config per network (Mantle testnet/mainnet).

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

1. User selects:
   - Market (HyperMarket address).
   - Side (YES/NO).
   - Amount in USDY.
   - Time lock (days) within `[minTimeLock, maxTimeLock]`.

2. **Approve:**
   ```javascript
   underlyingToken.approve(hyperMarketAddress, amount)
   ```

3. **Deposit:**
   ```javascript
   hyperMarket.deposit(amount, timeLockDays, side)
   ```

4. **Listen to `Deposited` event:**
   ```
   Deposited(address user, uint256 amount, uint8 side, uint256 bettingPowerOrPy)
   ```
   (exact fields depend on implementation, but you know the event from the contract).

**For UX:**

- Fetch `market()` to validate user's chosen `timeLockDays` on the client before sending tx.
- Show an estimated BP:
  - Frontend can approximately compute BP using the same formula if it also reads current `yieldRate` from Pendle, or rely on the position after tx confirmation.

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
underlyingToken.approve(marketAddress, amount)
market.deposit(amount, timeLockDays, side)
```

### To claim:
```javascript
market.claim(0)  // 0 = tokens, 1 = exit to cash
```

## 4. Example Integration Code

### 4.1 Initialize Contracts

```javascript
import { ethers } from 'ethers';

const factoryAddress = '0x...'; // From deployment
const factoryABI = [...]; // HyperFactory ABI
const marketABI = [...]; // HyperMarket ABI

const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();

const factory = new ethers.Contract(factoryAddress, factoryABI, signer);
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

```javascript
async function placeBet(marketAddress, amount, timeLockDays, side) {
  const market = new ethers.Contract(marketAddress, marketABI, signer);
  const underlyingToken = new ethers.Contract(
    await market.underlyingToken(),
    erc20ABI,
    signer
  );
  
  // Approve
  const approveTx = await underlyingToken.approve(marketAddress, amount);
  await approveTx.wait();
  
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

