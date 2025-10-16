# GasRefuel Integration Setup

## Required Environment Variables

Add these variables to your backend `.env` file:

```env
# Arbitrum Network RPC
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# GasRefuel Contract (after deployment)
REFUEL_CONTRACT_ADDRESS=0x...  # Address from contract deployment
REFUEL_ADMIN_PRIVATE_KEY=0x... # Same private key used for deployment
```

## Setup Steps

### 1. Deploy the GasRefuel Contract

From the `contracts/gas-refuel` directory:

```bash
cd contracts/gas-refuel
pnpm install
pnpm compile
pnpm deploy
```

Save the deployed contract address.

### 2. Verify Contract on Arbiscan

```bash
npx hardhat verify --network arbitrum <CONTRACT_ADDRESS>
```

### 3. Fund the Contract

Send ETH to the contract address:
- Recommended: 0.05-0.1 ETH
- This will cover ~5,000-10,000 refuels

### 4. Unpause the Contract

```bash
npx hardhat console --network arbitrum

# In the console:
const GasRefuel = await ethers.getContractFactory("GasRefuel");
const gasRefuel = await GasRefuel.attach("CONTRACT_ADDRESS");
await gasRefuel.unpause();
```

### 5. Update Backend Environment

Add to your backend `.env`:

```env
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
REFUEL_CONTRACT_ADDRESS=0x...
REFUEL_ADMIN_PRIVATE_KEY=0x...
```

### 6. Restart Backend

```bash
pnpm build
pnpm start
```

## How It Works

1. **User sends PYUSD**: User triggers `/send` command via WhatsApp
2. **Automatic check**: Backend checks if user's wallet has enough ETH for gas
3. **Auto-refuel**: If balance < 0.00001 ETH, contract sends 0.00001 ETH
4. **Transfer executes**: PYUSD transfer proceeds with sufficient gas

## Monitoring

### Check Contract Balance

```typescript
// In your backend code or console:
import { getRefuelService } from './services/refuel.service';

const service = getRefuelService();
const balance = await service.getContractBalance();
console.log('Contract balance:', balance, 'ETH');
```

### Check If User Needs Refuel

```typescript
const userBalance = await service.getUserBalance(userAddress);
console.log('User balance:', userBalance, 'ETH');
```

### Set Up Monitoring

Monitor contract balance and set up alerts when it falls below 0.01 ETH.

## Limits & Security

- **MIN_BALANCE**: 0.00001 ETH - Minimum balance before refuel
- **REFUEL_AMOUNT**: 0.00001 ETH - Amount sent per refuel
- **MAX_DAILY_REFUELS**: 1 per user per day
- **REFUEL_COOLDOWN**: 1 hour between refuels
- **Only Owner**: Only the admin wallet can execute refuels

## Troubleshooting

### Refuel service not available
- Check that `REFUEL_CONTRACT_ADDRESS` is set
- Verify `REFUEL_ADMIN_PRIVATE_KEY` is correct
- Ensure `ARBITRUM_RPC_URL` is accessible

### Refuel fails
- Check contract has sufficient ETH balance
- Verify contract is not paused
- Check user hasn't exceeded daily limit
- Verify cooldown period has passed

### Check contract status
```bash
npx hardhat console --network arbitrum

const GasRefuel = await ethers.getContractFactory("GasRefuel");
const gasRefuel = await GasRefuel.attach("CONTRACT_ADDRESS");

console.log("Paused:", await gasRefuel.paused());
console.log("Balance:", ethers.formatEther(await gasRefuel.contractBalance()));
console.log("Can refuel user:", await gasRefuel.canRefuel("USER_ADDRESS"));
```

## Cost Estimation

- **Gas per refuel**: ~50,000 gas
- **Cost on Arbitrum**: ~0.000005 ETH (~$0.01)
- **ETH sent per refuel**: 0.00001 ETH (~$0.02)
- **Total cost per refuel**: ~$0.03

With 0.1 ETH in contract:
- Can perform ~10,000 refuels
- Supports ~10,000 transactions
- Total value: ~$300 of gas coverage

