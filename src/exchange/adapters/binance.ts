import { TradeItem } from '@lib'
import { ExchangeAdapter } from './base'
import { time } from '@util'

export const binance: ExchangeAdapter = {
  scan: 'forward',

  mapTradeParams: (startTime: number) => {
    if (startTime === null) return null
    const endTime = time(startTime).add.h(1)
    return { startTime, endTime }
  },

  getTradeCursor: (trade: TradeItem) => {
    return trade.time
  },
}
