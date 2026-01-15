# High-Level Architecture

## Overview

HyperWin is a zero-loss betting platform that integrates with Pendle Finance to enable binary market betting (YES/NO) while protecting user principal through Principal Tokens (PT) and distributing yield via Yield Tokens (YT).

## System Components

### HyperFactory

Deploys and tracks individual HyperMarket instances.
- Knows the Pendle Router and Pendle Factory addresses.
- Manages market creation and registration.

### HyperMarket

One instance per binary market (YES/NO).
- Holds user deposits in USDY, zaps into Pendle PT/YT, tracks Betting Power (BP) and resolves outcomes.
- Each market represents a single binary question with a resolution date.

### PendleAdapter

Internal helper (inherited by HyperMarket) that wraps calls to Pendle's Router/Market:
- Mint PT+YT from USDY
- Redeem PT+YT back to USDY
- Swap YT → USDY
- Compute implied yield rate from `readState()`

### HyperStructs

Structs used across contracts:
- `MarketParams`: config for a HyperMarket.
- `Position`: per-user state.
- `PendleMarketInfo`: per-maturity Pendle market metadata.

### Mocks

For tests only (MockPendleRouter, MockPendleMarket, MockPendleFactory, MockERC20).

All together, this gives you a multi-market, multi-maturity betting system where payoffs are normalized by Betting Power.

## Betting Model & Betting Power

### Core Idea

Users don't compete by amount only; they compete by future yield they are putting at risk.

### Betting Power (BP) Formula

```
BP = Principal × (YieldRate / 10000) × (TimeLockDays / 365)
```

Where:
- **Principal**: amount of USDY deposited.
- **YieldRate**: annualized yield for the chosen Pendle market, in basis points, computed from `IPendleMarket.readState()`.
- **TimeLockDays**: user-chosen lock period (between `minTimeLock` and `maxTimeLock`).

### Why BP?

Different users can:
- Use different maturities.
- Lock for different time horizons.

BP normalizes all those positions into a single comparable metric.

Winners share the losing side's future yield proportional to their BP, not just their raw principal or YT amount.

## Core Data Structures

### 3.1 MarketParams (per HyperMarket)

```solidity
struct MarketParams {
    address underlyingToken;    // USDY token
    uint256 resolutionDate;     // when oracle is allowed to resolve
    uint256 minTimeLock;        // min lock period (days)
    uint256 maxTimeLock;        // max lock period (days)
    bool resolved;              // whether market was resolved
    uint8 outcome;              // 0 = Pending, 1 = YES, 2 = NO
}
```

### 3.2 Position (per user per market)

```solidity
struct Position {
    uint256 principalAmount;    // total USDY deposited by this user into this market
    uint256 bettingPower;       // aggregate BP for all their deposits
    uint256 maturityDate;       // last used maturity (for PT position)
    uint256 ptBalance;          // PT tokens reserved in "Safety Chamber" for this user
    uint256 ytBalance;          // YT amount this user contributed (if tracked)
    uint8 side;                 // 1 = YES, 2 = NO
    bool claimed;               // whether they already claimed
}
```

### 3.3 PendleMarketInfo (per maturity)

```solidity
struct PendleMarketInfo {
    address market;             // Pendle Market
    address ptToken;
    address ytToken;
    uint256 maturityDate;
    bool isActive;
}
```

## HyperFactory

### State

```solidity
address public pendleRouter;
address public pendleFactory;
address[] public markets;
mapping(address => bool) public isMarket;
```

### Core Functions

#### `constructor(address _pendleRouter, address _pendleFactory)`

Stores global Pendle contracts and sets owner (Ownable).

#### `createMarket(address underlyingToken, uint256 minTimeLock, uint256 maxTimeLock, uint256 resolutionDate, address oracle)`

Deploys a new HyperMarket.

Validates:
- Non-zero addresses
- `minTimeLock <= maxTimeLock`
- `maxTimeLock` not insane (e.g. ≤ 365 days)
- `resolutionDate > now`

#### `getMarkets() / getMarketCount()`

Read-only access to deployed markets.

### Events

```solidity
event MarketCreated(
    address indexed market,
    address indexed underlyingToken,
    uint256 minTimeLock,
    uint256 maxTimeLock,
    uint256 resolutionDate
);
```

## HyperMarket

### State (key fields)

