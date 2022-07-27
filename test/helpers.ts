import { ethers, network } from 'hardhat'

export const getBlockTime = async (): Promise<number> => {
  // current block number
  const currBlockNum = await ethers.provider.getBlockNumber()

  // current timestamp at block
  const currTime = (await ethers.provider.getBlock(currBlockNum)).timestamp

  return currTime
}

export const minePause = async () => {
  await network.provider.send('evm_setAutomine', [false])
}

export const mineStart = async () => {
  await network.provider.send('evm_setAutomine', [true])
  await network.provider.send('evm_mine') // mine next (+1 blockheight)
}

export const mineNext = async (): Promise<void> => {
  await network.provider.send('evm_mine') // mine next (+1 blockheight)
}

export const setTime = async (seconds: number): Promise<void> => {
  await network.provider.send('evm_increaseTime', [seconds])
}