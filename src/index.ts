import semver from 'semver'
import { magic8bot } from './conf'
import { Conf } from '@m8bTypes'
import { Core, dbDriver, wsServer } from '@lib'

const checkSharePercent = ({ exchanges }: Conf) => {
  exchanges.forEach(({ exchangeName, options: { strategies } }) => {
    const totalShare = strategies.reduce((acc, { share }) => (acc += share), 0)
    if (totalShare > 1) throw new Error(`Exchange ${exchangeName} over 100% share at ${totalShare} --- ctrl+c to exit`)
  })
}

if (semver.gt('10.0.0', process.versions.node)) {
  console.error('You are running a node.js version older than 10.x.x, please upgrade via https://nodejs.org/en/')
  process.exit(1)
}

const run = async () => {
  try {
    checkSharePercent(magic8bot.conf)

    await dbDriver.connect(
      'mongo',
      magic8bot.mongo
    )

    wsServer.init()
    const core = new Core(magic8bot.conf)
    await core.init()
  } catch (e) {
    console.error(e)
  }
}

run()