```solidity
IERC20 public underlyingToken;
IPendleFactory public pendleFactory;
HyperStructs.MarketParams public market;
uint256 public totalBPPot;
mapping(uint8 => uint256) public sideBPPool;  // BP per side (1/2)
mapping(address => Position) public positions;
mapping(uint256 => PendleMarketInfo) public pendleMarkets;  // maturity → Pendle market
uint256[] public activeMaturities;
mapping(uint256 => mapping(uint8 => uint256)) public maturitySideYtBalance;  // maturity → side → total YT
address public oracle;
```

### Constructor

Sets:
- `underlyingToken`
- `pendleRouter` (via PendleAdapter base)
- `pendleFactory`
- `minTimeLock`, `maxTimeLock`, `resolutionDate`
- `oracle`

Validates non-zero addresses and reasonable parameters.

### 5.1 Registering Pendle Markets

#### `registerPendleMarket(uint256 maturityDate, address pendleMarket)`

Only owner.

Validates:
- Market not registered.
- PendleFactory thinks market is valid.
- `IPendleMarket.expiry()` matches `maturityDate`.

Stores `ptToken`, `ytToken`, `maturityDate`, `isActive`.

Adds to `activeMaturities`.

### 5.2 Deposit Flow

#### `deposit(uint256 amount, uint256 timeLockDays, uint8 side)`

**Guards:**
- Market not resolved.
- `block.timestamp < resolutionDate`.
- Side ∈ {1,2}.
- `amount > 0`.
- `minTimeLock ≤ timeLockDays ≤ maxTimeLock`.

**Steps:**
1. Compute `maturityDate = now + timeLockDays * 1 day`.
2. Validate a Pendle market exists for this maturity.
3. Fetch `yieldRateBps = _getYieldRate(pendleMarketAddress)`.
4. Compute `bp = _calculateBP(amount, yieldRateBps, timeLockDays)`.
5. Transfer `amount` USDY from user.
6. Approve Pendle Router and call `mintPyFromToken` to get PT+YT.
7. Update Position:
   - Add to `principalAmount`, `bettingPower`, `ptBalance`, `ytBalance`.
   - Set `side` (if first time).
8. Update global pools:
   - `totalBPPot += bp`
   - `sideBPPool[side] += bp`
   - `maturitySideYtBalance[maturityDate][side] += mintedPy`
9. Emit `Deposited`.

### 5.3 Resolution

#### `resolveMarket(uint8 winningSide)` (onlyOracle)

**Guards:**
- Not already resolved.
- `block.timestamp >= resolutionDate`.
- `winningSide ∈ {1,2}`.

Sets `market.resolved = true`, `market.outcome = winningSide`.

Emits `Resolved`.

### 5.4 Claim

#### `claim(uint8 mode)` – called by users after resolution.

**Guards:**
- Market resolved.
- User has `principalAmount > 0`.
- Not already claimed.

Marks `position.claimed = true`.

`isWinner = (position.side == outcome)`.

**Two modes:**

**Mode 0 – Token Claim**
- Transfers PT back to user from their maturity.
- If winner:
  - Computes their share of losing-side YT across all maturities based on BP.
  - Transfers a "basket" of YT tokens (pro-rata from each maturity).
- Emits `Claimed` (`principalReturned = PT`, `yieldWinnings = total YT`).

**Mode 1 – Exit to Cash**
- For winners:
  - Uses matching portion of PT+YT for same maturity to redeem to USDY.
  - Swaps remaining YT winnings for USDY across maturities.
  - Transfers any residual PT (not matched) to user.
- For losers:
  - Returns PT only.
- Emits `Claimed` (`principalReturned = PT`, `yieldWinnings = total USDY`).

### 5.5 Security

- Uses `ReentrancyGuard` on external state-changing functions (`deposit`, `claim`).
- Access control on `resolveMarket` via `onlyOracle`.
- Validates all inputs (amounts, sides, time locks, maturity/market existence).
- Clears approvals after Pendle operations.

## PendleAdapter

Provides internal helpers:

- `_swapToPTYT(market, underlyingToken, amountIn)` – Mints PT+YT from underlying token
- `_redeemPYToToken(market, underlyingToken, pyAmount)` – Redeems PT+YT back to underlying
- `_swapYTForToken(market, underlyingToken, ytAmount)` – Swaps YT for underlying token
- `_getYieldRate(market)` – Uses `IPendleMarket.readState()` and `expiry()` to infer annualized yield (capped for sanity)

