import tulind from 'tulind'

export const tiMacd = (s, key, shortPeriod, longPeriod, signalPeriod, optMarket) => {
  return new Promise((resolve, reject) => {
    if (s.lookback.length >= Math.max(shortPeriod, longPeriod)) {
      let tmpMarket = optMarket
      if (!tmpMarket) {
        tmpMarket = s.lookback.slice(0, 1000).map((x) => x.close)
        tmpMarket.reverse()
        // add current period
        tmpMarket.push(s.period.close)
      } else {
        tmpMarket = tmpMarket.map((x) => x.close)
      }
      tulind.indicators.macd.indicator([tmpMarket], [shortPeriod, longPeriod, signalPeriod], (err, result) => {
        if (err) {
          console.log(err)
          reject(err)
          return
        }

        resolve({
          macd: result[0],
          macd_histogram: result[2],
          macd_signal: result[1],
        })
      })
    } else {
      reject()
    }
  })
}
