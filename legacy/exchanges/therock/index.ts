import ccxt from 'ccxt'
import path from 'path'

export default (conf) => {
  let public_client, authed_client

  function publicClient() {
    if (!public_client) public_client = new ccxt.therock({ apiKey: '', secret: '' })
    return public_client
  }

  function authedClient() {
    if (!authed_client) {
      if (!conf.therock || !conf.therock.key || (!conf.therock.key as any) === 'YOUR-API-KEY') {
        throw new Error('please configure your TheRockTrading credentials in ' + path.resolve(__dirname, 'conf.js'))
      }

      authed_client = new ccxt.therock({ apiKey: conf.therock.key, secret: conf.therock.secret })
    }
    return authed_client
  }

  function joinProduct(productId) {
    return productId.split('-')[0] + productId.split('-')[1]
  }

  function retry(method, args) {
    if (method !== 'getTrades') {
      console.error(('\n TheRockTrading API is down! unable to call ' + method + ', retrying in 10s').red)
    }
    setTimeout(function() {
      exchange[method].apply(exchange, args)
    }, 20000)
  }

  const orders = {}

  const exchange = {
    name: 'therock',
    historyScan: 'forward',
    makerFee: 0.3,
    takerFee: 0.2,

    getProducts() {
      return require('./products.json')
    },

    getTradesTheRock(args, cb, trades = []) {
      const _this = this
      const client = publicClient()
      const market = client.market(args.id)

      try {
        client
          .request(
            `funds/${args.id}/trades?after=${args.after}&per_page=${args.per_page}&page=${args.page}&id=${args.id}`,
            'public',
            'GET',
            args
          )
          .then(function(response) {
            trades = trades.concat(response.trades)

            if (response.trades.length > 0 && response.meta.current.page < response.meta.next.page) {
              args.page = response.meta.next.page
              return _this.getTradesTheRock(args, cb, trades)
            }

            return cb(client.parseTrades(trades, market))
          })
          .catch(function(error) {
            console.log('Retrying...', error)
            return _this.getTradesTheRock(args, cb, trades)
          })
      } catch (error) {
        console.log('Retrying...', error)
        return _this.getTradesTheRock(args, cb, trades)
      }
    },

    getTrades(opts, cb) {
      const args: Record<string, any> = {
        id: joinProduct(opts.productId),
        per_page: 200,
        page: 1,
      }
      if (opts.from) {
        args.after = new Date(opts.from).toISOString()
      }
      if (opts.to) {
        args.before = new Date(opts.to).toISOString()
      }

      this.getTradesTheRock(args, function(result) {
        const trades = result.map(function(trade) {
          return {
            trade_id: trade.id,
            time: trade.timestamp,
            size: parseFloat(trade.amount),
            price: parseFloat(trade.price),
            side: trade.side,
          }
        })
        cb(null, trades)
      })
    },

    getBalance(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = authedClient()
      client
        .fetchBalance()
        .then((result) => {
          const balance: Record<string, any> = { asset: 0, currency: 0 }
          Object.keys(result).forEach(function(key) {
            if (key === opts.currency) {
              balance.currency = result[key].free
              balance.currency_hold = result[key].used
            }
            if (key === opts.asset) {
              balance.asset = result[key].free
              balance.asset_hold = result[key].used
            }
            cb(null, balance)
          })
        })
        .catch(function(error) {
          console.error('An error occurred', error)
          return retry('getBalance', func_args)
        })
    },

    getQuote(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = publicClient()
      client
        .fetchTicker({ id: joinProduct(opts.productId) })
        .then((result) => {
          cb(null, { bid: result.bid, ask: result.ask })
        })
        .catch(function(error) {
          console.error('An error occurred', error)
          return retry('getQuote', func_args)
        })
    },

    cancelOrder(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = authedClient()
      client.cancelOrder(opts.order_id, function(err, resp, body) {
        if (body && (body.message === 'Order already done' || body.message === 'order not found')) return cb()

        if (err) return retry('cancelOrder', func_args)
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
        opts.type = 'market'
      }
      opts.side = 'buy'
      delete opts.order_type
      client
        .createOrder(opts.market, opts.type, opts.side, opts.amount, opts.price, opts)
        .then((result) => {
          if (result && result.message === 'Insufficient funds') {
            const order = {
              status: 'rejected',
              reject_reason: 'balance',
            }
            return cb(null, order)
          }

          orders['~' + result.id] = result
          cb(null, result)
        })
        .catch(function(error) {
          console.error('An error occurred', error)
          return retry('buy', func_args)
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
        opts.type = 'market'
      }
      opts.side = 'sell'
      delete opts.order_type
      client
        .createOrder(opts.market, opts.type, opts.side, opts.amount, opts.price, opts)
        .then((result) => {
          if (result && result.message === 'Insufficient funds') {
            const order = {
              status: 'rejected',
              reject_reason: 'balance',
            }
            return cb(null, order)
          }

          orders['~' + result.id] = result
          cb(null, result)
        })
        .catch(function(error) {
          console.error('An error occurred', error)
          return retry('buy', func_args)
        })
    },

    getOrder(opts, cb) {
      const func_args = [].slice.call(arguments)
      const client = authedClient()
      client.getOrder(opts.order_id, function(err, resp, body) {
        if (err) return retry('getOrder', func_args)
        if (resp.statusCode === 404) {
          // order was cancelled. recall from cache
          body = orders['~' + opts.order_id]
          body.status = 'done'
          body.done_reason = 'canceled'
        }
        cb(null, body)
      })
    },

    getCursor(trade) {
      return trade.time || trade
    },
  }
  return exchange
}
