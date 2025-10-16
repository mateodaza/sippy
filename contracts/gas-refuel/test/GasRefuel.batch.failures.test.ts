import { expect } from 'chai';
import { ethers, network } from 'hardhat';

describe('GasRefuel - Batch Failure Scenarios', function () {
  let gasRefuel: any;

  beforeEach(async function () {
    const GasRefuel = await ethers.getContractFactory('GasRefuel');
    gasRefuel = await GasRefuel.deploy();
    await gasRefuel.waitForDeployment();

    // Fund and unpause
    const [owner] = await ethers.getSigners();
    await owner.sendTransaction({
      to: await gasRefuel.getAddress(),
      value: ethers.parseEther('0.1'),
    });
    await gasRefuel.unpause();
  });

  it('Does not mutate state if batch transfer fails for a user', async function () {
    const Reject = await ethers.getContractFactory('RejectEther');
    const rejectUser = await Reject.deploy();
    await rejectUser.waitForDeployment();
    const rejectAddr = await rejectUser.getAddress();

    // Pre-state
    expect(await gasRefuel.dailyRefuelCount(rejectAddr)).to.equal(0n);
    expect(await gasRefuel.lastRefuelTime(rejectAddr)).to.equal(0n);

    // Attempt batch; rejectUser will revert on receive()
    await gasRefuel.batchRefuel([rejectAddr]);

    // State must remain unchanged
    expect(await gasRefuel.dailyRefuelCount(rejectAddr)).to.equal(0n);
    expect(await gasRefuel.lastRefuelTime(rejectAddr)).to.equal(0n);
    // Balance remains 0
    expect(await ethers.provider.getBalance(rejectAddr)).to.equal(0n);
  });

  it('Respects cooldown and daily limit across batch calls with time control', async function () {
    const Drain = await ethers.getContractFactory('Drainable');
    const user = await Drain.deploy();
    await user.waitForDeployment();
    const addr = await user.getAddress();

    // First batch refuel
    await gasRefuel.batchRefuel([addr]);
    expect(await ethers.provider.getBalance(addr)).to.equal(
      ethers.parseEther('0.00001')
    );
    expect(await gasRefuel.dailyRefuelCount(addr)).to.equal(1n);

    // Immediate second batch should not refuel due to daily limit
    const balBefore = await ethers.provider.getBalance(addr);
    await gasRefuel.batchRefuel([addr]);
    const balAfter = await ethers.provider.getBalance(addr);
    expect(balAfter).to.equal(balBefore);

    // Advance 1 day to reset daily count, then drain and refuel again
    await network.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await network.provider.send('evm_mine');
    await user.drain((await ethers.getSigners())[0].address);
    expect(await ethers.provider.getBalance(addr)).to.equal(0n);

    await gasRefuel.batchRefuel([addr]);
    expect(await ethers.provider.getBalance(addr)).to.equal(
      ethers.parseEther('0.00001')
    );
    expect(await gasRefuel.dailyRefuelCount(addr)).to.equal(1n);
  });
});
