import convnetjs from 'convnetjs'
import z from 'zero-fill'
import n from 'numbro'
import { ema } from '@plugins'
import { phenotypes } from '@util'
import cluster from 'cluster'

const G = global as any

// the below line starts you at 0 threads
G.forks = 0

// the below line is for calculating the last mean vs the now mean.
let oldmean = 0

export default {
  name: 'neural',
  description:
    'Use neural learning to predict future price. Buy = mean(last 3 real prices) < mean(current & last prediction)',
  getOptions() {
    this.option('period', 'Period length - longer gets a better average', String, '30m')
    this.option('period_length', 'Period length set same as --period', String, '30m')
    this.option('activation_1_type', 'Neuron Activation Type: sigmoid, tanh, relu', String, 'sigmoid')
    this.option('neurons_1', 'Neurons in layer 1', Number, 5)
    this.option('activation_2_type', 'Neuron Activation Type: sigmoid, tanh, relu', String, 'sigmoid')
    this.option('neurons_2', 'Neurons in layer 2', Number, 5)
    this.option('depth', 'Generally the same as min_predict for accuracy', Number, 50)
    this.option('min_periods', 'Periods to train neural network with from', Number, 2000)
    this.option('min_predict', 'Periods to predict next number from less than min_periods', Number, 50)
    this.option('momentum', 'momentum of prediction between 0 and 1 - 0 is stock', Number, 0.0)
    this.option('decay', 'decay of prediction, use teeny tiny increments beteween 0 and 1 - stock', Number, 0.001)
    this.option('threads', "Number of processing threads you'd like to run (best for sim - Possibly broken", Number, 1)
    this.option('learns', "Number of times to 'learn' the neural network with past data", Number, 10)
    this.option('learningrate', 'The learning rate of the neural network between 0 and 1 - 0.01 is stock', Number, 0.01)
  },
  calculate() {},
  onPeriod(s, cb) {
    ema(s, 'neural', s.options.neural)
    if (s.neural === undefined) {
      // Create the net the first time it is needed and NOT on every run
      s.neural = {
        net: new convnetjs.Net(),
        layer_defs: [
          { type: 'input', out_sx: 5, out_sy: 1, out_depth: s.options.depth },
          { type: 'fc', num_neurons: s.options.neurons_1, activation: s.options.activation_1_type },
          { type: 'fc', num_neurons: s.options.neurons_2, activation: s.options.activation_2_type },
          { type: 'regression', num_neurons: 5 },
        ],
        neuralDepth: s.options.depth,
      }
      s.neural.net.makeLayers(s.neural.layer_defs)
      s.neural.trainer = new convnetjs.SGDTrainer(s.neural.net, {
        learning_rate: s.options.learningrate,
        momentum: s.options.momentum,
        batch_size: 1,
        l2_decay: s.options.decay,
      })
    }
    if (cluster.isMaster) {
      ema(s, 'neural', s.options.neural)
      if (G.forks < s.options.threads) {
        cluster.fork()
        G.forks++
      }
      cluster.on('exit', (code: number) => {
        process.exit(code)
      })
    }

    if (cluster.isWorker) {
      ema(s, 'neural', s.options.neural)
      const tlp = []
      const tll = []
      // this thing is crazy run with trendline placed here. But there needs to be a coin lock so you dont buy late!
      if (!s.in_preroll && s.lookback[s.options.min_periods]) {
        const min_predict =
          s.options.min_predict > s.options.min_periods ? s.options.min_periods : s.options.min_predict
        for (let i = 0; i < s.options.min_periods; i++) {
          tll.push(s.lookback[i])
        }
        for (let i = 0; i < min_predict; i++) {
          tlp.push(s.lookback[i])
        }
        const my_data = tll.reverse()
        const learn = function() {
          // Learns
          for (let j = 0; j < s.options.learns; j++) {
            for (let i = 0; i < my_data.length - s.neural.neuralDepth; i++) {
              const data = my_data.slice(i, i + s.neural.neuralDepth)
              const real_value = my_data[i + s.neural.neuralDepth]
              const x = new convnetjs.Vol(5, 1, s.neural.neuralDepth, 0)

              for (let k = 0; k < s.neural.neuralDepth; k++) {
                x.set(0, 0, k, data[k].open)
                x.set(1, 0, k, data[k].close)
                x.set(2, 0, k, data[k].high)
                x.set(3, 0, k, data[k].low)
                x.set(4, 0, k, data[k].volume)
              }

              s.neural.trainer.train(x, [
                real_value.open,
                real_value.close,
                real_value.high,
                real_value.low,
                real_value.volume,
              ])
            }
          }
        }
        const predict = function(data) {
          const x = new convnetjs.Vol(5, 1, s.neural.neuralDepth, 0)

          for (let k = 0; k < s.neural.neuralDepth; k++) {
            x.set(0, 0, k, data[k].open)
            x.set(1, 0, k, data[k].close)
            x.set(2, 0, k, data[k].high)
            x.set(3, 0, k, data[k].low)
            x.set(4, 0, k, data[k].volume)
          }

          const predicted_value = s.neural.net.forward(x)
          return predicted_value.w[1] // close value - x.set(1,0,k,data[k].close)
        }
        learn()
        const item = tlp.reverse()
        s.prediction = predict(item)
      }
      // NORMAL onPeriod STUFF here
      G.predi = s.prediction
      // something strange is going on here
      G.sig0 = G.predi > oldmean
      if (G.sig0 === false) {
        s.signal = 'sell'
      } else if (G.sig0 === true) {
        s.signal = 'buy'
      }
      oldmean = G.predi
      cb()
    }
  },
  onReport() {
    const cols = []
    cols.push(z(8, n(G.predi).format('0000.000000000'), ' '))
    return cols
  },

  phenotypes: {
    // -- common
    period_length: phenotypes.rangePeriod(1, 120, 'm'),
    min_periods: phenotypes.range0(1, 200),
    markdown_buy_pct: phenotypes.rangeFloat(-1, 5),
    markup_sell_pct: phenotypes.rangeFloat(-1, 5),
    order_type: phenotypes.listOption(['maker', 'taker']),
    sell_stop_pct: phenotypes.range1(1, 50),
    buy_stop_pct: phenotypes.range1(1, 50),
    profit_stop_enable_pct: phenotypes.range1(1, 20),
    profit_stop_pct: phenotypes.range0(1, 20),

    // -- strategy
    neurons_1: phenotypes.range0(1, 20),
    neurons_2: phenotypes.range0(1, 20),
    activation_1_type: phenotypes.listOption(['sigmoid', 'tanh', 'relu']),
    activation_2_type: phenotypes.listOption(['sigmoid', 'tanh', 'relu']),
    depth: phenotypes.range0(1, 200),
    min_predict: phenotypes.range0(1, 200),
    // momentum and decay and learning rate are decimals?
    momentum: phenotypes.rangeFloat(0, 1),
    decay: phenotypes.rangeFloat(0, 1),
    learns: phenotypes.range0(1, 500),
    learningrate: phenotypes.rangeFloat(0, 1),
  },
}
