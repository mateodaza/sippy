import { expect } from 'chai'
import { ethers, network } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'

describe('GasRefuelV2', function () {
  let gasRefuel: any
  let owner: SignerWithAddress
  let user: SignerWithAddress
  let other: SignerWithAddress

  beforeEach(async function () {
    ;[owner, user, other] = await ethers.getSigners()

    const GasRefuelV2 = await ethers.getContractFactory('GasRefuelV2')
    gasRefuel = await GasRefuelV2.deploy()
    await gasRefuel.waitForDeployment()
  })

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      expect(await gasRefuel.owner()).to.equal(owner.address)
    })

    it('Should start paused', async function () {
      expect(await gasRefuel.paused()).to.equal(true)
    })

    it('Should start with empty allowlist', async function () {
      expect(await gasRefuel.allowlistCount()).to.equal(0)
    })
  })

  // ============ OWNABLE2STEP ============

  describe('Ownable2Step', function () {
    it('Should require two-step ownership transfer', async function () {
      await gasRefuel.transferOwnership(user.address)
      // Owner hasn't changed yet -- pending
      expect(await gasRefuel.owner()).to.equal(owner.address)
      expect(await gasRefuel.pendingOwner()).to.equal(user.address)

      // New owner accepts
      await gasRefuel.connect(user).acceptOwnership()
      expect(await gasRefuel.owner()).to.equal(user.address)
    })

    it('Should reject accept from non-pending address', async function () {
      await gasRefuel.transferOwnership(user.address)
      await expect(gasRefuel.connect(other).acceptOwnership()).to.be.reverted
    })
  })

  // ============ ALLOWLIST ============

  describe('Allowlist', function () {
    it('Should add address to allowlist', async function () {
      await gasRefuel.addToAllowlist(user.address)
      expect(await gasRefuel.allowlisted(user.address)).to.equal(true)
      expect(await gasRefuel.allowlistCount()).to.equal(1)
    })

    it('Should emit AllowlistAdded event', async function () {
      await expect(gasRefuel.addToAllowlist(user.address))
        .to.emit(gasRefuel, 'AllowlistAdded')
        .withArgs(user.address)
    })

    it('Should not double-count when adding same address twice', async function () {
      await gasRefuel.addToAllowlist(user.address)
      await gasRefuel.addToAllowlist(user.address)
      expect(await gasRefuel.allowlistCount()).to.equal(1)
    })

    it('Should remove address from allowlist', async function () {
      await gasRefuel.addToAllowlist(user.address)
      await gasRefuel.removeFromAllowlist(user.address)
      expect(await gasRefuel.allowlisted(user.address)).to.equal(false)
      expect(await gasRefuel.allowlistCount()).to.equal(0)
    })

    it('Should emit AllowlistRemoved event', async function () {
      await gasRefuel.addToAllowlist(user.address)
      await expect(gasRefuel.removeFromAllowlist(user.address))
        .to.emit(gasRefuel, 'AllowlistRemoved')
        .withArgs(user.address)
    })

    it('Should handle removing non-allowlisted address gracefully', async function () {
      await gasRefuel.removeFromAllowlist(user.address)
      expect(await gasRefuel.allowlistCount()).to.equal(0)
    })

    it('Should reject zero address in addToAllowlist', async function () {
      await expect(gasRefuel.addToAllowlist(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        gasRefuel,
        'InvalidAddress'
      )
    })

    it('Should only allow owner to manage allowlist', async function () {
      await expect(gasRefuel.connect(user).addToAllowlist(user.address)).to.be.reverted
      await expect(gasRefuel.connect(user).removeFromAllowlist(owner.address)).to.be.reverted
    })

    it('Should batch add to allowlist', async function () {
      await gasRefuel.batchAddToAllowlist([user.address, other.address])
      expect(await gasRefuel.allowlisted(user.address)).to.equal(true)
      expect(await gasRefuel.allowlisted(other.address)).to.equal(true)
      expect(await gasRefuel.allowlistCount()).to.equal(2)
    })

    it('Should skip zero addresses in batch add', async function () {
      await gasRefuel.batchAddToAllowlist([user.address, ethers.ZeroAddress, other.address])
      expect(await gasRefuel.allowlistCount()).to.equal(2)
    })

    it('Should skip duplicates in batch add', async function () {
      await gasRefuel.addToAllowlist(user.address)
      await gasRefuel.batchAddToAllowlist([user.address, other.address])
      expect(await gasRefuel.allowlistCount()).to.equal(2)
    })

    it('Should batch remove from allowlist', async function () {
      await gasRefuel.batchAddToAllowlist([user.address, other.address])
      await gasRefuel.batchRemoveFromAllowlist([user.address, other.address])
      expect(await gasRefuel.allowlistCount()).to.equal(0)
    })
  })

  // ============ REFUEL WITH ALLOWLIST ============

  describe('Refuel (allowlist gating)', function () {
    beforeEach(async function () {
      await owner.sendTransaction({
        to: await gasRefuel.getAddress(),
        value: ethers.parseEther('0.1'),
      })
      await gasRefuel.unpause()
    })

    it('Should refuel an allowlisted user with low balance', async function () {
      const TestContract = await ethers.getContractFactory('GasRefuelV2')
      const testUser = await TestContract.deploy()
      await testUser.waitForDeployment()
      const userAddress = await testUser.getAddress()

      await gasRefuel.addToAllowlist(userAddress)

      const balanceBefore = await ethers.provider.getBalance(userAddress)
      expect(balanceBefore).to.equal(0)

      await gasRefuel.refuel(userAddress)

      const balanceAfter = await ethers.provider.getBalance(userAddress)
      expect(balanceAfter).to.be.gt(0)
    })

    it('Should reject refuel for non-allowlisted address', async function () {
      const TestContract = await ethers.getContractFactory('GasRefuelV2')
      const testUser = await TestContract.deploy()
      const userAddress = await testUser.getAddress()

      await expect(gasRefuel.refuel(userAddress)).to.be.revertedWithCustomError(
        gasRefuel,
        'NotAllowlisted'
      )
    })

    it('canRefuel should return false for non-allowlisted address', async function () {
      const TestContract = await ethers.getContractFactory('GasRefuelV2')
      const testUser = await TestContract.deploy()
      const userAddress = await testUser.getAddress()

      expect(await gasRefuel.canRefuel(userAddress)).to.equal(false)

      await gasRefuel.addToAllowlist(userAddress)
      expect(await gasRefuel.canRefuel(userAddress)).to.equal(true)
    })

    it('Should still enforce daily limits for allowlisted users', async function () {
      const TestContract = await ethers.getContractFactory('GasRefuelV2')
      const testUser = await TestContract.deploy()
      const userAddress = await testUser.getAddress()

      await gasRefuel.addToAllowlist(userAddress)
      await gasRefuel.refuel(userAddress)

      const dailyCount = await gasRefuel.dailyRefuelCount(userAddress)
      expect(dailyCount).to.equal(1)
    })

    it('Should still enforce pause for allowlisted users', async function () {
      const TestContract = await ethers.getContractFactory('GasRefuelV2')
      const testUser = await TestContract.deploy()
      const userAddress = await testUser.getAddress()

      await gasRefuel.addToAllowlist(userAddress)
      await gasRefuel.pause()

      await expect(gasRefuel.refuel(userAddress)).to.be.revertedWithCustomError(
        gasRefuel,
        'EnforcedPause'
      )
    })

    it('Should refuel after removing and re-adding to allowlist', async function () {
      const TestContract = await ethers.getContractFactory('GasRefuelV2')
      const testUser = await TestContract.deploy()
      const userAddress = await testUser.getAddress()

      await gasRefuel.addToAllowlist(userAddress)
      await gasRefuel.removeFromAllowlist(userAddress)
      await expect(gasRefuel.refuel(userAddress)).to.be.revertedWithCustomError(
        gasRefuel,
        'NotAllowlisted'
      )

      await gasRefuel.addToAllowlist(userAddress)
      await gasRefuel.refuel(userAddress)
      expect(await ethers.provider.getBalance(userAddress)).to.be.gt(0)
    })
  })

  // ============ BATCH REFUEL WITH ALLOWLIST ============

  describe('BatchRefuel (allowlist gating)', function () {
    beforeEach(async function () {
      await owner.sendTransaction({
        to: await gasRefuel.getAddress(),
        value: ethers.parseEther('0.1'),
      })
      await gasRefuel.unpause()
    })

    it('Should only refuel allowlisted users in batch', async function () {
      const TestContract = await ethers.getContractFactory('GasRefuelV2')
      const user1 = await TestContract.deploy()
      const user2 = await TestContract.deploy()
      const addr1 = await user1.getAddress()
      const addr2 = await user2.getAddress()

      await gasRefuel.addToAllowlist(addr1)

      await gasRefuel.batchRefuel([addr1, addr2])

      expect(await ethers.provider.getBalance(addr1)).to.be.gt(0)
      expect(await ethers.provider.getBalance(addr2)).to.equal(0)
    })

    it('Should refuel all allowlisted users in batch', async function () {
      const TestContract = await ethers.getContractFactory('GasRefuelV2')
      const user1 = await TestContract.deploy()
      const user2 = await TestContract.deploy()
      const addr1 = await user1.getAddress()
      const addr2 = await user2.getAddress()

      await gasRefuel.batchAddToAllowlist([addr1, addr2])

      await gasRefuel.batchRefuel([addr1, addr2])

      expect(await ethers.provider.getBalance(addr1)).to.be.gt(0)
      expect(await ethers.provider.getBalance(addr2)).to.be.gt(0)
    })
  })

  // ============ BATCH FAILURE SCENARIOS (CEI rollback) ============

  describe('Batch Failure Scenarios', function () {
    beforeEach(async function () {
      await owner.sendTransaction({
        to: await gasRefuel.getAddress(),
        value: ethers.parseEther('0.1'),
      })
      await gasRefuel.unpause()
    })

    it('Rolls back state when batch transfer fails for a user (CEI)', async function () {
      const Reject = await ethers.getContractFactory('RejectEther')
      const rejectUser = await Reject.deploy()
      await rejectUser.waitForDeployment()
      const rejectAddr = await rejectUser.getAddress()

      await gasRefuel.addToAllowlist(rejectAddr)

      expect(await gasRefuel.dailyRefuelCount(rejectAddr)).to.equal(0n)
      expect(await gasRefuel.lastRefuelTime(rejectAddr)).to.equal(0n)

      await gasRefuel.batchRefuel([rejectAddr])

      // State must be rolled back after failed transfer
      expect(await gasRefuel.dailyRefuelCount(rejectAddr)).to.equal(0n)
      expect(await gasRefuel.lastRefuelTime(rejectAddr)).to.equal(0n)
      expect(await ethers.provider.getBalance(rejectAddr)).to.equal(0n)
    })

    it('Respects cooldown and daily limit across batch calls with time control', async function () {
      const Drain = await ethers.getContractFactory('Drainable')
      const drainUser = await Drain.deploy()
      await drainUser.waitForDeployment()
      const addr = await drainUser.getAddress()

      await gasRefuel.addToAllowlist(addr)

      await gasRefuel.batchRefuel([addr])
      expect(await ethers.provider.getBalance(addr)).to.be.gt(0n)
      expect(await gasRefuel.dailyRefuelCount(addr)).to.equal(1n)

      // Immediate second batch should not refuel due to daily limit
      const balBefore = await ethers.provider.getBalance(addr)
      await gasRefuel.batchRefuel([addr])
      const balAfter = await ethers.provider.getBalance(addr)
      expect(balAfter).to.equal(balBefore)

      // Advance 1 day to reset daily count, then drain and refuel again
      await network.provider.send('evm_increaseTime', [24 * 60 * 60])
      await network.provider.send('evm_mine')
      await drainUser.drain((await ethers.getSigners())[0].address)
      expect(await ethers.provider.getBalance(addr)).to.equal(0n)

      await gasRefuel.batchRefuel([addr])
      expect(await ethers.provider.getBalance(addr)).to.be.gt(0n)
      expect(await gasRefuel.dailyRefuelCount(addr)).to.equal(1n)
    })
  })

  // ============ ADMIN SETTERS (bounds + events) ============

  describe('Admin setters', function () {
    it('Should update parameters within bounds', async function () {
      await gasRefuel.setMinBalance(ethers.parseEther('0.001'))
      expect(await gasRefuel.minBalance()).to.equal(ethers.parseEther('0.001'))

      await gasRefuel.setRefuelAmount(ethers.parseEther('0.005'))
      expect(await gasRefuel.refuelAmount()).to.equal(ethers.parseEther('0.005'))

      await gasRefuel.setMaxDailyRefuels(5)
      expect(await gasRefuel.maxDailyRefuels()).to.equal(5)

      await gasRefuel.setRefuelCooldown(3600)
      expect(await gasRefuel.refuelCooldown()).to.equal(3600)
    })

    it('Should allow cooldown of 0 (disabled)', async function () {
      await gasRefuel.setRefuelCooldown(0)
      expect(await gasRefuel.refuelCooldown()).to.equal(0)
    })

    it('Should reject minBalance out of bounds', async function () {
      await expect(gasRefuel.setMinBalance(0)).to.be.revertedWithCustomError(
        gasRefuel,
        'MinBalanceOutOfBounds'
      )
      await expect(
        gasRefuel.setMinBalance(ethers.parseEther('0.02'))
      ).to.be.revertedWithCustomError(gasRefuel, 'MinBalanceOutOfBounds')
    })

    it('Should reject refuelAmount out of bounds', async function () {
      await expect(gasRefuel.setRefuelAmount(0)).to.be.revertedWithCustomError(
        gasRefuel,
        'RefuelAmountOutOfBounds'
      )
      await expect(
        gasRefuel.setRefuelAmount(ethers.parseEther('0.02'))
      ).to.be.revertedWithCustomError(gasRefuel, 'RefuelAmountOutOfBounds')
    })

    it('Should reject maxDailyRefuels out of bounds', async function () {
      await expect(gasRefuel.setMaxDailyRefuels(0)).to.be.revertedWithCustomError(
        gasRefuel,
        'MaxDailyRefuelsOutOfBounds'
      )
      await expect(gasRefuel.setMaxDailyRefuels(11)).to.be.revertedWithCustomError(
        gasRefuel,
        'MaxDailyRefuelsOutOfBounds'
      )
    })

    it('Should reject cooldown out of bounds', async function () {
      await expect(gasRefuel.setRefuelCooldown(86401)) // > 1 day
        .to.be.revertedWithCustomError(gasRefuel, 'CooldownOutOfBounds')
    })

    it('Should emit events on parameter changes', async function () {
      await expect(gasRefuel.setMinBalance(ethers.parseEther('0.001')))
        .to.emit(gasRefuel, 'MinBalanceUpdated')
        .withArgs(ethers.parseEther('0.00005'), ethers.parseEther('0.001'))

      await expect(gasRefuel.setRefuelAmount(ethers.parseEther('0.005')))
        .to.emit(gasRefuel, 'RefuelAmountUpdated')
        .withArgs(ethers.parseEther('0.0001'), ethers.parseEther('0.005'))

      await expect(gasRefuel.setMaxDailyRefuels(5))
        .to.emit(gasRefuel, 'MaxDailyRefuelsUpdated')
        .withArgs(3, 5)

      await expect(gasRefuel.setRefuelCooldown(3600))
        .to.emit(gasRefuel, 'RefuelCooldownUpdated')
        .withArgs(600, 3600)
    })
  })

  // ============ EXISTING FUNCTIONALITY ============

  describe('Existing functionality', function () {
    it('Should accept ETH deposits', async function () {
      await owner.sendTransaction({
        to: await gasRefuel.getAddress(),
        value: ethers.parseEther('0.1'),
      })
      expect(await gasRefuel.contractBalance()).to.equal(ethers.parseEther('0.1'))
    })

    it('Should allow owner to withdraw', async function () {
      await owner.sendTransaction({
        to: await gasRefuel.getAddress(),
        value: ethers.parseEther('0.1'),
      })
      const initialBalance = await ethers.provider.getBalance(owner.address)
      const tx = await gasRefuel.withdraw()
      const receipt = await tx.wait()
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice
      const finalBalance = await ethers.provider.getBalance(owner.address)
      expect(finalBalance).to.be.closeTo(
        initialBalance + ethers.parseEther('0.1') - gasUsed,
        ethers.parseEther('0.0001')
      )
    })

    it('Should allow pause/unpause', async function () {
      expect(await gasRefuel.paused()).to.equal(true)
      await gasRefuel.unpause()
      expect(await gasRefuel.paused()).to.equal(false)
      await gasRefuel.pause()
      expect(await gasRefuel.paused()).to.equal(true)
    })

    it('Should not allow non-owner to pause', async function () {
      await expect(gasRefuel.connect(user).pause()).to.be.reverted
    })
  })
})
