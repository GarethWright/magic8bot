/**
 * @description Sample configuration. Chances are this will be reduced
 *              to only configure mongo and exchange authentication.
 *              All other config options will be through GUI.
 */

import { MongoConf, Base, ExchangeConf, Conf, Magic8bot } from '@m8bTypes'

// Your mongodb conf
const mongo: MongoConf = {
  db: 'magic8bot',
  host: 'localhost',
  password: null,
  port: 27017,
  replicaSet: null,
  username: null,
}

// Simulation settings
// NOT IMPLEMENTED
const sim = {
  asset_capital: 0,
  currency_capital: 1000,
  symmetrical: false,
}

const base: Base = {
  ...sim,
  days: 7,
  period: '1m',

  // BELOW NOT IMPLEMENTED
  avg_slippage_pct: 0.045,
  balance_snapshot_period: '15m',
  buy_pct: 100,
  buy_stop_pct: 0,
  cancel_after: 'day',
  currency_increment: null,
  exact_buy_orders: false,
  exact_sell_orders: false,
  keep_lookback_periods: 50000,
  markdown_buy_pct: 0,
  markup_sell_pct: 0,
  max_buy_loss_pct: 5,
  max_sell_loss_pct: 5,
  max_slippage_pct: 5,
  min_periods: 1,
  min_prev_trades: 0,
  order_adjust_time: 500,
  order_poll_time: 500,
  order_type: 'maker',
  poll_trades: 300,
  post_only: true,
  profit_stop_enable_pct: 0,
  profit_stop_pct: 1,
  reset_profit: false,
  rsi_periods: 14,
  sell_pct: 100,
  sell_stop_pct: 0,
  use_fee_asset: false,
  use_prev_trades: false,
  wait_for_settlement: 500,
}

const exchanges: ExchangeConf[] = [
  {
    // each exchange will inherit from base, unless overwritten
    auth: {
      apiURI: 'https://api.pro.coinbase.com',
      b64secret: '',
      key: '',
      passphrase: '',
      websocketURI: 'wss://ws-feed.pro.coinbase.com',
    },
    exchangeName: 'gdax',
    options: {
      strategies: [
        // each strategy will inherit from exchange, unless overwritten
        {
          symbol: 'BTC-USD',
          share: 0.25,
          strategyName: 'ta_macd',
        },
        {
          symbol: 'BCH-USD',
          share: 0.25,
          strategyName: 'ta_macd',
        },
        {
          symbol: 'LTC-USD',
          share: 0.25,
          strategyName: 'ta_macd',
        },
        {
          period: '4m',
          symbol: 'ETH-USD',
          share: 0.25,
          strategyName: 'ta_macd',
        },
      ],
    },
  },
  {
    auth: {
      key: '',
      secret: '',
    },
    exchangeName: 'binance',
    options: {
      strategies: [
        {
          symbol: 'BTC-USDT',
          share: 1,
          strategyName: 'ta_macd',
        },
      ],
    },
  },
]

const conf: Conf = {
  // setting a session_id to a previous session will load that session
  // NOT YET IMPLEMENTED
  session_id: null,

  exchanges,
  ...base,

  // Only live mode works currently
  mode: 'live',
}

export const magic8bot: Magic8bot = {
  conf,
  mongo,

  debug: false,
  port: 3000,
  srcRoot: null,
  version: null,
}
