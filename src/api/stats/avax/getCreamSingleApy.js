
const BigNumber = require('bignumber.js');
const { avaxWeb3: web3 } = require('../../../utils/web3');

const MasterChef = require('../../../abis/avax/IceCreamRewardPool.json');
const pools = require('../../../data/avax/icecreamPool.json');
const fetchPrice = require('../../../utils/fetchPrice');
const { getTotalStakedInUsd } = require('../../../utils/getTotalStakedInUsd');
const { compound } = require('../../../utils/compound');

const masterchef = '0x6CD5a7Acbe8Ddc57C8aC2EE72f3f957e26D81f51';
const oracle = 'tokens';
const oracleId = 'CSHARE';

const DECIMALS = '1e18';
const CHAIN_ID = 43114;
const secondsPerYear = 31536000;

const getCreamSingleApy = async () => {
  let apys = {};

  let promises = [];
  pools.forEach(pool => promises.push(getPoolApy(masterchef, pool)));
  const values = await Promise.all(promises);

  for (let item of values) {
    apys = { ...apys, ...item };
  }

  console.log('SINGLE APYS:', apys);

  return apys;
};

const getPoolApy = async (masterchef, pool) => {
  const [yearlyRewardsInUsd, totalStakedInUsd] = await Promise.all([
    getYearlyRewardsInUsd(masterchef, pool),
    getTotalStakedInUsd(
      masterchef,
      pool.token ?? pool.address,
      pool.oracle ?? 'lps',
      pool.oracleId ?? pool.name,
      pool.decimals ?? '1e18',
      CHAIN_ID
    ),
  ]);
  const simpleApy = yearlyRewardsInUsd.dividedBy(totalStakedInUsd);
  const apy = compound(simpleApy, process.env.BASE_HPY, 1, 0.955);
   console.log(pool.name, simpleApy.valueOf(), apy, totalStakedInUsd.valueOf(), yearlyRewardsInUsd.valueOf());
  return { [pool.name]: apy };
};

const getYearlyRewardsInUsd = async (masterchef, pool) => {
  const masterchefContract = new web3.eth.Contract(MasterChef, masterchef);

  const fromTime = Math.floor(Date.now() / 1000);
  const rewards = new BigNumber(
    await masterchefContract.methods.getGeneratedReward(fromTime, fromTime + 1).call()
  );

  let { allocPoint } = await masterchefContract.methods.poolInfo(pool.poolId).call();
  allocPoint = new BigNumber(allocPoint);

  const totalAllocPoint = new BigNumber(await masterchefContract.methods.totalAllocPoint().call());
  const poolBlockRewards = rewards.times(allocPoint).dividedBy(totalAllocPoint);

  const secondsPerBlock = 1;
  const yearlyRewards = poolBlockRewards.dividedBy(secondsPerBlock).times(secondsPerYear);

  const tokenPrice = await fetchPrice({ oracle, id: oracleId });
  const yearlyRewardsInUsd = yearlyRewards.times(tokenPrice).dividedBy(DECIMALS);

  return yearlyRewardsInUsd;
};

module.exports = getCreamSingleApy;