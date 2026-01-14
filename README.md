# HYPER ZERO LOSS MVP

Smart Contracts for HYPER ZERO LOSS betting platform with Betting Power (BP) normalization.

## Overview

This project implements a zero-loss betting system where users can bet on binary outcomes (YES/NO) while maintaining 100% principal protection through Pendle Finance integration. The system uses **Betting Power (BP)** to normalize bets across different time horizons, ensuring fair distribution of winnings.

### Key Features

- **Betting Power Normalization**: BP = Principal × YieldRate × Time
- **Multi-Maturity Support**: Users can select custom time horizons (30-365 days)
- **Zero Loss Guarantee**: Principal is protected via PT tokens in "Safety Chamber"
- **Fair Distribution**: Winners receive proportional YT from all losing-side maturities
- **Exit to Cash**: Option to automatically convert winnings to USDY

## Architecture

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

## Setup

### Prerequisites

- Node.js >= 18
- npm or yarn

### Installation

```bash
npm install
```

### Compile

```bash
npm run compile
```

### Test

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

## Usage

### 1. Deploy Factory

The deployment script automatically deploys the factory and creates a test market.

### 2. Register Pendle Markets

For each maturity date you want to support, register a Pendle market:

```solidity
hyperMarket.registerPendleMarket(maturityDate, pendleMarketAddress);
```

### 3. Users Deposit

Users can deposit with custom time locks:

```solidity
underlyingToken.approve(hyperMarketAddress, amount);
hyperMarket.deposit(amount, timeLockDays, side); // side: 1 = YES, 2 = NO
```

### 4. Resolve Market

Oracle resolves the market:

```solidity
hyperMarket.resolveMarket(winningSide); // 1 = YES, 2 = NO
```

### 5. Claim Winnings

Users claim their winnings:

```solidity
hyperMarket.claim(0); // 0 = tokens, 1 = exit to cash
```

## Betting Power Calculation

BP normalizes bets across different maturities:

```
BP = Principal × (YieldRate / 10000) × (TimeLock / 365)
```

Where:
- **Principal**: Amount in USDY
- **YieldRate**: Annual yield rate in basis points (from Pendle market)
- **TimeLock**: Lock period in days

## Security Considerations

- Reentrancy protection on all external functions
- Access control for oracle resolution
- Input validation for time locks and amounts
- Yield rate sanity checks (capped at 50% annual)
- Pendle market validation before deposits

## Testing

The test suite covers:
- Deposits with different time horizons
- BP calculation accuracy
- Multiple maturities on same/different sides
- Market resolution
- Winner/loser claims with cross-maturity YT distribution
- Exit to cash functionality
- Edge cases (min/max time locks, missing markets, yield rate edge cases)

## Network Configuration

### Mantle Testnet
- Chain ID: 5001
- RPC: https://rpc.testnet.mantle.xyz
- Explorer: https://explorer.testnet.mantle.xyz

### Mantle Mainnet
- Chain ID: 5000
- RPC: https://rpc.mantle.xyz
- Explorer: https://explorer.mantle.xyz

## License

MIT

