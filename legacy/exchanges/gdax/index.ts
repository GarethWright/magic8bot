import 'colors'

import Gdax from 'gdax'
import minimist from 'minimist'

interface Error {
  desc?: string
  code?: string
  body?: string
}

export default (conf) => {
  const so = minimist(process.argv)
  let public_client = {},
    authed_client,
    websocket_client = {},
    websocket_cache = {}

  function publicClient(productId) {
    if (!public_client[productId]) {
      websocketClient(productId)
      public_client[productId] = new Gdax.PublicClient(conf.gdax.apiURI)
    }
    return public_client[productId]
  }

  function websocketClient(productId) {
    if (!websocket_client[productId]) {
      let auth = null
      const client_state: Record<string, any> = {}
      if (conf.gdax.key && conf.gdax.key !== 'YOUR-API-KEY') {
        auth = {
          key: conf.gdax.key,
          secret: conf.gdax.b64secret,
          passphrase: conf.gdax.passphrase,
        }
      }

      const channels = ['matches', 'ticker']

      // subscribe to user channels which need fully auth data
      if (auth) {
        channels.push('user')
      }

      websocket_client[productId] = new Gdax.WebsocketClient([productId], conf.gdax.websocketURI, auth, { channels })

      // initialize a cache for the websocket connection
      websocket_cache[productId] = {
        trades: [],
        trade_ids: [],
        orders: {},
        ticker: {},
      }

      websocket_client[productId].on('open', () => {
        if (so.debug) {
          console.log('websocket connection to ' + productId + ' opened')
        }
      })

      websocket_client[productId].on('message', (message) => {
        // all messages with user_id are related to trades for current authenticated user
        if (message.user_id) {
          if (so.debug) {
            console.log('websocket user channel income', message)
          }

          switch (message.type) {
            case 'open':
              handleOrderOpen(message, productId)
              break
            case 'done':
              handleOrderDone(message, productId)
              break
            case 'change':
              handleOrderChange(message, productId)
              break
            case 'match':
              handleOrderMatch(message, productId)
              break
            default:
              break
          }
        }

        switch (message.type) {
          case 'open':
            break
          case 'done':
            break
          case 'change':
            break
          case 'match':
            handleTrade(message, productId)
            break
          case 'ticker':
            handleTicker(message, productId)
            break
          default:
            break
        }
      })

      websocket_client[productId].on('error', (err) => {
        client_state.errored = true

        if (so.debug) {
          console.error('websocket error: ', err, 'restarting websocket connection')
        }

        websocket_client[productId].disconnect()
        websocket_client[productId] = null
        websocket_cache[productId] = null
        websocketClient(productId)
      })

      websocket_client[productId].on('close', () => {
        if (client_state.errored) {
          client_state.errored = false
          return
        }

        if (so.debug) {
          console.error('websocket connection to ' + productId + ' closed, attempting reconnect')
        }

        websocket_client[productId] = null
        websocket_client[productId] = websocketClient(productId)
      })
    }
    return websocket_client[productId]
  }

  function authedClient() {
    if (!authed_client) {
      if (!conf.gdax || !conf.gdax.key || conf.gdax.key === 'YOUR-API-KEY') {
        throw new Error('please configure your GDAX credentials in conf.js')
      }
      authed_client = new Gdax.AuthenticatedClient(
        conf.gdax.key,
        conf.gdax.b64secret,
        conf.gdax.passphrase,
        conf.gdax.apiURI
      )
    }
    return authed_client
  }

  function statusErr(resp, body) {
    if (resp.statusCode !== 200) {
      const err = new Error('non-200 status: ' + resp.statusCode) as Error
      err.code = 'HTTP_STATUS'
      err.body = body
      return err
    }
  }

  function retry(method, args, err) {
    if (method !== 'getTrades') {
      console.error(('\nGDAX API is down! unable to call ' + method + ', retrying in 10s').red)
      // if (err) console.error(err)
      // console.error(args.slice(0, -1))
    }
    setTimeout(function() {
      exchange[method].apply(exchange, args)
    }, 10000)
  }

  function handleOrderOpen(update, productId) {
    websocket_cache[productId].orders['~' + update.order_id] = {
      id: update.order_id,
      price: update.price,
      size: update.remaining_size,
      productId: update.productId,
      side: update.side,
      status: 'open',
      settled: false,
      filled_size: 0,
    }
  }

  function handleOrderDone(update, productId) {
    const cached_order = websocket_cache[productId].orders['~' + update.order_id]
    if (cached_order) {
      /*
      order canceled by user or on platform: which must be retried see "reason":
      { type: 'done',
        side: 'sell',
        order_id: 'xxxx',
        reason: 'canceled',
        productId: 'LTC-EUR',
        price: '142.33000000',
        remaining_size: '1.24390150',
        sequence: 1337,
        user_id: '5a2aeXXX',
        profile_id: 'xxx',
        time: '2018-03-09T16:28:49.293000Z'
      }

      complete order response; no further action:
      { type: 'done',
        side: 'sell',
        order_id: 'xxxx',
        reason: 'filled',
        productId: 'LTC-EUR',
        price: '142.81000000',
        remaining_size: '0.00000000',
        sequence: 1337,
        user_id: '5a2aeXXX',
        profile_id: 'xxx',
        time: '2018-03-09T16:56:39.352000Z'
      }
      */

      // get order "reason":
      //  - "canceled" by user or platform
      //  - "filled" order successfully placed and filled
      const reason = update.reason

      cached_order.status = 'done'

      // "canceled" is not a success order instead it must be retried
      // force magic8bot a order retry; see "engine.js" for possible retry conditions
      if (reason && reason == 'canceled') {
        cached_order.status = 'rejected'
        cached_order.reject_reason = 'post only'
      }

      cached_order.done_at = update.time
      cached_order.done_reason = reason
      cached_order.settled = true
    }
  }

  function handleOrderChange(update, productId) {
    const cached_order = websocket_cache[productId].orders['~' + update.order_id]
    if (cached_order && update.new_size) {
      cached_order.size = update.new_size
    }
  }

  function handleOrderMatch(update, productId) {
    const cached_order =
      websocket_cache[productId].orders['~' + update.maker_order_id] ||
      websocket_cache[productId].orders['~' + update.taker_order_id]
    if (cached_order) {
      cached_order.price = update.price
      cached_order.filled_size = (parseFloat(cached_order.filled_size) + update.size).toString()
    }
  }

  function handleTrade(trade, productId) {
    const cache = websocket_cache[productId]
    cache.trades.push(trade)
    cache.trade_ids.push(trade.trade_id)
  }

  function handleTicker(ticker, productId) {
    websocket_cache[productId].ticker = ticker
  }

  const orders = {}

  const exchange = {
    name: 'gdax',
    historyScan: 'backward',
    makerFee: 0,
    takerFee: 0.3,
    backfillRateLimit: 335,

    getProducts() {
      return require('./products.json')
    },

    getTrades(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = publicClient(opts.productId)
      const args: Record<string, any> = {}
      if (opts.from) {
        // move cursor into the future
        args.before = opts.from
      } else if (opts.to) {
        // move cursor into the past
        args.after = opts.to
      }
      // check for locally cached trades from the websocket feed
      const cache = websocket_cache[opts.productId]
      const max_trade_id = cache.trade_ids.reduce(function(a, b) {
        return Math.max(a, b)
      }, -1)
      if (opts.from && max_trade_id >= opts.from) {
        const fromIndex = cache.trades.findIndex((value) => {
          return value.trade_id == opts.from
        })
        let newTrades = cache.trades.slice(fromIndex + 1)
        newTrades = newTrades.map(function(trade) {
          return {
            trade_id: trade.trade_id,
            time: new Date(trade.time).getTime(),
            size: Number(trade.size),
            price: Number(trade.price),
            side: trade.side,
          }
        })
        newTrades.reverse()
        cb(null, newTrades)
        // trim cache
        cache.trades = cache.trades.slice(fromIndex)
        cache.trade_ids = cache.trade_ids.slice(fromIndex)
        return
      }
      if (so.debug) console.log('getproducttrades call')
      client.getProductTrades(opts.productId, args, function(err, resp, body) {
        if (!err) err = statusErr(resp, body)
        if (err) return retry('getTrades', func_args, err)
        const trades = body.map(function(trade) {
          return {
            trade_id: trade.trade_id,
            time: new Date(trade.time).getTime(),
            size: Number(trade.size),
            price: Number(trade.price),
            side: trade.side,
          }
        })
        trades.reverse()
        cb(null, trades)
      })
    },

    getBalance(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = authedClient()

      if (so.debug) {
        console.log('getaccounts call')
      }

      client.getAccounts(function(err, resp, body) {
        if (!err) err = statusErr(resp, body)
        if (err) return retry('getBalance', func_args, err)
        const balance: Record<string, any> = { asset: 0, currency: 0 }
        body.forEach(function(account) {
          if (account.currency === opts.currency) {
            balance.currency = account.balance
            balance.currency_hold = account.hold
          } else if (account.currency === opts.asset) {
            balance.asset = account.balance
            balance.asset_hold = account.hold
          }
        })
        cb(null, balance)
      })
    },

    getQuote(opts, cb) {
      // check websocket cache first
      if (websocket_cache[opts.productId]) {
        const ticker = websocket_cache[opts.productId].ticker
        if (ticker.best_ask && ticker.best_bid) {
          cb(null, { bid: ticker.best_bid, ask: ticker.best_ask })
          return
        }
      }
      const func_args = [].slice.call(arguments)
      const client = publicClient(opts.productId)
      if (so.debug) console.log('getproductticker call')
      client.getProductTicker(opts.productId, function(err, resp, body) {
        if (!err) err = statusErr(resp, body)
        if (err) return retry('getQuote', func_args, err)
        if (body.bid || body.ask) cb(null, { bid: body.bid, ask: body.ask })
        else cb({ code: 'ENOTFOUND', body: opts.productId + ' has no liquidity to quote' })
      })
    },

    cancelOrder(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = authedClient()

      if (so.debug) {
        console.log('cancelorder call')
      }

      client.cancelOrder(opts.order_id, function(err, resp, body) {
        if (body && (body.message === 'Order already done' || body.message === 'order not found')) {
          return cb()
        }

        if (!err) {
          err = statusErr(resp, body)
        }

        if (err) {
          return retry('cancelOrder', func_args, err)
        }

        cb()
      })
    },

    buy(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = authedClient()
      if (typeof opts.post_only === 'undefined') {
        opts.post_only = true
      }
      if (opts.order_type === 'taker') {
        delete opts.price
        delete opts.post_only
        delete opts.cancel_after
        opts.type = 'market'
      } else {
        opts.time_in_force = 'GTT'
      }
      delete opts.order_type

      if (so.debug) {
        console.log('buy call')
      }

      client.buy(opts, function(err, resp, body) {
        if (body && body.message === 'Insufficient funds') {
          return cb(null, {
            status: 'rejected',
            reject_reason: 'balance',
          })
        }

        if (!err) {
          err = statusErr(resp, body)
        }

        if (err) {
          return retry('buy', func_args, err)
        }

        orders['~' + body.id] = body
        cb(null, body)
      })
    },

    sell(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = authedClient()

      if (typeof opts.post_only === 'undefined') {
        opts.post_only = true
      }

      if (opts.order_type === 'taker') {
        delete opts.price
        delete opts.post_only
        delete opts.cancel_after
        opts.type = 'market'
      } else {
        opts.time_in_force = 'GTT'
      }
      delete opts.order_type

      if (so.debug) {
        console.log('sell call')
      }

      client.sell(opts, function(err, resp, body) {
        if (body && body.message === 'Insufficient funds') {
          return cb(null, {
            status: 'rejected',
            reject_reason: 'balance',
          })
        }

        if (!err) {
          err = statusErr(resp, body)
        }

        if (err) {
          return retry('sell', func_args, err)
        }

        orders['~' + body.id] = body
        cb(null, body)
      })
    },

    getOrder(opts, cb) {
      if (websocket_cache[opts.productId] && websocket_cache[opts.productId].orders['~' + opts.order_id]) {
        const order_cache = websocket_cache[opts.productId].orders['~' + opts.order_id]

        if (so.debug) {
          console.log('getOrder websocket cache', order_cache)
        }

        cb(null, order_cache)
        return
      }

      const func_args = [].slice.call(arguments)
      const client = authedClient()

      if (so.debug) {
        console.log('getorder call')
      }

      client.getOrder(opts.order_id, function(err, resp, body) {
        if (!err && resp.statusCode !== 404) {
          err = statusErr(resp, body)
        }

        if (err) {
          return retry('getOrder', func_args, err)
        }

        if (resp.statusCode === 404) {
          // order was cancelled. recall from cache
          body = orders['~' + opts.order_id]
          body.status = 'done'
          body.done_reason = 'canceled'
        }

        cb(null, body)
      })
    },

    // return the property used for range querying.
    getCursor(trade) {
      return trade.trade_id
    },
  }
  return exchange
}
