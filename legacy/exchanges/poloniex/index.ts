import 'colors'

import Poloniex from 'poloniex.js'
import moment from 'moment'
import n from 'numbro'

export default (conf) => {
  let public_client, authed_client

  function publicClient(/*productId*/) {
    if (!public_client) public_client = new Poloniex()
    return public_client
  }

  function authedClient() {
    if (!authed_client) {
      if (!conf.poloniex || !conf.poloniex.key || conf.poloniex.key === 'YOUR-API-KEY') {
        throw new Error('please configure your Poloniex credentials in conf.js')
      }
      authed_client = new Poloniex(conf.poloniex.key, conf.poloniex.secret)
    }
    return authed_client
  }

  function joinProduct(productId) {
    return productId.split('-')[1] + '_' + productId.split('-')[0]
  }

  function retry(method, args) {
    setTimeout(function() {
      exchange[method].apply(exchange, args)
    }, 1)
  }

  const orders = {}

  const exchange = {
    name: 'poloniex',
    historyScan: 'backward',
    makerFee: 0.15,
    takerFee: 0.25,

    getProducts() {
      return require('./products.json')
    },

    getTrades(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = publicClient()
      const args: Record<string, any> = {
        currencyPair: joinProduct(opts.productId),
      }
      if (opts.from) {
        args.start = opts.from
      }
      if (opts.to) {
        args.end = opts.to
      }
      if (args.start && !args.end) {
        // add 12 hours
        args.end = args.start + 43200
      } else if (args.end && !args.start) {
        // subtract 12 hours
        args.start = args.end - 43200
      }

      client._public('returnTradeHistory', args, function(err, body) {
        if (err) return cb(err)
        if (typeof body === 'string') {
          return retry('getTrades', func_args)
        }
        if (!body.map) {
          console.error('\ngetTrades odd result:')
          console.error(body)
          return retry('getTrades', func_args)
        }
        const trades = body.map(function(trade) {
          return {
            trade_id: trade.tradeID,
            time: moment.utc(trade.date).valueOf(),
            size: Number(trade.amount),
            price: Number(trade.rate),
            side: trade.type,
          }
        })
        cb(null, trades)
      })
    },

    getBalance(opts, cb) {
      const args = [].slice.call(arguments)
      const client = authedClient()
      client.returnCompleteBalances(function(err, body) {
        if (err) return cb(err)
        const balance: Record<string, any> = { asset: 0, currency: 0 }
        if (typeof body === 'string') {
          return retry('getBalance', args)
        }
        if (body.error) {
          console.error('\ngetBalance error:')
          console.error(body)
          return retry('getBalance', args)
        }
        if (body[opts.currency]) {
          balance.currency = n(body[opts.currency].available)
            .add(body[opts.currency].onOrders)
            .format('0.00000000')
          balance.currency_hold = body[opts.currency].onOrders
        }
        if (body[opts.asset]) {
          balance.asset = n(body[opts.asset].available)
            .add(body[opts.asset].onOrders)
            .format('0.00000000')
          balance.asset_hold = body[opts.asset].onOrders
        }
        cb(null, balance)
      })
    },

    getOrderBook(opts, cb) {
      const client = publicClient()
      const params = {
        currencyPair: joinProduct(opts.productId),
        depth: 10,
      }
      client._public('returnOrderBook', params, function(err, data) {
        if (typeof data !== 'object') {
          return cb(null, [])
        }
        if (data.error) {
          console.error('getOrderBook error:')
          console.error(data)
          return retry('getOrderBook', params)
        }
        cb(null, {
          buyOrderRate: data.bids[0][0],
          buyOrderAmount: data.bids[0][1],
          sellOrderRate: data.asks[0][0],
          sellOrderAmount: data.asks[0][1],
        })
      })
    },

    getQuote(opts, cb) {
      const args = [].slice.call(arguments)
      const client = publicClient()
      const productId = joinProduct(opts.productId)
      client.getTicker(function(err, body) {
        if (err) return cb(err)
        if (typeof body === 'string') {
          return retry('getQuote', args)
        }
        if (body.error) {
          console.error('\ngetQuote error:')
          console.error(body)
          return retry('getQuote', args)
        }
        const quote = body[productId]
        if (!quote) return cb(new Error('no quote for ' + productId))
        if (quote.isFrozen == '1') console.error('\nwarning: product ' + productId + ' is frozen')
        cb(null, {
          bid: quote.highestBid,
          ask: quote.lowestAsk,
        })
      })
    },

    cancelOrder(opts, cb) {
      const args = [].slice.call(arguments)
      const client = authedClient()
      client._private('cancelOrder', { orderNumber: opts.order_id }, function(err, result) {
        if (typeof result === 'string') {
          return retry('cancelOrder', args)
        }
        if (!err && !result.success) {
          // sometimes the order gets cancelled on the server side for some reason and we get this. ignore that case...
          if (result.error !== 'Invalid order number, or you are not the person who placed the order.') {
            err = new Error('unable to cancel order')
            err.body = result
          }
        }
        cb(err)
      })
    },

    trade(type, opts, cb) {
      const args = [].slice.call(arguments)
      const client = authedClient()
      const params = {
        currencyPair: joinProduct(opts.productId),
        rate: opts.price,
        amount: opts.size,
        postOnly: opts.post_only === false ? '0' : '1',
      }
      client._private(type, params, function(err, result) {
        if (typeof result === 'string') {
          return retry('trade', args)
        }
        const order: Record<string, any> = {
          id: result ? result.orderNumber : null,
          status: 'open',
          price: opts.price,
          size: opts.size,
          post_only: !!opts.post_only,
          created_at: new Date().getTime(),
          filled_size: '0',
        }
        if (result && result.error === 'Unable to place post-only order at this price.') {
          order.status = 'rejected'
          order.reject_reason = 'post only'
          return cb(null, order)
        } else if (result && result.error && result.error.match(/^Not enough/)) {
          order.status = 'rejected'
          order.reject_reason = 'balance'
          return cb(null, order)
        } else if (result && result.error && result.error.match(/^Nonce must be greater/)) {
          return retry('trade', args)
        }
        if (!err && result.error) {
          err = new Error('unable to ' + type)
          err.body = result
        }
        if (err) return cb(err)
        orders['~' + result.orderNumber] = order
        cb(null, order)
      })
    },

    buy(opts, cb) {
      exchange.trade('buy', opts, cb)
    },

    sell(opts, cb) {
      exchange.trade('sell', opts, cb)
    },

    getOrder(opts, cb) {
      const args = [].slice.call(arguments)
      const order = orders['~' + opts.order_id]
      if (!order) return cb(new Error('order not found in cache'))
      const client = authedClient()
      const params = {
        currencyPair: joinProduct(opts.productId),
      }
      client._private('returnOpenOrders', params, function(err, body) {
        if (err) return cb(err)
        if (typeof body === 'string' || !body) {
          return retry('getOrder', args)
        }
        let active = false
        if (!body.forEach) {
          console.error('\nreturnOpenOrders odd result in checking state of order, trying again')
          // console.error(body)
          return retry('getOrder', args)
        } else {
          body.forEach(function(api_order) {
            if (api_order.orderNumber == opts.order_id) active = true
          })
        }
        client.returnOrderTrades(opts.order_id, function(err, body) {
          if (typeof body === 'string' || !body) {
            return retry('getOrder', args)
          }
          if (err || body.error || !body.forEach) return cb(null, order)
          if (body.length === 0 && !active) {
            order.status = 'cancelled'
            return cb(null, order)
          }
          order.filled_size = '0'
          body.forEach(function(trade) {
            order.filled_size = n(order.filled_size)
              .add(trade.amount)
              .format('0.00000000')
          })
          if (n(order.filled_size).value() == n(order.size).value()) {
            order.status = 'done'
            order.done_at = new Date().getTime()
          }
          cb(null, order)
        })
      })
    },

    // return the property used for range querying.
    getCursor(trade) {
      return Math.floor((trade.time || trade) / 1000)
    },
  }
  return exchange
}
