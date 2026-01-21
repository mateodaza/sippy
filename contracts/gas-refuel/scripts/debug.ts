import { ethers } from "hardhat";

async function main() {
  const contractAddress = "0xE4e5474E97E89d990082505fC5708A6a11849936";
  const userAddress = "0x1f31Bc435Cb98d5Cda5599821Ad9f4b0CC72a3bD";

  const GasRefuel = await ethers.getContractFactory("GasRefuel");
  const gasRefuel = GasRefuel.attach(contractAddress);

  console.log("Contract:", contractAddress);
  console.log("User:", userAddress);
  
  // Check contract state
  console.log("\nContract state:");
  console.log("  • paused:", await gasRefuel.paused());
  console.log("  • balance:", ethers.formatEther(await ethers.provider.getBalance(contractAddress)), "ETH");
  console.log("  • minBalance:", ethers.formatEther(await gasRefuel.minBalance()), "ETH");
  console.log("  • refuelAmount:", ethers.formatEther(await gasRefuel.refuelAmount()), "ETH");
  
  // Check user state
  const userBalance = await ethers.provider.getBalance(userAddress);
  console.log("\nUser state:");
  console.log("  • balance:", ethers.formatEther(userBalance), "ETH");
  console.log("  • canRefuel:", await gasRefuel.canRefuel(userAddress));
  console.log("  • dailyRefuelCount:", (await gasRefuel.dailyRefuelCount(userAddress)).toString());
  console.log("  • lastRefuelTime:", (await gasRefuel.lastRefuelTime(userAddress)).toString());
  
  // Try to call refuel with staticCall to see error
  console.log("\nTrying staticCall refuel...");
  try {
    await gasRefuel.refuel.staticCall(userAddress);
    console.log("staticCall succeeded - refuel should work");
  } catch (error: any) {
    console.log("staticCall failed:", error.message);
  }
}

main().catch(console.error);
