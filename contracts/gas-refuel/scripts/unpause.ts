import { ethers } from "hardhat";

async function main() {
  const contractAddress = "0xE4e5474E97E89d990082505fC5708A6a11849936";

  console.log("🔓 Unpausing GasRefuel contract...\n");
  console.log("Contract:", contractAddress);

  const GasRefuel = await ethers.getContractFactory("GasRefuel");
  const gasRefuel = GasRefuel.attach(contractAddress);

  // Check current status
  const isPaused = await gasRefuel.paused();
  console.log("Current status: Paused =", isPaused);

  if (!isPaused) {
    console.log("✅ Contract is already unpaused!");
    return;
  }

  // Unpause
  console.log("\n⏳ Sending unpause transaction...");
  const tx = await gasRefuel.unpause();
  console.log("Transaction hash:", tx.hash);
  
  await tx.wait();
  console.log("✅ Transaction confirmed!");

  // Verify
  const newStatus = await gasRefuel.paused();
  console.log("\n📊 New status: Paused =", newStatus);
  
  if (!newStatus) {
    console.log("\n🎉 Contract is now ACTIVE and ready to refuel users!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

