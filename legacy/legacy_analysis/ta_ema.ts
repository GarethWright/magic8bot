const talib = require('talib')

export const taEma = (s, length) => {
  return new Promise((resolve, reject) => {
    // create object for talib. only close is used for now but rest might come in handy
    if (!s.marketData) {
      s.marketData = { open: [], close: [], high: [], low: [], volume: [] }
    }

    if (s.lookback.length > s.marketData.close.length) {
      for (let i = s.lookback.length - s.marketData.close.length - 1; i >= 0; i--) {
        s.marketData.close.push(s.lookback[i].close)
      }

      // dont calculate until we have enough data
      if (s.marketData.close.length >= length) {
        // fillup marketData for talib.
        // this might need improvment for performance.
        // for (var i = 0; i < length; i++) {
        //  s.marketData.close.push(s.lookback[i].close);
        // }
        // fillup marketData for talib.
        const tmpMarket = s.marketData.close.slice()

        // add current period
        tmpMarket.push(s.period.close)

        // doublecheck length.
        if (tmpMarket.length >= length) {
          talib.execute(
            {
              endIdx: tmpMarket.length - 1,
              inReal: tmpMarket,
              name: 'EMA',
              optInTimePeriod: length,
              startIdx: 0,
            },
            (err, result) => {
              if (err) {
                console.log(err)
                reject(err)
                return
              }

              // Result format: (note: outReal can have multiple items in the array)
              // {
              //   begIndex: 8,
              //   nbElement: 1,
              //   result: { outReal: [ 1820.8621111111108 ] }
              // }
              resolve({
                outReal: result.result.outReal[result.nbElement - 1],
              })
            }
          )
        }
      } else {
        resolve()
      }
    }
  })
}
