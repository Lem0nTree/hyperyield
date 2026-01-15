# **HYPER YIELD: Zero-Loss Prediction Markets for RWAs**

### *Bet your RWAs' future yields on prediction markets—never risk your principal.*

> **Making RWAs un-boring by letting degens bet future yields on prediction markets without risking the underlying asset.**
---

# 🚨 The Problem: RWAs Are Too Safe for Degens

RWAs (Real World Assets) are a safe and regulated way of investing. That's very good, but not really compatible with risk-loving investors willing to bet their homes or treasuries on prediction markets...

**The dilemma:**
* We recognize that betting and losing our RWAs would be bad
* Yet we still want big payouts
* Traditional prediction markets require risking principal
* Leverage adds complexity and risk

**Current state:**
* RWAs are boring—you just stake and wait
* No meaningful upside without leverage
* Prediction markets require risking your actual assets
* Time-locked yields are illiquid

---

# 💡 The Solution: Hyper Yield

### *Zero-loss prediction markets powered by yield tokenization.*

**Hyper Yield** enables a world where:

* Users deposit yield-bearing RWA tokens (e.g., USDY)
* The protocol routes through **Pendle Finance** to split into PT (Principal Token) + YT (Yield Token)
* Users bet only their **future yields** on binary outcomes (YES/NO)
* On resolution, everyone redeems their PT (principal back)
* Winners claim pooled YT from losers, proportionally to their "Betting Power"

**This unlocks:**
* ✅ **Zero principal risk**—losers keep their principal, only give up future yield
* ✅ **Bigger payouts without leverage**—time is the multiplier (commit months of future yield)
* ✅ **Optional instant liquidity**—sell future-yield claim (YT) on secondary markets to cash out early

**Just like betting on sports**, you don't risk your savings account—you only bet what you can afford to lose (future yield).

---

# 🏗 Architecture Overview

## Core Components

| Component              | Technology      | Purpose                                                      |
| ---------------------- | --------------- | ------------------------------------------------------------ |
| **1. HyperFactory**    | Solidity        | Factory for deploying prediction markets                     |
| **2. HyperMarket**     | Solidity        | Core betting market logic with BP normalization              |
| **3. PendleAdapter**   | Solidity        | Pendle Finance integration for PT/YT splitting               |
| **4. Betting Power**   | Solidity        | Normalizes bets across different time horizons                |
| **5. Safety Chamber**  | Solidity        | Stores PT tokens to guarantee principal protection           |

## Contract Structure

```
contracts/
├── core/
│   ├── HyperFactory.sol      # Factory for deploying markets
│   ├── HyperMarket.sol       # Core betting market logic
│   └── PendleAdapter.sol     # Pendle Finance integration
├── interfaces/
│   ├── IPendleRouter.sol     # Pendle Router interface
│   ├── IPendleMarket.sol     # Pendle Market interface
│   └── IPendleFactory.sol    # Pendle Factory interface
├── libraries/
│   └── HyperStructs.sol      # Packed data structures
└── mocks/
    ├── MockPendleRouter.sol   # Testing mocks
    └── MockPendleMarket.sol
```

---

# 🛠 How It Works

## Flow Diagram

```
User Deposits USDY → Pendle Split (PT + YT) → Allocate YT to YES/NO
                                                      ↓
                                            Market Resolution
                                                      ↓
                    Losers: Redeem PT (principal back) | Winners: Claim Pooled YT
```

## Step-by-Step Process

### 1. **User Deposit**
User deposits yield-bearing RWA token (USDY) with custom time lock (30-365 days):

```solidity
underlyingToken.approve(hyperMarketAddress, amount);
hyperMarket.deposit(amount, timeLockDays, side); // side: 1 = YES, 2 = NO
```

### 2. **Pendle Split**
Protocol automatically routes through Pendle to split into:
* **PT (Principal Token)**: Locked in "Safety Chamber" for principal protection
* **YT (Yield Token)**: Allocated to chosen prediction side (YES/NO)

### 3. **Betting Power Calculation**
Bets are normalized using Betting Power (BP):

```
BP = Principal × (YieldRate / 10000) × (TimeLock / 365)
```

This ensures fair distribution across different maturities and yield rates.

### 4. **Market Resolution**
Oracle resolves the market:

```solidity
hyperMarket.resolveMarket(winningSide); // 1 = YES, 2 = NO
```

### 5. **Claim Winnings**
* **Losers**: Redeem PT tokens (get principal back)
* **Winners**: Claim proportional YT from all losing-side maturities
* **Optional**: Exit to cash (automatically convert YT to USDY)

```solidity
hyperMarket.claim(0); // 0 = tokens, 1 = exit to cash
```

---

# 📜 Mantle Testnet Deployment Addresses

| Contract/Token        | Address                                      | Description                          |
| --------------------- | -------------------------------------------- | ------------------------------------ |
| **USDY**              | `0x36ec3E9208f0B177bd72283ED54E3f3bf42c0A8e` | Underlying yield-bearing RWA token   |
| **Pendle Router**     | `0x38993cF046d4531cC75E114fF5BFeC44001C92a9` | Pendle Finance router                |
| **Pendle Factory**    | `0xb787672C9D77B518d9bE1A2883653259439787D5` | Pendle Finance factory               |
| **HyperFactory**      | `0xd0EBBa4BA3f1f6102c23A975e6cd7789943C830b` | Factory for deploying markets        |
| **HyperMarket**       | `0x8879e98f0704dc414e4486F05f1d527e6819A41F` | Core betting market contract         |

