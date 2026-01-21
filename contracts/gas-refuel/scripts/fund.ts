import { ethers } from "hardhat";

async function main() {
  const contractAddress = "0xE4e5474E97E89d990082505fC5708A6a11849936";
  const fundAmount = "0.002"; // 0.002 ETH - enough for 20 refuels

  console.log("💰 Funding GasRefuel contract...\n");
  console.log("Contract:", contractAddress);
  console.log("Amount:", fundAmount, "ETH");

  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("\nSigner balance:", ethers.formatEther(balance), "ETH");

  // Send ETH to contract
  console.log("\n⏳ Sending ETH...");
  const tx = await signer.sendTransaction({
    to: contractAddress,
    value: ethers.parseEther(fundAmount),
  });
  console.log("Transaction hash:", tx.hash);

  await tx.wait();
  console.log("✅ Transaction confirmed!");

  // Check contract balance
  const contractBalance = await ethers.provider.getBalance(contractAddress);
  console.log("\n📊 Contract balance:", ethers.formatEther(contractBalance), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
