/* ==========================================================================
   queez.js — Queez, the help desk with an attitude problem

   Queez answers questions about the terminal. There is no backend and no
   model behind him: he is a keyword matcher over a hand-written knowledge
   base. That is deliberate — he works offline, he never invents a feature
   that does not exist, and he cannot leak anything.

   The rule for his voice: roast the user, never the user's intelligence
   about things that actually matter. Every joke is followed by a real,
   correct answer. If the joke ever gets in the way of the instruction,
   the joke loses.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Q = MC.queez = {};

  /* ----------------------------------------------------------------------
     VOICE
     ---------------------------------------------------------------------- */
  var OPENERS = [
    'Alright, listen up.',
    'Oh, this one. Fine.',
    'You again. Love that for us.',
    'Buckle up, champ.',
    'Great question. Genuinely. I am as shocked as you are.',
    'Right, gather round.',
    'Okay so.',
    'Deep breath. Here we go.'
  ];

  var CLOSERS = [
    'Do you get it now, bozo?',
    'Crystal clear? Cool. Cool cool cool.',
    'Nod if that landed.',
    'And that, as they say, is that.',
    'Try it. I will wait. I have nothing else going on.',
    'You are welcome. No, really, you are.',
    'Go on then. Press the thing.',
    'That will be five dollars.'
  ];

  /** Quips fired by things you do, rather than things you ask. */
  var QUIPS = {
    fastOrders: [
      'Are you Machine Gun Kelly with that buy button? Slow down, drummer.',
      'Three orders in ten seconds. This is a trading terminal, not a fidget toy.',
      'Easy, trigger finger. The market will still be there in a minute.'
    ],
    bigWin: [
      'Look at you. Absolutely no notes. Terrifying.',
      'Green. Actual green. Screenshot it before it changes its mind.',
      'Okay, moneybags. Do not let it go to your head. Too late.'
    ],
    bigLoss: [
      'Ouch. We do not talk about that one.',
      'That is what we in the business call "tuition".',
      'The line went the wrong way. Happens. Mostly to you, apparently.'
    ],
    clearedAll: [
      'Wiped the whole chart. Bold. Minimalist. Slightly concerning.',
      'Nothing on the chart now. Very zen. Very unhelpful.'
    ],
    manyIndicators: [
      'Six indicators. At this point just ask a psychic.',
      'That chart has more lines than a motorway junction. Can you actually read it?'
    ],
    repeatHelp: [
      'Third time opening help. Do you get it now, bozo? No? Same.',
      'Back again. At this rate I am charging rent.',
      'You keep coming back. I am flattered and worried.'
    ],
    firstOrder: [
      'First order in. Nothing real happened, obviously. But well done, sport.'
    ]
  };

  /* ----------------------------------------------------------------------
     KNOWLEDGE
     Each topic: words to match on, and the real answer.
     ---------------------------------------------------------------------- */
  var TOPICS = [
    { k: ['live', 'simulated', 'real', 'fake', 'demo', 'sim', 'difference'],
      t: 'Live vs Simulated',
      a: 'The toggle next to the timeframes. <b>Live</b> is the actual TradingView chart with real market data. ' +
         '<b>Simulated</b> is my own engine — that is the one that powers this site\'s indicators, drawing tools ' +
         'and backtests, and it keeps working when your wifi does not.' },

    { k: ['price', 'prices', 'accurate', 'wrong price', 'watchlist price', 'where do prices'],
      t: 'Where the prices come from',
      a: 'Crypto is genuinely live from Binance and forex from the European Central Bank — no key, no excuses. ' +
         'Stocks are the awkward ones: nothing free lets a browser fetch them, so they run on demo prices until ' +
         'you paste a free key in <b>Folio → Price data</b>. Every row is labelled <b>live</b> or <b>demo</b>, ' +
         'because lying to you would be rude.' },

    { k: ['indicator', 'indicators', 'rsi', 'macd', 'moving average', 'bollinger', 'ema', 'sma'],
      t: 'Indicators',
      a: 'Hit the squiggly-line button above the chart. There are 35 of them, grouped and searchable — ' +
         'averages, bands, trend, momentum, volume, volatility. Click one to add it, tweak its numbers ' +
         'right there in the list, click again to bin it.' },

    { k: ['create indicator', 'build indicator', 'own indicator', 'custom', 'formula', 'my own'],
      t: 'Building your own indicator',
      a: 'Indicators → <b>Create an indicator</b>. Either pick a guided recipe and fill in the blanks, or write ' +
         'a formula like <code>ema(close,12) - ema(close,26)</code>. Press <b>Check it</b> and I will tell you ' +
         'exactly what is wrong before you embarrass yourself. It saves to your library and behaves like any built-in one.' },

    { k: ['alert', 'alerts', 'notify', 'notification', 'tell me when'],
      t: 'Alerts',
      a: 'The <b>Alerts</b> tab. Pick a market, pick what has to happen — a price level, a daily move, RSI, ' +
         'a moving-average cross — and set it. It only fires when the thing actually <i>crosses</i>, so setting ' +
         'one that is already true will not spam you the second you hit go.' },

    { k: ['telegram', 'discord', 'copy trade', 'copytrade', 'webhook', 'share signal', 'followers'],
      t: 'Copy-trade forwarding',
      a: 'Alerts → <b>Delivery</b>. Point it at Telegram, Discord or your own webhook and every trigger gets ' +
         'posted there automatically. Send a test signal first — the button is right there. Your token stays ' +
         'in your browser and goes straight to the service you picked. Treat it like a password, because it is one.' },

    { k: ['portfolio', 'folio', 'holdings', 'p&l', 'pnl', 'profit', 'loss', 'cost basis'],
      t: 'The portfolio',
      a: 'The <b>Folio</b> tab. Record what you bought and sold and it works out your average cost, what it is ' +
         'worth now, unrealised profit, realised profit and a curve of how it has gone. Got open paper trades? ' +
         'One button imports them. The curve builds as prices move — I will not invent a history you did not have.' },

    { k: ['backtest', 'strategy', 'test', 'sharpe', 'drawdown', 'win rate'],
      t: 'Backtesting',
      a: 'The <b>Test</b> tab. Pick a rule set, a market and a date range, then run it. You get total return, ' +
         'win rate, number of trades, Sharpe, worst drawdown, the final balance, a curve against buy-and-hold, ' +
         'and every trade it took. If the answer is ugly, that is the point — better here than with money.' },

    { k: ['drag', 'drop', 'reorder', 'move', 'rearrange'],
      t: 'Dragging things about',
      a: 'Drag watchlist rows up and down to arrange them — it remembers. Drag a row onto the chart to load it, ' +
         'or onto the trade panel to set up an order. Drag any image file anywhere on the page and it becomes your logo. ' +
         'Yes, anywhere. Try it.' },

    { k: ['logo', 'brand', 'upload', 'image', 'crest'],
      t: 'Your logo',
      a: 'Click the crest, top left. Or drag an image onto the page. It sticks around on this device.' },

    { k: ['tradingview', 'log in', 'login', 'sign in', 'signed in', 'subscription', 'account', 'pro'],
      t: 'TradingView and your subscription',
      a: 'Straight answer: this page <b>cannot</b> sign you in to TradingView, and nothing can. The charts are ' +
         'embeds that live in a locked box on another domain — your browser will not let them see your session, ' +
         'and TradingView gives no way to hand one over. What works is the blue <b>TradingView</b> button: it opens ' +
         'the exact symbol and timeframe on tradingview.com, where you already are signed in, with your own plan. ' +
         'It reuses one tab so your session stays put.' },

    { k: ['news', 'headline', 'radar', 'calendar', 'economic', 'fomc', 'cpi', 'event'],
      t: 'News and events',
      a: 'The <b>Radar</b> tab under the chart. Left side is a dated economic calendar — FOMC and CPI dates are the ' +
         'real published ones, anything worked out from a rule is labelled <b>estimated</b>, and you can add your own. ' +
         'Arm one and it warns you beforehand. Right side is headlines, with keyword alerts if you want shouting at.' },

    { k: ['stop loss', 'stop', 'take profit', 'target', 'risk'],
      t: 'Stops and targets',
      a: '<b>Stop loss</b> is your safety exit — if it goes wrong, the trade closes there and the bleeding stops. ' +
         '<b>Take profit</b> is the opposite: it goes right, you get paid, done. The ±1/2/5% buttons set both at once ' +
         'with twice as much upside as downside, which is the only sensible way round.' },

    { k: ['buy', 'sell', 'order', 'trade', 'place'],
      t: 'Placing an order',
      a: 'Trade tab. Pick BUY or SELL, say how many, optionally add a stop and a target, press the big button. ' +
         'It fills instantly against the demo feed. No broker, no money, no consequences — which is exactly why ' +
         'you should be practising here first.' },

    { k: ['shortcut', 'keyboard', 'hotkey', 'key'],
      t: 'Shortcuts',
      a: '<b>/</b> search · <b>B</b> buy · <b>S</b> sell · <b>F</b> fullscreen · <b>V</b> vlogs · <b>?</b> the proper guide · <b>Esc</b> makes things go away.' },

    { k: ['chart', 'candle', 'timeframe', 'zoom', 'draw', 'trendline', 'fullscreen'],
      t: 'The chart',
      a: 'Green bar closed up, red closed down. The 1m–1w buttons change how much time one bar covers. ' +
         'The pen adds a trend line (two clicks) or a flat price level (one click). The arrows go fullscreen, ' +
         'or just press <b>F</b>.' },

    { k: ['vlog', 'video', 'youtube', 'tiktok', 'instagram', 'share'],
      t: 'Vlogs',
      a: 'The <b>Vlogs</b> tab in the dock. Each card shares to YouTube, TikTok, Instagram or X, and there is a ' +
         'copy-link button for everywhere else. The Vlogs button up top hides the whole section when you need to concentrate.' },

    { k: ['search', 'find', 'filter', 'market tab'],
      t: 'Finding things',
      a: 'Press <b>/</b> or click the search box and type. Symbol or company name, both work. The All/Stocks/Crypto/' +
         'Forex/Indices tabs narrow the list first if you like doing things the long way.' },

    { k: ['safe', 'money', 'real money', 'risk money', 'lose', 'scam'],
      t: 'Is any of this real money',
      a: 'No. Orders, positions and backtests are all simulated and nothing leaves your browser. The only real ' +
         'things here are the live prices and the TradingView charts. Also: none of this is financial advice, ' +
         'and if it were, you should want a refund.' }
  ];

  /* ----------------------------------------------------------------------
     MATCHING
     ---------------------------------------------------------------------- */
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /** Score every topic against the question and take the best, if it is good enough. */
  function findTopic(question) {
    var q = ' ' + question.toLowerCase().replace(/[^a-z0-9&% ]/g, ' ') + ' ';
    var best = null, bestScore = 0;

    TOPICS.forEach(function (topic) {
      var score = 0;
      topic.k.forEach(function (word) {
        if (q.indexOf(' ' + word + ' ') !== -1) score += word.indexOf(' ') !== -1 ? 4 : 2;
        else if (q.indexOf(word) !== -1) score += word.indexOf(' ') !== -1 ? 3 : 1;
      });
      if (score > bestScore) { bestScore = score; best = topic; }
    });

    return bestScore >= 2 ? best : null;
  }

  /**
   * Answer a question. Returns { text, topic } — text is HTML, already
   * wrapped in Queez's voice.
   */
  Q.ask = function (question) {
    var text = (question || '').trim();
    if (!text) {
      return { text: 'You pressed send with an empty box. Iconic. Try typing words.', topic: null };
    }

    if (/^(hi|hey|hello|yo|sup|hiya)\b/i.test(text)) {
      return {
        text: 'Hello to you too. I am Queez. I know everything about this terminal and almost nothing else. ' +
              'Ask me something useful.',
        topic: null
      };
    }

    if (/thank|cheers|nice one|legend/i.test(text)) {
      return { text: 'Manners. In this economy. Genuinely moved.', topic: null };
    }

    if (/who are you|what are you|your name/i.test(text)) {
      return {
        text: 'Queez. I live in this help panel and I answer questions about the terminal. ' +
              'I am not an oracle, I will not pick your trades, and if I could I would charge you.',
        topic: null
      };
    }

    if (/should i (buy|sell)|what should i trade|will .* go up|price prediction|moon/i.test(text)) {
      return {
        text: 'Absolutely not. I am a help button, not your financial adviser, and neither of us is qualified. ' +
              'What I <i>can</i> do is show you how to backtest the idea before it costs you anything — ask me about backtesting.',
        topic: null
      };
    }

    var topic = findTopic(text);
    if (!topic) {
      return {
        text: 'No idea what you are asking, and I say that with love. Try one of the buttons below, or use ' +
              'words like <b>alerts</b>, <b>portfolio</b>, <b>indicators</b>, <b>backtest</b> or <b>prices</b>.',
        topic: null
      };
    }

    return {
      text: '<span class="qz-open">' + pick(OPENERS) + '</span> ' + topic.a +
            ' <span class="qz-close">' + pick(CLOSERS) + '</span>',
      topic: topic.t
    };
  };

  /** Suggested questions shown as chips. */
  Q.suggestions = function () {
    return ['How do I set an alert?', 'What is Live vs Simulated?', 'Are these prices real?',
            'How does the portfolio work?', 'Can I make my own indicator?',
            'Why can it not log me into TradingView?', 'How do I copy trade to Telegram?'];
  };

  /* ----------------------------------------------------------------------
     QUIPS — reactions to what you do
     ---------------------------------------------------------------------- */
  var orderTimes = [];
  var helpOpens = 0;

  Q.quip = function (kind) {
    if (!QUIPS[kind]) return null;
    return pick(QUIPS[kind]);
  };

  /** Called whenever an order is placed; catches trigger-happy clicking. */
  Q.noteOrder = function () {
    var now = Date.now();
    orderTimes.push(now);
    orderTimes = orderTimes.filter(function (t) { return now - t < 12000; });

    if (orderTimes.length === 1 && !MC.store.get('mc_first_order')) {
      MC.store.set('mc_first_order', '1');
      return Q.quip('firstOrder');
    }
    if (orderTimes.length >= 3) {
      orderTimes = [];
      return Q.quip('fastOrders');
    }
    return null;
  };

  Q.noteHelpOpen = function () {
    helpOpens++;
    return helpOpens >= 3 && helpOpens % 3 === 0 ? Q.quip('repeatHelp') : null;
  };

  Q.noteIndicators = function (count) {
    if (count === 0) return Q.quip('clearedAll');
    if (count >= 6) return Q.quip('manyIndicators');
    return null;
  };

  Q.notePnl = function (pct) {
    if (pct >= 8) return Q.quip('bigWin');
    if (pct <= -8) return Q.quip('bigLoss');
    return null;
  };

})(window);