### Pendle Markets

| Maturity | PT Token                                  | YT Token                                  | Market Address                          |
| -------- | ----------------------------------------- | ----------------------------------------- | --------------------------------------- |
| **30D**  | `0xB93e9F640fAA179454292efE6C99Adce33F91ba4` | `0x09d3E52a8fA1dd8f423348766CaD157b82F14777` | `0xd8b1a24d16339b0ad19c070C0209D1F03FC10651` |
| **90D**  | `0xc48a515f783c59d818378150f75F25EC5316C23e` | `0x46F182837A69aDFeaa41e58ae0E047A959372885` | `0xF7FAE8cCcd0Eb11345c30E71dF329e7DFEeD584E` |
| **180D** | `0xE4179529BD5AD59260BEdB89883D70d0d1e87D88` | `0x6400FCcb42906346A507772b0413a01b1a57DEA3` | `0xc96a9742458E6969BeAFe67dfFee43d68e372a50` |
| **365D** | `0x70501D9BCd658a872a54513e75F3797c5C1356aA` | `0xb6EafED75612EeA5EF6dF26100F951aC166FcEf9` | `0x22C8D4fCA47Ac496280B7673f8732Bd592487C98` |

**Network:** Mantle Sepolia Testnet  
**Chain ID:** 5001  
**Explorer:** https://explorer.testnet.mantle.xyz

---

# 🔧 Technical Implementation

## Key Features

* **Betting Power Normalization**: BP = Principal × YieldRate × Time
* **Multi-Maturity Support**: Users can select custom time horizons (30-365 days)
* **Zero Loss Guarantee**: Principal is protected via PT tokens in "Safety Chamber"
* **Fair Distribution**: Winners receive proportional YT from all losing-side maturities
* **Exit to Cash**: Option to automatically convert winnings to USDY

## Security Considerations

* Reentrancy protection on all external functions
* Access control for oracle resolution
* Input validation for time locks and amounts
* Yield rate sanity checks (capped at 50% annual)
* Pendle market validation before deposits

## Betting Power Formula

BP normalizes bets across different maturities:

```
BP = Principal × (YieldRate / 10000) × (TimeLock / 365)
```

Where:
* **Principal**: Amount in USDY
* **YieldRate**: Annual yield rate in basis points (from Pendle market)
* **TimeLock**: Lock period in days

---

# 🚀 Setup & Usage

## Prerequisites

* Node.js >= 18
* npm or yarn

## Installation

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Test

```bash
npm run test
```

## Deployment

### Configure Environment

Create a `.env` file:

```env
PRIVATE_KEY=your_private_key_here
MANTLE_API_KEY=your_api_key_here  # For contract verification
```

### Deploy to Mantle Testnet

```bash
npm run deploy:testnet
```

### Deploy to Mantle Mainnet

```bash
npm run deploy:mainnet
```

## Usage Example

### 1. Register Pendle Markets

For each maturity date you want to support, register a Pendle market:

```solidity
hyperMarket.registerPendleMarket(maturityDate, pendleMarketAddress);
```

### 2. User Deposits

Users can deposit with custom time locks:

```solidity
underlyingToken.approve(hyperMarketAddress, amount);
hyperMarket.deposit(amount, timeLockDays, side); // side: 1 = YES, 2 = NO
```

### 3. Resolve Market

Oracle resolves the market:

```solidity
hyperMarket.resolveMarket(winningSide); // 1 = YES, 2 = NO
```

### 4. Claim Winnings

Users claim their winnings:

```solidity
hyperMarket.claim(0); // 0 = tokens, 1 = exit to cash
```

---

# 🧪 Testing

The test suite covers:

* Deposits with different time horizons
* BP calculation accuracy
* Multiple maturities on same/different sides
* Market resolution
* Winner/loser claims with cross-maturity YT distribution
* Exit to cash functionality
* Edge cases (min/max time locks, missing markets, yield rate edge cases)

---

# 🗺 Roadmap

## Mantle Hackathon - MVP ✅
* Deposit → Pendle split → bet → resolve → claim
* Core betting market functionality
* Betting Power normalization
* Multi-maturity support

## Q1 2026 - Beta
* Add more RWA assets (beyond USDY)
* Instant cash-out (sell YT on secondary markets)
* Enhanced UI/UX
* Mobile support

## Q3 2026 - Mainnet
* Security audit
* Liquidity incentives
* First RWA partnerships
* Cross-chain expansion

---

# 💰 Monetization

## Revenue Streams

* **Take rate on winnings**: Small % on the yield distributed to winners (never on principal)
* **Market creation / resolution fee**: Fixed fee to create markets + per-market resolution fee to cover oracle costs and maintenance
* **Cash-out fee**: Small fee when users sell future-yield tokens (or route swaps/redemptions) to exit early
* **Partner revenue share**: Optional rev-share with RWA issuers / wallets that onboard users or provide liquidity

---

# 🌐 Network Configuration

## Mantle Testnet
* Chain ID: 5001
* RPC: https://rpc.testnet.mantle.xyz
* Explorer: https://explorer.testnet.mantle.xyz

## Mantle Mainnet
* Chain ID: 5000
* RPC: https://rpc.mantle.xyz
* Explorer: https://explorer.mantle.xyz

---

# 📄 License

MIT

---

# **HYPER YIELD**

### *Zero-loss prediction markets for RWAs.*

Built to make RWAs un-boring while keeping your principal safe.
