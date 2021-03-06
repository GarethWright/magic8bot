// Chaikin Money Flow
export const cmf = (s, key, length) => {
  if (s.lookback.length >= length) {
    let MFV = 0
    let SOV = 0

    s.lookback.slice(0, length).forEach((cur) => {
      MFV += (cur.volume * (cur.close - cur.low - (cur.high - cur.close))) / (cur.high - cur.low)
      SOV += cur.volume
    })

    s.period[key] = MFV / SOV
  }
}
