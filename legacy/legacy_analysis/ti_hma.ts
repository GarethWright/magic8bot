// Hull Moving Average:
// https://tulipindicators.org/hma

import ti from 'tulind'

export const tiHma = (s, minPeriods, trendFull) => {
  return new Promise((resolve) => {
    if (!s.marketData) {
      s.marketData = { close: [] }
    }

    if (s.lookback.length > s.marketData.close.length) {
      for (let i = s.lookback.length - s.marketData.close.length - 1; i >= 0; i--) {
        s.marketData.close.push(s.lookback[i].close)
      }
    }

    if (s.marketData.close.length < minPeriods) {
      resolve()
      return
    }

    const tmpClose = s.marketData.close.slice()
    tmpClose.push(s.period.close)

    ti.indicators.hma.indicator([tmpClose], [trendFull], (err, results) => {
      resolve(results[0][results[0].length - 1])
    })
  })
}
