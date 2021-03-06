const talib = require('talib')

export const taUltosc = (s, minPeriods, timeperiod1, timeperiod2, timeperiod3) => {
  return new Promise((resolve, reject) => {
    // create object for talib. only close is used for now but rest might come in handy
    if (!s.marketData) {
      s.marketData = { open: [], close: [], high: [], low: [], volume: [] }
    }

    if (s.lookback.length > s.marketData.close.length) {
      for (let i = s.lookback.length - s.marketData.close.length - 1; i >= 0; i--) {
        s.marketData.high.push(s.lookback[i].high)
        s.marketData.low.push(s.lookback[i].low)
        s.marketData.close.push(s.lookback[i].close)
      }
    }

    if (s.marketData.close.length < minPeriods) {
      resolve()
      return
    }

    const tmpHigh = s.marketData.high.slice()
    tmpHigh.push(s.period.high)

    const tmpLow = s.marketData.low.slice()
    tmpLow.push(s.period.low)

    const tmpClose = s.marketData.close.slice()
    tmpClose.push(s.period.close)

    talib.execute(
      {
        close: tmpClose,
        endIdx: tmpHigh.length - 1,
        high: tmpHigh,
        low: tmpLow,
        name: 'ULTOSC',
        optInTimePeriod1: timeperiod1,
        optInTimePeriod2: timeperiod2,
        optInTimePeriod3: timeperiod3,
        startIdx: 0,
      },
      (err, result) => {
        if (err) {
          reject(err)
          return
        }

        resolve(result.result.outReal[result.nbElement - 1])
      }
    )
  })
}
