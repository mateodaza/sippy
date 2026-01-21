import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying GasRefuel contract to Arbitrum mainnet...\n");

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("📍 Deploying from:", deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH\n");

  // Deploy the contract
  console.log("⏳ Deploying GasRefuel...");
  const GasRefuel = await ethers.getContractFactory("GasRefuel");
  const gasRefuel = await GasRefuel.deploy();
  
  await gasRefuel.waitForDeployment();
  const address = await gasRefuel.getAddress();

  console.log("✅ GasRefuel deployed to:", address);
  console.log("🔐 Owner:", await gasRefuel.owner());
  console.log("⏸️  Paused:", await gasRefuel.paused());
  console.log("\n📋 Contract details (configurable):");
  console.log("  • minBalance:", ethers.formatEther(await gasRefuel.minBalance()), "ETH");
  console.log("  • refuelAmount:", ethers.formatEther(await gasRefuel.refuelAmount()), "ETH");
  console.log("  • maxDailyRefuels:", (await gasRefuel.maxDailyRefuels()).toString());
  console.log("  • refuelCooldown:", (await gasRefuel.refuelCooldown()).toString(), "seconds");

  console.log("\n🔗 Arbiscan verification:");
  console.log("  npx hardhat verify --network arbitrum", address);

  console.log("\n⚠️  NEXT STEPS:");
  console.log("  1. Verify contract on Arbiscan");
  console.log("  2. Send ETH to contract:", address);
  console.log("  3. Unpause contract: gasRefuel.unpause()");
  console.log("  4. Update backend .env with REFUEL_CONTRACT_ADDRESS");

  console.log("\n💾 Save this address for backend integration:");
  console.log("  REFUEL_CONTRACT_ADDRESS=" + address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

