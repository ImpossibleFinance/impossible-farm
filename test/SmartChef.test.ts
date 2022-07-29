// @ts-nocheck

import { parseEther } from 'ethers/lib/utils'
import { artifacts, contract } from 'hardhat'

import { assert } from 'chai'
import { expectEvent, expectRevert, time } from '@openzeppelin/test-helpers'
import { getBlockTime, minePause, mineStart } from './helpers'
import { expect } from 'chai'

const MockBEP20 = artifacts.require('./libs/MockBEP20.sol')
const MockERC20 = artifacts.require('./libs/MockERC20.sol')
const SmartChef = artifacts.require('./SmartChef.sol')

const ONE_BILLION = 1000000000

contract(
  'Smart Chef V2',
  ([alice, bob, carol, david, erin, frank, ...accounts]) => {
    // Contracts
    let mockCAKE, mockPT, smartChef, smartChef2


    let startTime
    let endTime

    let poolLimitPerUser = parseEther('0')
    let rewardPerSecond = parseEther('10')

    // Generic result variable
    let result: any

    before(async () => {
      startTime = (await getBlockTime()) + 10000
      endTime = startTime + 400

      mockCAKE = await MockBEP20.new(
        'Mock CAKE',
        'CAKE',
        parseEther('1000000'),
        {
          from: alice,
        }
      )

      mockPT = await MockBEP20.new(
        'Mock Pool Token 1',
        'PT1',
        parseEther(String(ONE_BILLION)),
        {
          from: alice,
        }
      )

      smartChef = await SmartChef.new(
        mockCAKE.address,
        mockPT.address,
        rewardPerSecond,
        startTime,
        endTime,
        poolLimitPerUser
      )
    })

    describe('SMART CHEF #1 - NO POOL LIMIT', async () => {
      it('Initial parameters are correct', async () => {
        assert.equal(
          String(await smartChef.PRECISION_FACTOR()),
          '1000000000000'
        )
        assert.equal(
          String(await smartChef.lastRewardTime()),
          startTime.toString()
        )
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

        // Transfer PT token to the contract (400 blocks with 10 PT/block)
        await mockPT.transfer(smartChef.address, parseEther(String(ONE_BILLION / 2)), {
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
        await minePause()
        await time.increaseTo(startTime)
        assert.equal(String(await smartChef.pendingReward(bob)), '0')
        await mineStart()
      })

      it('Advance to startTime + 100', async () => {
        await minePause()
        await time.increaseTo(startTime + 100)
        assert.equal(
          String(await smartChef.pendingReward(bob)),
          String(parseEther('250'))
        )
        await mineStart()
      })

      it('Advance to startTime + 200', async () => {
        await minePause()
        await time.increaseTo(startTime + 200)
        assert.equal(
          String(await smartChef.pendingReward(carol)),
          String(parseEther('500'))
        )
        await mineStart()
      })

      it('Carol can withdraw', async () => {
        result = await smartChef.withdraw(parseEther('50'), { from: carol })
        expectEvent(result, 'Withdraw', {
          user: carol,
          amount: String(parseEther('50')),
        })
        expect(await mockPT.balanceOf(carol)).to.be.bignumber.gt(String(parseEther('500')))
        assert.equal(
          String(await smartChef.pendingReward(carol)),
          String(parseEther('0'))
        )
      })

      it('Can collect rewards by calling deposit with amount = 0', async () => {
        const prevBalance = await mockPT.balanceOf(carol)
        result = await smartChef.deposit(parseEther('0'), { from: carol })
        expectEvent(result, 'Deposit', {
          user: carol,
          amount: String(parseEther('0')),
        })
        expect(await mockPT.balanceOf(carol)).to.be.bignumber.gt(prevBalance)
      })

      it('Can collect rewards by calling withdraw with amount = 0', async () => {
        const prevBalance = await mockPT.balanceOf(carol)
        result = await smartChef.withdraw(parseEther('0'), { from: carol })
        expectEvent(result, 'Withdraw', {
          user: carol,
          amount: String(parseEther('0')),
        })
        expect(await mockPT.balanceOf(carol)).to.be.bignumber.gt(prevBalance)
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

      //   assert.isBelow(
      //     Number(await mockPT.balanceOf(smartChef.address)),
      //     parseInt(ONE_BILLION)
      //   )
      // })
    })

    describe('SMART CHEF #2 - POOL LIMIT', async () => {
      it('Contract is deployed', async () => {
        mockPT = await MockBEP20.new(
          'Mock Pool Token 2',
          'PT2',
          parseEther('2000'),
          {
            from: alice,
          }
        )

        rewardPerSecond = parseEther('10')
        startTime = (await getBlockTime() + 10000)
        endTime = startTime + 200
        poolLimitPerUser = parseEther('2')

        smartChef2 = await SmartChef.new(
          mockCAKE.address,
          mockPT.address,
          rewardPerSecond,
          startTime,
          endTime,
          poolLimitPerUser
        )
      })

      it('Initial parameters are correct', async () => {
        assert.equal(
          String(await smartChef2.PRECISION_FACTOR()),
          '1000000000000'
        )
        assert.equal(
          String(await smartChef2.lastRewardTime()),
          startTime.toString()
        )
        assert.equal(
          String(await smartChef2.rewardPerSecond()),
          rewardPerSecond.toString()
        )
        assert.equal(
          String(await smartChef2.poolLimitPerUser()),
          poolLimitPerUser.toString()
        )
        assert.equal(
          String(await smartChef2.startTime()),
          startTime.toString()
        )
        assert.equal(
          String(await smartChef2.bonusEndTime()),
          endTime.toString()
        )
        assert.equal(await smartChef2.hasUserLimit(), true)

        // Transfer PT token to the contract (200 blocks with 10 PT/block)
        await mockPT.transfer(smartChef2.address, parseEther('2000'), {
          from: alice,
        })
      })

      it('Can change reward per block before start', async () => {
        result = await smartChef2.updateRewardPerBlock(parseEther('5'), {
          from: alice,
        })
        expectEvent(result, 'NewRewardPerBlock', {
          rewardPerSecond: String(parseEther('5')),
        })
        assert.equal(
          String(await smartChef2.rewardPerSecond()),
          String(parseEther('5'))
        )

        // Admin withdraws half of the reward
        await smartChef2.emergencyRewardWithdraw(parseEther('1000'), {
          from: alice,
        })
      })

      it('Can change start/end blocks before start', async () => {
        await expectRevert(
          smartChef2.updateStartAndEndBlocks(startTime + 20000, startTime + 15000, { from: alice }),
          'New startTime must be lower than new endTime'
        )

        const currTime = await getBlockTime()
        await expectRevert(
          smartChef2.updateStartAndEndBlocks(currTime, currTime + 1, {
            from: alice,
          }),
          'New startTime must be higher than current time'
        )

        result = await smartChef2.updateStartAndEndBlocks(
          startTime,
          endTime,
          { from: alice }
        )
        expectEvent(result, 'NewStartAndEndBlocks', {
          startTime: String(startTime),
          endTime: String(endTime),
        })
        assert.equal(await smartChef2.startTime(), startTime)
        assert.equal(await smartChef2.lastRewardTime(), startTime)
        assert.equal(await smartChef2.bonusEndTime(), endTime)
      })

      it('User cannot deposit more than limit', async () => {
        await expectRevert(
          smartChef2.deposit(parseEther('3'), { from: bob }),
          'User amount above limit'
        )
      })

      it('User cannot deposit more than limit', async () => {
        await mockCAKE.approve(smartChef2.address, parseEther('100'), {
          from: bob,
        })
        await smartChef2.deposit(parseEther('1'), { from: bob })
        await expectRevert(
          smartChef2.deposit(parseEther('1.0001'), { from: bob }),
          'User amount above limit'
        )
        await smartChef2.deposit(parseEther('1'), { from: bob })
      })

      it('Users deposit', async () => {
        for (const thisUser of [carol, david, erin]) {
          await mockCAKE.approve(smartChef2.address, parseEther('100'), {
            from: thisUser,
          })
          result = await smartChef2.deposit(parseEther('2'), { from: thisUser })
          assert.equal(String(await smartChef2.pendingReward(thisUser)), '0')
        }
      })

      it('Advance to startTime', async () => {
        await time.increaseTo(startTime)
        assert.equal(String(await smartChef2.pendingReward(bob)), '0')
      })

      it('Advance to startTime + 50', async () => {
        await time.increaseTo(startTime + 50)
        // 5 PT / block * 25% * 50 blocks = 62.5 PT tokens pending
        assert.equal(
          String(await smartChef2.pendingReward(bob)),
          parseEther('62.5').toString()
        )
      })

      it('Admin changes the limit to 10 CAKE tokens', async () => {
        assert.equal(await smartChef2.hasUserLimit(), true)
        result = await smartChef2.updatePoolLimitPerUser(
          true,
          parseEther('10'),
          { from: alice }
        )
        expectEvent(result, 'NewPoolLimit', {
          poolLimitPerUser: parseEther('10').toString(),
        })
      })

      it('Bob deposits more to reach new limit and harvests', async () => {
        await expectRevert(
          smartChef2.deposit(parseEther('8.1'), { from: bob }),
          'User amount above limit'
        )
        result = await smartChef2.deposit(parseEther('8'), { from: bob })

        expectEvent(result, 'Deposit', {
          user: bob,
          amount: String(parseEther('8')),
        })

        expectEvent.inTransaction(
          result.receipt.transactionHash,
          mockPT,
          'Transfer',
          {
            from: smartChef2.address,
            to: bob,
            value: String(parseEther('66.25')),
          }
        )

        assert.equal(
          String(await smartChef2.pendingReward(bob)),
          parseEther('0').toString()
        )
      })

      it('Admin cannot reduce the limit to 5 CAKE tokens', async () => {
        await expectRevert(
          smartChef2.updatePoolLimitPerUser(true, parseEther('5'), {
            from: alice,
          }),
          'New limit must be higher'
        )
      })

      it('Admin removes the user limit', async () => {
        result = await smartChef2.updatePoolLimitPerUser(
          false,
          parseEther('10'),
          { from: alice }
        )
        expectEvent(result, 'NewPoolLimit', {
          poolLimitPerUser: parseEther('0').toString(),
        })
      })

      it('Bob deposits more', async () => {
        result = await smartChef2.deposit(parseEther('50'), { from: bob })
        expectEvent(result, 'Deposit', {
          user: bob,
          amount: String(parseEther('50')),
        })

        assert.equal(
          String(await smartChef2.pendingReward(bob)),
          parseEther('0').toString()
        )
      })

      // it('Advance to end of IFO', async () => {
      //   await time.increaseTo(endTime)

      //   for (const thisUser of [carol, david, erin]) {
      //     await smartChef2.withdraw(parseEther('2'), { from: thisUser })
      //   }

      //   await smartChef2.withdraw(parseEther('60'), { from: bob })

      //   assert.isAtMost(
      //     Number(await mockPT.balanceOf(smartChef2.address)),
      //     parseInt(ONE_BILLION)
      //   )
      // })
    })
    describe('#3 - OTHER TESTS', async () => {
      it('Precision factor - 6 decimals', async () => {
        const mockPT2 = await MockERC20.new(
          'Mock Pool Token Test',
          'PT',
          parseEther('2000'),
          '6',
          {
            from: alice,
          }
        )

        rewardPerSecond = parseEther('10')
        startTime = '1500'
        endTime = '2000'
        poolLimitPerUser = parseEther('2')

        smartChef = await SmartChef.new(
          mockCAKE.address,
          mockPT2.address,
          rewardPerSecond,
          startTime,
          endTime,
          poolLimitPerUser
        )

        // 1e24 https://online.unitconverterpro.com/library/metric-prefixes.php
        assert.equal(
          String(await smartChef.PRECISION_FACTOR()),
          '1000000000000000000000000'
        )
      })
      it('Precision factor - 9 decimals', async () => {
        const mockPT2 = await MockERC20.new(
          'Mock Pool Token Test',
          'PT',
          parseEther('2000'),
          '9',
          {
            from: alice,
          }
        )

        smartChef = await SmartChef.new(
          mockCAKE.address,
          mockPT2.address,
          rewardPerSecond,
          startTime,
          endTime,
          poolLimitPerUser
        )

        // 1e21 https://online.unitconverterpro.com/library/metric-prefixes.php
        assert.equal(
          String(await smartChef.PRECISION_FACTOR()),
          '1000000000000000000000'
        )
      })

      it('Precision factor - 24 decimals', async () => {
        const mockPT2 = await MockERC20.new(
          'Mock Pool Token Test',
          'PT',
          parseEther('2000'),
          '24',
          {
            from: alice,
          }
        )

        smartChef = await SmartChef.new(
          mockCAKE.address,
          mockPT2.address,
          rewardPerSecond,
          startTime,
          endTime,
          poolLimitPerUser
        )

        // 1e6 https://online.unitconverterpro.com/library/metric-prefixes.php
        assert.equal(String(await smartChef.PRECISION_FACTOR()), '1000000')
      })

      it('30 decimals is not supported', async () => {
        const mockPT2 = await MockERC20.new(
          'Mock Pool Token Test',
          'PT',
          parseEther('2000'),
          '30',
          {
            from: alice,
          }
        )

        await expectRevert(
          SmartChef.new(
            mockCAKE.address,
            mockPT2.address,
            rewardPerSecond,
            startTime,
            endTime,
            poolLimitPerUser
          ),
          'Must be inferior to 30'
        )
      })
      it('Cannot deploy a pool with wrong tokens', async () => {
        await expectRevert(
          SmartChef.new(
            mockCAKE.address,
            mockCAKE.address,
            rewardPerSecond,
            startTime,
            endTime,
            poolLimitPerUser,
            {
              from: alice,
            }
          ),
          'Tokens must be be different'
        )

        await expectRevert(
          SmartChef.new(
            mockCAKE.address,
            smartChef.address,
            rewardPerSecond,
            startTime,
            endTime,
            poolLimitPerUser,
            {
              from: alice,
            }
          ),
          'function selector was not recognized and there\'s no fallback function'
        )

        await expectRevert(
          SmartChef.new(
            alice,
            mockCAKE.address,
            rewardPerSecond,
            startTime,
            endTime,
            poolLimitPerUser,
            { from: alice }
          ),
          'function call to a non-contract account'
        )
      })
    })
  }
)
