// @ts-nocheck

import { parseEther } from 'ethers/lib/utils'
import { artifacts, contract } from 'hardhat'

import { assert } from 'chai'
import { expectEvent, expectRevert, time } from '@openzeppelin/test-helpers'
import { getBlockTime, approveAll, ONE_BILLION } from './helpers'

const MockERC20 = artifacts.require('./libs/MockERC20.sol')
const SmartChefInitializable = artifacts.require('./SmartChefInitializable.sol')
const SmartChefFactory = artifacts.require('./SmartChefFactory.sol')

contract(
  'Smart Chef Factory',
  ([alice, bob, carol, david, erin, ...accounts]) => {
    let startTime
    let endTime

    const poolLimitPerUser = parseEther('0')
    const rewardPerSecond = parseEther('10')

    // Contracts
    let mockCAKE, mockPT, smartChef, smartChefFactory

    // Generic result variable
    let result: any

    before(async () => {
      startTime = (await getBlockTime()) + 10000
      endTime = startTime + 400

      mockCAKE = await MockERC20.new(
        'Mock CAKE',
        'CAKE',
        parseEther('1000000'),
        18,
        {
          from: alice,
        }
      )

      mockPT = await MockERC20.new(
        'Mock Pool Token 1',
        'PT1',
        parseEther(String(ONE_BILLION)),
        18,
        {
          from: alice,
        }
      )

      smartChefFactory = await SmartChefFactory.new({ from: alice })
    })

    describe('SMART CHEF #1 - NO POOL LIMIT', async () => {
      it('Deploy pool with SmartChefFactory', async () => {
        result = await smartChefFactory.deployPool(
          mockCAKE.address,
          mockPT.address,
          rewardPerSecond,
          startTime,
          endTime,
          poolLimitPerUser,
          alice
        )

        const poolAddress = result.receipt.logs[2].args[0]

        expectEvent(result, 'NewSmartChefContract', { smartChef: poolAddress })

        smartChef = await SmartChefInitializable.at(poolAddress)

        await mockPT.transfer(smartChef.address, parseEther(String(ONE_BILLION / 2)), {
          from: alice,
        })
      })

      it('Initial parameters are correct', async () => {
        assert.equal(
          String(await smartChef.PRECISION_FACTOR()),
          '1000000000000'
        )
        assert.equal(String(await smartChef.lastRewardTime()), startTime)
        assert.equal(
          String(await smartChef.rewardPerSecond()),
          rewardPerSecond.toString()
        )
        assert.equal(
          String(await smartChef.poolLimitPerUser()),
          poolLimitPerUser.toString()
        )
        assert.equal(
          String(await smartChef.startTime()),
          startTime.toString()
        )
        assert.equal(
          String(await smartChef.bonusEndTime()),
          endTime.toString()
        )
        assert.equal(await smartChef.hasUserLimit(), false)
        assert.equal(await smartChef.owner(), alice)

        // Transfer 1B PT token to the contract (400 blocks with 10 PT/block)
        await mockPT.transfer(smartChef.address, parseEther('4000'), {
          from: alice,
        })
      })

      it('Users deposit', async () => {
        for (const thisUser of [bob, carol, david, erin]) {
          await mockCAKE.mintTokens(parseEther('1000'), { from: thisUser })
          await mockCAKE.approve(smartChef.address, parseEther('1000'), {
            from: thisUser,
          })
          result = await smartChef.deposit(parseEther('100'), {
            from: thisUser,
          })
          expectEvent(result, 'Deposit', {
            user: thisUser,
            amount: String(parseEther('100')),
          })
          assert.equal(String(await smartChef.pendingReward(thisUser)), '0')
        }
      })

      it('Advance to startTime', async () => {
        await time.increaseTo(startTime)
        assert.equal(String(await smartChef.pendingReward(bob)), '0')
      })

      it('Advance to startTime + 1', async () => {
        await time.increaseTo(startTime + 1)
        assert.equal(
          String(await smartChef.pendingReward(bob)),
          String(parseEther('2.5'))
        )
      })

      it('Advance to startTime + 10', async () => {
        await time.increaseTo(startTime + 10)
        assert.equal(
          String(await smartChef.pendingReward(carol)),
          String(parseEther('25'))
        )
      })

      it('Carol can withdraw', async () => {
        result = await smartChef.withdraw(parseEther('50'), { from: carol })
        expectEvent(result, 'Withdraw', {
          user: carol,
          amount: String(parseEther('50')),
        })
        // She harvests 11 blocks --> 10/4 * 11 = 27.5 PT tokens
        assert.equal(
          String(await mockPT.balanceOf(carol)),
          String(parseEther('27.5'))
        )
        assert.equal(
          String(await smartChef.pendingReward(carol)),
          String(parseEther('0'))
        )
      })

      it('Can collect rewards by calling deposit with amount = 0', async () => {
        result = await smartChef.deposit(parseEther('0'), { from: carol })
        expectEvent(result, 'Deposit', {
          user: carol,
          amount: String(parseEther('0')),
        })
        assert.equal(
          String(await mockPT.balanceOf(carol)),
          String(parseEther('28.92857142855'))
        )
      })

      it('Can collect rewards by calling withdraw with amount = 0', async () => {
        result = await smartChef.withdraw(parseEther('0'), { from: carol })
        expectEvent(result, 'Withdraw', {
          user: carol,
          amount: String(parseEther('0')),
        })
        assert.equal(
          String(await mockPT.balanceOf(carol)),
          String(parseEther('30.3571428571'))
        )
      })

      it('Carol cannot withdraw more than she had', async () => {
        await expectRevert(
          smartChef.withdraw(parseEther('70'), { from: carol }),
          'Amount to withdraw too high'
        )
      })

      it('Admin cannot set a limit', async () => {
        await expectRevert(
          smartChef.updatePoolLimitPerUser(true, parseEther('1'), {
            from: alice,
          }),
          'Must be set'
        )
      })

      it('Cannot change after start reward per block, nor start block or end block', async () => {
        await expectRevert(
          smartChef.updateRewardPerBlock(parseEther('1'), { from: alice }),
          'Pool has started'
        )
        await expectRevert(
          smartChef.updateStartAndEndBlocks('1', '10', { from: alice }),
          'Pool has started'
        )
      })

      // it('Advance to end of IFO', async () => {
      //   await time.increaseTo(endTime)

      //   for (const thisUser of [bob, david, erin]) {
      //     await smartChef.withdraw(parseEther('100'), { from: thisUser })
      //   }
      //   await smartChef.withdraw(parseEther('50'), { from: carol })

      //   // 0.000000001 PT token
      //   assert.isAtMost(
      //     Number(await mockPT.balanceOf(smartChef.address)),
      //     1000000000
      //   )
      // })

      it('Cannot deploy a pool with SmartChefFactory if not owner', async () => {
        await expectRevert(
          smartChefFactory.deployPool(
            mockCAKE.address,
            mockPT.address,
            rewardPerSecond,
            startTime,
            endTime,
            poolLimitPerUser,
            bob,
            { from: bob }
          ),
          'Ownable: caller is not the owner'
        )
      })

      it('Cannot deploy a pool with wrong tokens', async () => {
        await expectRevert(
          smartChefFactory.deployPool(
            mockCAKE.address,
            mockCAKE.address,
            rewardPerSecond,
            startTime,
            endTime,
            poolLimitPerUser,
            alice,
            { from: alice }
          ),
          'Tokens must be be different'
        )

        await expectRevert(
          smartChefFactory.deployPool(
            mockCAKE.address,
            smartChef.address,
            rewardPerSecond,
            startTime,
            endTime,
            poolLimitPerUser,
            alice,
            { from: alice }
          ),
          'function selector was not recognized and there\'s no fallback function'
        )

        await expectRevert(
          smartChefFactory.deployPool(
            alice,
            mockCAKE.address,
            rewardPerSecond,
            startTime,
            endTime,
            poolLimitPerUser,
            alice,
            { from: alice }
          ),
          'function call to a non-contract account'
        )
      })
    })
  }
)
