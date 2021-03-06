import z from 'zero-fill'
import n from 'numbro'
import { bollinger } from '@plugins'
import { phenotypes } from '@util'

export default {
  name: 'bollinger',
  description: 'Buy when (Signal ≤ Lower Bollinger Band) and sell when (Signal ≥ Upper Bollinger Band).',

  getOptions() {
    this.option('period', 'period length, same as --period_length', String, '1h')
    this.option('period_length', 'period length, same as --period', String, '1h')
    this.option('bollinger_size', 'period size', Number, 20)
    this.option(
      'bollinger_time',
      'times of standard deviation between the upper band and the moving averages',
      Number,
      2
    )
    this.option(
      'bollinger_upper_bound_pct',
      'pct the current price should be near the bollinger upper bound before we sell',
      Number,
      0
    )
    this.option(
      'bollinger_lower_bound_pct',
      'pct the current price should be near the bollinger lower bound before we buy',
      Number,
      0
    )
  },

  calculate(s) {
    // calculate Bollinger Bands
    bollinger(s, 'bollinger', s.options.bollinger_size)
  },

  onPeriod(s, cb) {
    if (s.period.bollinger) {
      if (s.period.bollinger.upper && s.period.bollinger.lower) {
        const upperBound = s.period.bollinger.upper[s.period.bollinger.upper.length - 1]
        const lowerBound = s.period.bollinger.lower[s.period.bollinger.lower.length - 1]
        if (s.period.close > (upperBound / 100) * (100 - s.options.bollinger_upper_bound_pct)) {
          s.signal = 'sell'
        } else if (s.period.close < (lowerBound / 100) * (100 + s.options.bollinger_lower_bound_pct)) {
          s.signal = 'buy'
        } else {
          s.signal = null // hold
        }
      }
    }
    cb()
  },

  onReport(s) {
    const cols = []
    if (s.period.bollinger) {
      if (s.period.bollinger.upper && s.period.bollinger.lower) {
        const upperBound = s.period.bollinger.upper[s.period.bollinger.upper.length - 1]
        const lowerBound = s.period.bollinger.lower[s.period.bollinger.lower.length - 1]
        let color = 'grey'
        if (s.period.close > (upperBound / 100) * (100 - s.options.bollinger_upper_bound_pct)) {
          color = 'green'
        } else if (s.period.close < (lowerBound / 100) * (100 + s.options.bollinger_lower_bound_pct)) {
          color = 'red'
        }
        // @ts-ignore
        cols.push(z(8, n(s.period.close).format('+00.0000'), ' ')[color])
        cols.push(
          z(
            8,
            // @ts-ignore
            n(lowerBound)
              .format('0.000000')
              .substring(0, 7),
            ' '
          ).cyan
        )
        cols.push(
          z(
            8,
            // @ts-ignore
            n(upperBound)
              .format('0.000000')
              .substring(0, 7),
            ' '
          ).cyan
        )
      }
    } else {
      cols.push('         ')
    }
    return cols
  },

  phenotypes: {
    // -- common
    period_length: phenotypes.rangePeriod(1, 120, 'm'),
    markdown_buy_pct: phenotypes.rangeFloat(-1, 5),
    markup_sell_pct: phenotypes.rangeFloat(-1, 5),
    order_type: phenotypes.listOption(['maker', 'taker']),
    sell_stop_pct: phenotypes.range1(1, 50),
    buy_stop_pct: phenotypes.range1(1, 50),
    profit_stop_enable_pct: phenotypes.range1(1, 20),
    profit_stop_pct: phenotypes.range0(1, 20),

    // -- strategy
    bollinger_size: phenotypes.range0(1, 40),
    bollinger_time: phenotypes.rangeFloat(1, 6),
    bollinger_upper_bound_pct: phenotypes.rangeFloat(-1, 30),
    bollinger_lower_bound_pct: phenotypes.rangeFloat(-1, 30),
  },
}
