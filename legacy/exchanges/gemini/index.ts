import 'colors'
import GeminiAPI from 'gemini-api'
import path from 'path'
import minimist from 'minimist'
import n from 'numbro'

export default (conf) => {
  const s = {
    options: minimist(process.argv),
  }
  const so = s.options

  let public_client, authed_client

  function publicClient() {
    if (!public_client) {
      public_client = new GeminiAPI.default({
        sandbox: conf.gemini.sandbox || false,
      })
    }
    return public_client
  }

  function authedClient() {
    if (!authed_client) {
      if (!conf.gemini || !conf.gemini.key || (!conf.gemini.key as any) === 'YOUR-API-KEY') {
        throw new Error('please configure your Gemini credentials in ' + path.resolve(__dirname, 'conf.js'))
      }

      authed_client = new GeminiAPI.default({
        key: conf.gemini.key,
        secret: conf.gemini.secret,
        sandbox: conf.gemini.sandbox,
      })
    }
    return authed_client
  }

  function joinProduct(productId) {
    return (productId.split('-')[0].toLowerCase() + productId.split('-')[1]).toLowerCase()
  }

  function retry(method, args, error) {
    if (error.code === 429) {
      console.error(`\nGemini API rate limit exceeded! unable to call ${method}, aborting`.red)
      return
    }

    if (method !== 'getTrades') {
      console.error(`\nGemini API is down: (${method}) ${error.message}`.red)
      console.log('Retrying in 30 sseconds ...'.yellow)
    }

    debugOut(error)

    setTimeout(function() {
      exchange[method].apply(exchange, args)
    }, 30000)
  }

  function debugOut(msg) {
    if (so.debug) console.log(msg)
  }

  const orders = {}

  const exchange = {
    name: 'gemini',
    historyScan: 'forward',
    makerFee: 0.1,
    takerFee: 0.1,

    getProducts() {
      return require('./products.json')
    },

    getTrades(opts, cb) {
      const func_args = [].slice.call(arguments)
      const args = {
        limit_trades: 1000,
        since: opts.from,
      }

      const client = publicClient()
      client
        .getTradeHistory(joinProduct(opts.productId), args)
        .then((body) => {
          const trades = body
            .filter((t) => {
              return t.type !== 'auction'
            })
            .map(function(trade) {
              return {
                trade_id: trade.tid,
                time: trade.timestampms,
                size: Number(trade.amount),
                price: Number(trade.price),
                side: trade.type,
              }
            })

          cb(null, trades)
        })
        .catch((error) => retry('getTrades', func_args, error))
    },

    getBalance(opts, cb) {
      const func_args = [].slice.call(arguments)

      const client = authedClient()
      client
        .getMyAvailableBalances()
        .then((body) => {
          const asset = body.find((x) => x.currency.toLowerCase() === opts.asset.toLowerCase())
          const currency = body.find((x) => x.currency.toLowerCase() === opts.currency.toLowerCase())

          const balance = {
            asset: n(asset.amount).format('0.00000'),
            asset_hold: n(asset.amount)
              .subtract(asset.available)
              .format('0.00000'),
            currency: n(currency.amount).format('0.00'),
            currency_hold: n(currency.amount)
              .subtract(currency.available)
              .format('0.00'),
          }

          debugOut('Balance/Hold:')
          debugOut(`  ${currency.currency} (${balance.currency}/${balance.currency_hold})`)
          debugOut(`  ${asset.currency} (${balance.asset}/${balance.asset_hold})`)

          cb(null, balance)
        })
        .catch((error) => retry('getBalance', func_args, error))
    },

    getQuote(opts, cb) {
      const func_args = [].slice.call(arguments)

      const client = publicClient()
      client
        .getTicker(joinProduct(opts.productId))
        .then((body) => {
          const r = {
            bid: String(body.bid),
            ask: String(body.ask),
          }

          cb(null, r)
        })
        .catch((error) => retry('getQuote', func_args, error))
    },

    cancelOrder(opts, cb) {
      const func_args = [].slice.call(arguments)
      const params = {
        order_id: opts.order_id,
      }

      debugOut(`Cancelling order ${opts.order_id}`)

      const client = authedClient()
      client
        .cancelOrder(params)
        .then(cb())
        .catch((error) => retry('cancelOrder', func_args, error))
    },

    buy(opts, cb) {
      const params = {
        symbol: joinProduct(opts.productId),
        amount: n(opts.size).format('0.00000'),
        price: n(opts.price).format('0.00'),
        side: 'buy',
        type: 'exchange limit',
        options: [],
      }

      if (opts.order_type === 'taker') {
        params.options.push('immediate-or-cancel')
      } else if (opts.post_only) {
        params.options.push('maker-or-cancel')
      }

      debugOut(`Requesting ${opts.order_type} buy for ${opts.size} assets`)

      const client = authedClient()
      client
        .newOrder(params)
        .then((body) => {
          const order: Record<string, any> = {
            id: body.order_id,
            status: 'open',
            price: Number(opts.price),
            size: Number(opts.size),
            created_at: new Date().getTime(),
            filled_size: '0',
            ordertype: opts.order_type,
            postonly: !!opts.post_only,
          }

          if (opts.post_only && body.is_cancelled) {
            ; (order.status = 'rejected'), (order.reject_reason = 'post only')
          }

          debugOut(`    Purchase ID: ${body.id}`)

          orders['~' + body.order_id] = order
          cb(null, order)
        })
        .catch((error) => cb(error))
    },

    sell(opts, cb) {
      const params = {
        symbol: joinProduct(opts.productId),
        amount: n(opts.size).format('0.00000'),
        price: n(opts.price).format('0.00'),
        side: 'sell',
        type: 'exchange limit',
        options: [],
      }

      if (opts.order_type === 'taker') {
        params.options.push('immediate-or-cancel')
      } else if (opts.post_only) {
        params.options.push('maker-or-cancel')
      }

      debugOut(`Requesting ${opts.order_type} sell for ${opts.size} assets`)

      const client = authedClient()
      client
        .newOrder(params)
        .then((body) => {
          const order: Record<string, any> = {
            id: body.order_id,
            status: 'open',
            price: Number(opts.price),
            size: Number(opts.size),
            created_at: new Date().getTime(),
            filled_size: '0',
            ordertype: opts.order_type,
            postonly: !!opts.post_only,
          }

          if (opts.post_only && body.is_cancelled) {
            ; (order.status = 'rejected'), (order.reject_reason = 'post only')
          }

          debugOut(`    Purchase ID: ${body.id}`)

          orders['~' + body.order_id] = order
          cb(null, order)
        })
        .catch((error) => cb(error))
    },

    getOrder(opts, cb) {
      const order = orders['~' + opts.order_id]
      const params = {
        order_id: opts.order_id,
      }

      const client = authedClient()
      client
        .getMyOrderStatus(params)
        .then((body) => {
          if (typeof body !== 'undefined') {
            if (body.is_cancelled) {
              order.status = 'done'
              order.done_at = new Date().getTime()
              order.filled_size = '0.00000'
            } else if (!body.is_live) {
              order.status = 'done'
              order.done_at = new Date().getTime()
              order.filled_size = n(body.executed_amount).format('0.00000')
              order.price = n(body.avg_execution_price).format('0.00')
            } else {
              order.filled_size = n(body.executed_amount).format('0.00000')
              order.price = n(body.avg_execution_price).format('0.00')
            }
          }

          debugOut(`Lookup order ${opts.order_id} status is ${order.status}`)

          cb(null, order)
        })
        .catch((error) => cb(error))
    },

    // return the property used for range querying.
    getCursor(trade) {
      return trade.time || trade
    },
  }
  return exchange
}
