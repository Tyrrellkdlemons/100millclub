/* ==========================================================================
   queez.js — the Coach, who is stuck teaching Queez

   The visitor IS Queez. Everyone who opens this site is Queez, and the
   Coach has been teaching Queez how to trade since forever. He calls him
   bozo, clown, and Machine Gun Kelly, and loves him anyway.

   Under the jokes there is a real knowledge base: every feature of this
   terminal plus the trading ideas behind them, each with a plain-English
   answer and a concrete NEXT MOVE inside the app. There is no model and no
   backend — he is a scored keyword matcher over hand-written entries. That
   is deliberate: he works offline, he cannot invent features that do not
   exist, and he cannot leak a thing. When he is not sure, he says so and
   offers his best guesses instead of bluffing.

   Voice rule: roast Queez, never the answer. Every joke rides on top of a
   correct explanation; if a joke gets in the way, the joke loses.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Q = MC.queez = {};

  /* ----------------------------------------------------------------------
     VOICE
     ---------------------------------------------------------------------- */
  var OPENERS = [
    'Alright Queez, listen up.',
    'Oh, this one. Fine, Queez.',
    'Queez. My guy. Again.',
    'Buckle up, champ.',
    'A real question, Queez. I am as shocked as you are.',
    'Gather round, clown. Class is on.',
    'Okay Queez, here we go.',
    'Deep breath, bozo. It gets easier.',
    'Class is in session, clown. Phones away.',
    'Queez, my sweet summer bozo. Sit.',
    'Say less. I got you, Queez.',
    'Somebody get Queez a juice box, we are going again.'
  ];

  var CLOSERS = [
    'Do you get it now, bozo?',
    'Crystal clear, Queez? Cool. Cool cool cool.',
    'Nod if that landed, clown.',
    'And that, Queez, is that.',
    'Try it. I will wait. Teaching you is my whole life.',
    'You are welcome, Queez. No, really.',
    'Go on then, bozo. Press the thing.',
    'That will be five dollars, Queez.',
    'Write it on your hand if you have to, Queez.',
    'Forget this and I am telling everyone, clown.',
    'Pop quiz later, bozo. Kidding. Or am I.',
    'Now run it back and act like you always knew that.'
  ];

  /** Quips fired by things Queez does, rather than things he asks. */
  var QUIPS = {
    fastOrders: [
      'Are you Machine Gun Kelly with that buy button, Queez? Slow down, drummer.',
      'Three orders in ten seconds. It is a trading terminal, Queez, not a fidget toy.',
      'Easy, trigger finger. The market will still be there in a minute, bozo.',
      'Cool the drumsticks, MGK. Charts move slower than you do.',
      'This is a market, Queez, not a mosh pit. Breathe.'
    ],
    bigWin: [
      'Look at you, Queez. Absolutely no notes. Terrifying.',
      'Green. Actual green, Queez. Screenshot it before it changes its mind.',
      'Okay, moneybags. Do not let it go to your head. Too late.',
      'A win?? Queez?? Check the scoreboard twice, then frame it.'
    ],
    bigLoss: [
      'Ouch, Queez. We do not talk about that one.',
      'That is what we in the business call "tuition", bozo.',
      'The line went the wrong way. Happens. Mostly to you, Queez.',
      'Rub some dirt on it, Queez. It is practice money. This time.'
    ],
    clearedAll: [
      'Wiped the whole chart, Queez. Bold. Minimalist. Slightly concerning.',
      'Nothing on the chart now, clown. Very zen. Very unhelpful.',
      'A clean chart. Who are you, and what have you done with Queez.'
    ],
    manyIndicators: [
      'Six indicators, Queez. At this point just ask a psychic.',
      'That chart has more lines than a motorway junction, bozo. Can you actually read it?',
      'You have decorated it like a Christmas tree, clown. Pick three.'
    ],
    repeatHelp: [
      'Third time opening help. Do you get it now, bozo? No? Same, Queez. Same.',
      'Back again, Queez. At this rate I am charging you rent.',
      'You keep coming back, clown. I am flattered and worried.',
      'You and the help button, Queez. A love story for the ages.'
    ],
    firstOrder: [
      'First order in, Queez. Nothing real happened, obviously. But well done, sport.',
      'Look at him go. My little clown is trading.'
    ]
  };

  /* ----------------------------------------------------------------------
     KNOWLEDGE BASE
     id   stable handle, used for related-topic chips
     k    match words (multi-word phrases score higher)
     t    topic label shown under the answer
     a    the answer — correct first, funny second
     next one concrete thing to do in THIS app, right now
     rel  related topic ids offered as follow-up chips
     ---------------------------------------------------------------------- */
  var KB = [

    /* ================= THE TERMINAL ================= */
    { id: 'livesim', k: ['live', 'simulated', 'real data', 'fake', 'demo', 'sim mode', 'difference', 'which chart'],
      t: 'Live vs Simulated',
      a: 'The toggle next to the timeframes. <b>Live</b> is the actual TradingView chart with real market data. ' +
         '<b>Simulated</b> is my own engine — it powers this site\'s indicators, drawing tools and backtests, ' +
         'and it keeps working when your wifi does not.',
      next: 'Flip to Simulated, add an indicator, then flip back — now you know which mode owns which tools.',
      rel: ['indicators', 'chartread', 'prices'] },

    { id: 'prices', k: ['price', 'prices', 'accurate', 'wrong price', 'watchlist price', 'where do prices', 'binance', 'data source', 'feed'],
      t: 'Where the prices come from',
      a: 'Crypto is genuinely live from Binance and forex from the European Central Bank — no key needed. ' +
         'Stocks are the awkward ones: no free feed lets a browser fetch them, so they run on demo prices until ' +
         'you paste a free key in <b>Folio → Price data</b>. Every row is labelled <b>live</b> or <b>demo</b>, ' +
         'because lying to you would be rude.',
      next: 'Open Folio → Price data and check how many markets say live right now.',
      rel: ['folio', 'stockkey', 'livesim'] },

    { id: 'stockkey', k: ['stock key', 'finnhub', 'twelve data', 'twelvedata', 'api key', 'real stocks', 'stock prices'],
      t: 'Real stock prices',
      a: 'Grab a free key from <b>finnhub.io</b> or <b>twelvedata.com</b> (two minutes, no card), paste it in ' +
         '<b>Folio → Price data</b>, and your stock rows flip from demo to live. The key stays in this browser ' +
         'and goes only to the provider.',
      next: 'Get the Twelve Data free key — it covers all eight stocks in one call.',
      rel: ['prices', 'folio'] },

    { id: 'chartread', k: ['candle', 'candlestick', 'read the chart', 'green bar', 'red bar', 'wick', 'ohlc', 'what am i looking at'],
      t: 'Reading candles',
      a: 'Each candle is one slice of time. The fat body runs from open to close — green closed higher, red closed ' +
         'lower. The thin wicks show the extremes it touched in between. Long wick with a small body means a fight ' +
         'nobody won. That is genuinely most of it, Queez.',
      next: 'Set the timeframe to 1d and find three long-wick candles — each one was a battle.',
      rel: ['timeframes', 'chartstyle', 'patterns'] },

    { id: 'timeframes', k: ['timeframe', 'time frame', '1m', '5m', '15m', '1h', '4h', '1d', '1w', 'interval', 'candle size'],
      t: 'Timeframes',
      a: 'The 1m → 1w buttons set how much time one candle covers. Small frames show noise fast, big frames show ' +
         'the actual trend. Day traders live on minutes; sane people check the daily. Staring at 1m all day is ' +
         'how you end up stressed and broke, in that order.',
      next: 'Look at the same market on 1h and then 1d — notice how different the story reads.',
      rel: ['chartread', 'trend'] },

    { id: 'chartstyle', k: ['chart style', 'heikin', 'bars', 'line chart', 'area', 'baseline', 'mountain', 'candles or line'],
      t: 'Chart styles',
      a: 'The picker in the toolbar: <b>Candles</b> for full detail, <b>Line</b> and <b>Area</b> for calm, ' +
         '<b>Bars</b> for old-schoolers, <b>Heikin Ashi</b> for smoothed trends, <b>Baseline</b> for above/below a level. ' +
         'The live-only ones say so instead of pretending.',
      next: 'Try Heikin Ashi on the Live chart — trends turn into smooth runs of one colour.',
      rel: ['chartread', 'livesim'] },

    { id: 'indicators', k: ['indicator', 'indicators', 'overlay', 'add indicator', 'studies'],
      t: 'Indicators',
      a: 'The squiggly-line button above the chart. Thirty-five of them — averages, bands, trend, momentum, volume, ' +
         'volatility — searchable, with plain-English blurbs and editable numbers right in the list. Click to add, ' +
         'click again to bin. Three good ones beat ten pretty ones, clown.',
      next: 'Add EMA 50 and RSI, nothing else, and watch one market for a day.',
      rel: ['rsi', 'macdlike', 'builder'] },

    { id: 'builder', k: ['create indicator', 'build indicator', 'own indicator', 'custom indicator', 'formula', 'my own'],
      t: 'Building your own indicator',
      a: 'Indicators → <b>Create an indicator</b>. Pick a guided recipe or write a formula like ' +
         '<code>ema(close,12) - ema(close,26)</code>. Press <b>Check it</b> and I will tell you exactly what is ' +
         'wrong before you embarrass yourself. It saves to your library like a built-in.',
      next: 'Build "distance from average in percent" from the recipes — the most useful beginner one.',
      rel: ['indicators', 'backtest'] },

    { id: 'drawing', k: ['draw', 'trendline', 'trend line', 'horizontal', 'level', 'ray', 'mark the chart'],
      t: 'Drawing on the chart',
      a: 'The pen button. <b>Trend line</b> connects two clicks; <b>Price level</b> drops a flat line at one click. ' +
         'On the Live chart, TradingView\'s own left toolbar has the full drawing kit.',
      next: 'Drop a price level at the most recent high — then watch how price behaves when it returns there.',
      rel: ['support', 'chartread'] },

    { id: 'fullscreen', k: ['fullscreen', 'full screen', 'bigger chart', 'expand'],
      t: 'Fullscreen',
      a: 'The expand arrows, or press <b>F</b>. Same key brings it back. You can also drag the seams between ' +
         'panels to resize everything — the chart always stays the biggest, that part is protected.',
      next: 'Drag the dock\'s top edge down to give the chart more room permanently.',
      rel: ['layout'] },

    { id: 'layout', k: ['resize', 'panel size', 'layout', 'adjust window', 'bigger panel', 'drag seam', 'reset layout'],
      t: 'Resizing the panels',
      a: 'Drag the seams — the watchlist\'s right edge, the trade panel\'s left edge, the dock\'s top edge. Gold ' +
         'glow shows you where. Double-click a seam to reset it, or Settings → <b>Reset layout</b> for everything. ' +
         'The chart cannot be made small, no matter how hard you try, bozo.',
      next: 'Widen the trade panel a touch — the order summary breathes better.',
      rel: ['fullscreen'] },

    { id: 'search', k: ['search', 'find asset', 'find symbol', 'filter', 'market tabs'],
      t: 'Finding things',
      a: 'Press <b>/</b> or click the search box. Symbol or company name, both work — "nvda" or "nvidia", "n225" ' +
         'or "nikkei". The All/Stocks/Crypto/Forex/Indices tabs narrow the list first if you like scenic routes.',
      next: 'Press / and type the name of any company you actually care about.',
      rel: ['watchlist'] },

    { id: 'watchlist', k: ['watchlist', 'reorder', 'rearrange', 'favourite', 'favorites', 'left panel', 'asset list'],
      t: 'The watchlist',
      a: 'Thirty markets on the left. Click a row to load it everywhere at once. Drag rows up and down to put your ' +
         'favourites on top — it remembers. Drag a row onto the chart or the trade panel and it loads there. ' +
         'Live-priced rows update from real feeds; the rest simulate.',
      next: 'Drag your three favourite markets to the top right now.',
      rel: ['search', 'dragdrop'] },

    { id: 'dragdrop', k: ['drag', 'drop', 'drag and drop', 'move rows'],
      t: 'Drag and drop',
      a: 'Rows reorder the watchlist. A row dropped on the chart loads it; dropped on the trade panel it fills the ' +
         'ticket. An image dropped anywhere on the page becomes your logo. Everything that accepts a drop lights up ' +
         'while you drag, so there is no guessing.',
      next: 'Drag a watchlist row onto the trade panel and watch the ticket fill itself.',
      rel: ['watchlist', 'logo'] },

    { id: 'logo', k: ['logo', 'brand', 'upload image', 'crest', 'my logo'],
      t: 'Your logo',
      a: 'Click the crest top-left, or drag any image onto the page. It sticks on this device. The crest, by the ' +
         'way, is a <b>Q</b> — look at the blade through the ring. Q for Queez. That is you, champ.',
      next: 'Drop your own logo on the page, then refresh to see it stick.',
      rel: ['dragdrop'] },

    { id: 'tvaccount', k: ['tradingview', 'log in', 'login', 'sign in', 'signed in', 'subscription', 'tradingview account', 'my plan'],
      t: 'TradingView and your subscription',
      a: 'Straight answer, Queez: this page <b>cannot</b> sign you into TradingView and neither can any other — ' +
         'embeds live in a sandboxed frame the browser will not let near your session. The blue <b>TradingView</b> ' +
         'button is the real move: it opens your exact symbol and timeframe on tradingview.com, where your own ' +
         'plan, layouts and alerts apply. It reuses one tab so your session stays put.',
      next: 'Press the blue TradingView button once and leave that tab signed in — every handoff lands there.',
      rel: ['livesim', 'prices'] },

    /* ================= TRADING THE TICKET ================= */
    { id: 'orders', k: ['buy', 'sell', 'order', 'place order', 'trade', 'market order', 'limit order', 'fill'],
      t: 'Placing an order',
      a: 'Trade tab: pick <b>BUY</b> or <b>SELL</b>, set how many, press the big button. <b>Market</b> fills at the ' +
         'going price right now; <b>Limit</b> waits for your price or better. Everything fills against the practice ' +
         'feed — no broker, no money, no consequences. Which is exactly why you practise here first, bozo.',
      next: 'Place one practice buy WITH a stop loss, then watch its live P/L under Open positions.',
      rel: ['stoploss', 'risk', 'positions'] },

    { id: 'stoploss', k: ['stop loss', 'stop', 'take profit', 'target', 'sl', 'tp', 'exit'],
      t: 'Stops and targets',
      a: '<b>Stop loss</b> is your pre-agreed exit if you are wrong — the trade closes and the loss stops there. ' +
         '<b>Take profit</b> is the exit when you are right. The ±1/2/5% buttons set both at once with the target ' +
         'twice as far as the stop, so winners pay for two losers. Trading without a stop is how tuition gets expensive.',
      next: 'Press the ±2% button on your next practice order and read the risk/reward numbers it prints.',
      rel: ['risk', 'orders', 'positionsize'] },

    { id: 'risk', k: ['risk', 'risk reward', 'risk management', 'how much to risk', 'lose money', 'protect'],
      t: 'Risk management',
      a: 'The whole game, Queez. The classic rule: risk a small fixed slice — many use 1–2% of the account — on any ' +
         'one idea, always know your exit before you enter, and keep reward at least twice risk. Do that and you can ' +
         'be wrong half the time and still come out ahead. Skip it and one bad day undoes a good month.',
      next: 'Backtest any strategy and look at Max Drawdown first — that number is what risk feels like.',
      rel: ['positionsize', 'stoploss', 'drawdown'] },

    { id: 'positionsize', k: ['position size', 'position sizing', 'how many shares', 'how much to buy', 'lot size'],
      t: 'Position sizing',
      a: 'Decide the money you are willing to lose first, then divide by the distance to your stop. Risking $50 with ' +
         'a stop $2 away means 25 shares. Size comes LAST, after the stop — clowns pick a big round number of shares ' +
         'first and discover their risk afterwards.',
      next: 'On the Trade tab, set a stop first, then adjust quantity until "Risk if stopped out" is a number you can shrug at.',
      rel: ['risk', 'stoploss'] },

    { id: 'positions', k: ['position', 'open position', 'p/l', 'close position', 'unrealised'],
      t: 'Open positions',
      a: 'Under the order button. Each one shows live profit or loss and its stop and target — and the exits fire ' +
         'automatically when price touches them. Close manually any time. Practice positions live in this browser ' +
         'and nowhere else.',
      next: 'Import your practice positions into Folio — one button — and watch the P/L curve start building.',
      rel: ['folio', 'orders'] },

    /* ================= TESTING & THE PORTFOLIO ================= */
    { id: 'backtest', k: ['backtest', 'strategy', 'test strategy', 'sma crossover', 'run test'],
      t: 'Backtesting',
      a: 'The <b>Test</b> tab replays a rule set over historical bars and tells you what would have happened: ' +
         'return, win rate, trade count, Sharpe, worst drawdown, final balance, an equity curve against buy-and-hold, ' +
         'and every trade. If the results are ugly, that IS the lesson — better here than with rent money.',
      next: 'Run SMA Crossover on the market you are watching, one year back. Read Max Drawdown before Total Return.',
      rel: ['sharpe', 'drawdown', 'builder'] },

    { id: 'sharpe', k: ['sharpe', 'sharpe ratio', 'risk adjusted'],
      t: 'Sharpe ratio',
      a: 'Return per unit of wobble. Two strategies both make 20%: the one that got there smoothly has the higher ' +
         'Sharpe; the one that swung wildly has the lower one. Above 1 is respectable, above 2 is suspicious, ' +
         'below 0 means the strategy lost while shaking, which takes talent.',
      next: 'Backtest two different strategies on the same market and compare Sharpes, not returns.',
      rel: ['backtest', 'drawdown'] },

    { id: 'drawdown', k: ['drawdown', 'max drawdown', 'worst loss', 'losing streak'],
      t: 'Max drawdown',
      a: 'The deepest fall from a peak before recovery — the worst stretch you would have had to sit through. ' +
         'A 50% drawdown needs a 100% gain just to get back to even, which is why the pros obsess over this number ' +
         'and tourists obsess over returns.',
      next: 'Look at any backtest and ask: could I genuinely sit through that drawdown without panic-quitting?',
      rel: ['risk', 'backtest'] },

    { id: 'folio', k: ['portfolio', 'folio', 'holdings', 'pnl', 'profit and loss', 'cost basis', 'average cost', 'track'],
      t: 'The portfolio',
      a: 'The <b>Folio</b> tab is a ledger of what you bought and sold. It derives your average cost, current value, ' +
         'unrealised and realised profit, and draws profit-over-time from real snapshots — I do not invent history ' +
         'you did not have. Crypto and forex value at genuinely live prices out of the box.',
      next: 'Record one real holding you actually own and let the curve start recording.',
      rel: ['prices', 'positions'] },

    /* ================= ALERTS & NEWS ================= */
    { id: 'alerts', k: ['alert', 'alerts', 'notify', 'notification', 'tell me when', 'price alert'],
      t: 'Alerts',
      a: 'The <b>Alerts</b> tab. Pick a market and a condition — price level, daily move, RSI, or a moving-average ' +
         'cross. Alerts only fire when the condition genuinely crosses from false to true, so one that is already ' +
         'true will not spam you the moment you set it. Sound, desktop pop-up, and forwarding are all optional.',
      next: 'Set one alert 2% above the current price of your favourite market — the +2% button does it in one tap.',
      rel: ['copytrade', 'calendar'] },

    { id: 'copytrade', k: ['telegram', 'discord', 'copy trade', 'copytrade', 'webhook', 'share signal', 'followers', 'forward'],
      t: 'Copy-trade forwarding',
      a: 'Alerts → <b>Delivery</b>. Point it at Telegram, Discord, or your own webhook and every trigger posts there ' +
         'automatically — that is your signal channel. Send the test signal first to prove the plumbing. Your token ' +
         'stays in this browser and goes only to the service you chose; treat it like a password, because it is one.',
      next: 'Wire the test signal into a private Telegram channel before you invite a single follower.',
      rel: ['alerts'] },

    { id: 'calendar', k: ['calendar', 'economic', 'fomc', 'cpi', 'jobs report', 'nfp', 'event', 'fed meeting'],
      t: 'Economic events',
      a: 'Radar tab, left column: a dated calendar where FOMC and CPI dates are the real published ones, anything ' +
         'derived from a rule says <b>estimated</b>, and you can add your own. Arm one and it warns you minutes ' +
         'before. These releases move everything at once — the chart goes feral at 8:30 New York time on CPI day.',
      next: 'Arm the next CPI and the next Fed decision with a 30-minute warning. Do it now, thank me later.',
      rel: ['news', 'fed', 'alerts'] },

    { id: 'news', k: ['news', 'headline', 'radar', 'keyword alert'],
      t: 'News and headlines',
      a: 'Radar tab, right column. Hacker News works keyless; Finnhub or Marketaux plug in with a free key; any JSON ' +
         'feed can be mapped. Type keywords — "fed, nvidia, hack" — and matching headlines trigger the full alert ' +
         'pipeline, including Telegram or Discord forwarding.',
      next: 'Set two keywords for things you hold. Only two — keyword soup is how you learn to ignore alerts.',
      rel: ['calendar', 'copytrade'] },

    /* ================= MARKET CONCEPTS ================= */
    { id: 'trend', k: ['trend', 'uptrend', 'downtrend', 'sideways', 'ranging', 'trending'],
      t: 'Trends',
      a: 'An uptrend makes higher highs AND higher lows; a downtrend the opposite; everything else is a range. ' +
         'The oldest useful advice in the business is not to fight it: buying dips in uptrends beats catching ' +
         'falling knives in downtrends. The daily timeframe tells you which one you are actually in.',
      next: 'Add EMA 50 and check: is price living above it (uptrend) or below it (downtrend)?',
      rel: ['timeframes', 'support', 'chartread'] },

    { id: 'support', k: ['support', 'resistance', 'bounce', 'breakout', 'key level'],
      t: 'Support and resistance',
      a: 'Prices where the market has repeatedly turned around. Support is a floor buyers defended; resistance is a ' +
         'ceiling sellers defended. They matter because everyone watches them, which makes them self-fulfilling. ' +
         'Broken resistance often becomes new support, which feels like magic and is just memory.',
      next: 'Use Drawing tools to mark the clearest floor and ceiling on your chart — two lines, no more.',
      rel: ['drawing', 'trend', 'patterns'] },

    { id: 'patterns', k: ['pattern', 'doji', 'hammer', 'engulfing', 'head and shoulders', 'double top'],
      t: 'Candle patterns',
      a: 'Shapes that hint at who is winning. A <b>hammer</b> — long lower wick after a fall — says buyers fought ' +
         'back. An <b>engulfing</b> candle swallowing the previous one says momentum flipped. A <b>doji</b> — tiny ' +
         'body — says stalemate. Hints, Queez, not prophecies: they work best AT a support or resistance level, ' +
         'not floating in space.',
      next: 'Find one hammer on the daily chart and check what happened the week after. Do it five times.',
      rel: ['chartread', 'support'] },

    { id: 'rsi', k: ['rsi', 'overbought', 'oversold', 'relative strength'],
      t: 'RSI, properly',
      a: 'A 0–100 momentum meter. Above 70 is called overbought and below 30 oversold — but here is what the ' +
         'YouTube clowns skip: in a strong trend RSI can sit above 70 for weeks while price keeps climbing. It is a ' +
         'thermometer, not a sell signal. Mean-reversion off RSI works best in sideways markets.',
      next: 'Backtest the RSI strategy on a trending market and on a choppy one — watch it behave completely differently.',
      rel: ['indicators', 'backtest', 'trend'] },

    { id: 'macdlike', k: ['macd', 'moving average cross', 'golden cross', 'death cross', 'crossover'],
      t: 'MACD and crossovers',
      a: 'MACD is the gap between a fast and slow average, plus a signal line — crossings mark momentum flipping. ' +
         'The famous <b>golden cross</b> (50-day rising through 200-day) is the same idea in slow motion. Crossovers ' +
         'shine in trends and get chopped to pieces in ranges, which is why you test before you trust, bozo.',
      next: 'Add MACD from the indicator library and see how its crossings line up with the last three swings.',
      rel: ['indicators', 'backtest', 'trend'] },

    { id: 'volume', k: ['volume', 'obv', 'money flow', 'liquidity', 'thin market'],
      t: 'Volume',
      a: 'How much actually traded. A breakout on big volume has conviction behind it; the same move on thin volume ' +
         'is a rumour. Low-liquidity markets also slip more — your order moves the price against you. Volume is the ' +
         'polygraph test for price action.',
      next: 'Turn on volume bars and find one big-volume candle — then see what price did next.',
      rel: ['chartread', 'spread'] },

    { id: 'spread', k: ['spread', 'slippage', 'bid ask', 'fees', 'commission', 'cost of trading'],
      t: 'Spreads, slippage and fees',
      a: 'The spread is the gap between what buyers pay and sellers get — you cross it on every trade. Slippage is ' +
         'the price moving between your click and your fill. Both are invisible taxes that murder overtraders. The ' +
         'backtester here charges a per-trade fee for exactly this reason.',
      next: 'Re-run any backtest with the fee at 0.2% and watch a busy strategy suddenly stop working.',
      rel: ['backtest', 'volume'] },

    { id: 'leverage', k: ['leverage', 'margin', 'liquidation', '10x', 'futures', 'borrowed'],
      t: 'Leverage',
      a: 'Trading with borrowed size. 10x means a 1% move is 10% of your money — both directions, and past a point ' +
         'the position is liquidated and the money is simply gone. It is how small accounts die fast while feeling ' +
         'clever. Learn flat first, Queez. The market pays patience, not adrenaline.',
      next: 'Practise unleveraged here until a month of your paper P/L curve slopes up. Then we talk.',
      rel: ['risk', 'positionsize'] },

    { id: 'diversify', k: ['diversify', 'diversification', 'all in', 'eggs', 'basket', 'correlation'],
      t: 'Diversification',
      a: 'Spreading across things that do not fail together. Five tech stocks is one bet wearing five hats — they ' +
         'move together. Mixing stocks, some index exposure, maybe crypto you can afford to watch halve, is real ' +
         'spreading. The Folio weight bars show your concentration honestly.',
      next: 'Open Folio and read the weight bars — one holding over half the pie means you have a bet, not a portfolio.',
      rel: ['folio', 'risk'] },

    { id: 'dca', k: ['dca', 'dollar cost', 'averaging', 'invest monthly', 'long term', 'hold'],
      t: 'Dollar-cost averaging',
      a: 'Buying a fixed amount on a schedule regardless of price. Automatically buys more when cheap, less when ' +
         'dear, and removes the timing decision most people get wrong. Boring, effective, the opposite of everything ' +
         'exciting on trading YouTube. Record the buys in Folio and your average cost updates itself.',
      next: 'Log a pretend monthly buy of an index for the last year in Folio and look at the average cost it produces.',
      rel: ['folio', 'diversify'] },

    { id: 'fed', k: ['fed', 'interest rate', 'rates', 'inflation', 'central bank', 'powell'],
      t: 'Why the Fed moves markets',
      a: 'Interest rates are gravity for prices. Higher rates make safe cash pay more, so risky assets must offer ' +
         'more and prices adjust down; cuts do the reverse. CPI matters because inflation drives what the Fed does ' +
         'next. That is why one 2pm statement can shove every chart on this site at once.',
      next: 'Arm the next Fed decision in Radar, then watch the 1m chart at release time. Educational chaos.',
      rel: ['calendar', 'forex'] },

    { id: 'forex', k: ['forex', 'currency', 'eurusd', 'pairs', 'pips', 'fx'],
      t: 'How forex works',
      a: 'Currencies trade in pairs — EURUSD is euros priced in dollars, so it rises when the euro strengthens OR ' +
         'the dollar weakens. Moves are tiny percentages (hence pips), which is why forex traders use leverage, ' +
         'which is why forex traders blow up. Rate gaps between countries drive the big trends.',
      next: 'Watch EURUSD around the next CPI release — the dollar side of every pair reacts in seconds.',
      rel: ['fed', 'leverage'] },

    { id: 'crypto', k: ['crypto', 'bitcoin', 'btc', 'ethereum', 'halving', 'altcoin', 'volatile'],
      t: 'Crypto, honestly',
      a: 'Trades 24/7, moves several percent on a normal day, and swings on sentiment more than balance sheets. ' +
         'The prices here are genuinely live from Binance. Rules that keep crypto traders alive: size smaller than ' +
         'feels right, never use money with a deadline, and altcoins are the deep end, not the entrance.',
      next: 'Compare BTC\'s daily range to a big stock\'s using ATR — same indicator, different planet.',
      rel: ['prices', 'risk', 'leverage'] },

    { id: 'hours', k: ['market hours', 'open', 'close', 'session', 'weekend', 'premarket', 'when to trade'],
      t: 'Market hours',
      a: 'US stocks trade 9:30–16:00 New York time, Monday to Friday. Forex runs round the clock through the week — ' +
         'busiest when London and New York overlap. Crypto never closes, which is bad news for sleep. The first and ' +
         'last hour of the stock day carry most of the action.',
      next: 'Check the Live chart of a stock on Saturday versus BTC — one is a flat line, one never stopped.',
      rel: ['forex', 'crypto'] },

    { id: 'paper', k: ['paper trading', 'practice', 'demo account', 'not real', 'safe', 'is this real'],
      t: 'Practice mode',
      a: 'Orders, positions and backtests here are simulated — nothing leaves your browser, no broker exists, no ' +
         'money is at risk. The live prices and TradingView charts are real; your trades are rehearsal. The pros ' +
         'rehearsed longer than you would believe, Queez.',
      next: 'Give yourself a rule: fifty paper trades with stops before a single real dollar moves anywhere.',
      rel: ['orders', 'risk'] },

    { id: 'vlogs', k: ['vlog', 'video', 'youtube', 'watch', 'shelf', 'share video'],
      t: 'Vlogs and YouTube',
      a: 'The Vlogs tab under the chart. Search YouTube (in-page with a free key, new-tab without), play videos right ' +
         'here — watching counts toward YOUR recommendations since the player carries your session — pin anything to ' +
         'your shelf with a link, and share cards to YouTube, TikTok, Instagram or X.',
      next: 'Paste any trading video link with Add by link — your shelf starts remembering.',
      rel: ['ytkey'] },

    { id: 'ytkey', k: ['youtube key', 'youtube search', 'data api', 'in page search'],
      t: 'In-page YouTube search',
      a: 'Google refuses anonymous search calls, so in-page results need a free Data API key: console.cloud.google.com ' +
         '→ enable YouTube Data API v3 → create key → paste it via <b>Set up search</b>. Ten thousand free units a ' +
         'day, playback never spends any.',
      next: 'Two minutes, one key, and the search results stop leaving the page.',
      rel: ['vlogs'] },

    { id: 'review', k: ['review', 'grade', 'report card', 'what did i do wrong', 'mistakes', 'am i good', 'my trading', 'feedback'],
      t: 'The report card',
      a: 'Trade tab → <b>Coach, grade my trading</b>. I mark your closed trades across four pillars — ' +
         '<b>Discipline</b> (were there stops), <b>Edge</b> (does the approach make money), <b>Patience</b> ' +
         '(overtrading and revenge entries), and <b>Exits</b> (cutting winners while nursing losers). Every ' +
         'grade cites the number that earned it, and every problem comes with the fix printed next to it.',
      next: 'Close a few practice trades, then press the button and face the music, Queez.',
      rel: ['orders', 'risk', 'stoploss'] },

    { id: 'shortcuts', k: ['shortcut', 'keyboard', 'hotkey', 'keys'],
      t: 'Shortcuts',
      a: '<b>/</b> search · <b>B</b> buy · <b>S</b> sell · <b>F</b> fullscreen · <b>V</b> vlogs · <b>?</b> the full ' +
         'guide · <b>Esc</b> closes whatever is open. Arrow keys drive the tour.',
      next: 'Press B right now and see how fast the ticket comes up.',
      rel: ['orders'] },

    { id: 'tour', k: ['tour', 'walkthrough', 'hints', 'guide', 'how to start', 'where do i start', 'begin', 'new here'],
      t: 'Getting started',
      a: 'The <b>?</b> button up top: replay my walking tour, switch on hint markers that label every region, read ' +
         'the full guide, or see the shortcuts. Or just ask me things here — that is literally what I am for, clown.',
      next: 'Take the tour once more with hints on. Sixty seconds, and you will stop asking me where buttons are.',
      rel: ['shortcuts'] }
  ];

  /* ----------------------------------------------------------------------
     MATCHING
     ---------------------------------------------------------------------- */
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /** Cheap noun normaliser so "candles" matches "candle", "stops" "stop". */
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function normalise(text) {
    return (' ' + text.toLowerCase().replace(/[^a-z0-9&%/ ]/g, ' ') + ' ')
      .split(/\s+/).map(stem).join(' ');
  }

  /** Score every entry, return them ranked best-first. */
  function rank(question) {
    var q = ' ' + normalise(question) + ' ';
    return KB.map(function (topic) {
      var score = 0;
      topic.k.forEach(function (word) {
        var w = normalise(word).trim();
        if (!w) return;
        var phrase = w.indexOf(' ') !== -1;
        if (q.indexOf(' ' + w + ' ') !== -1) score += phrase ? 5 : 2;
        else if (phrase && q.indexOf(w) !== -1) score += 3;
      });
      return { topic: topic, score: score };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  function byId(id) {
    for (var i = 0; i < KB.length; i++) if (KB[i].id === id) return KB[i];
    return null;
  }

  function present(topic) {
    return {
      text: '<span class="qz-open">' + pick(OPENERS) + '</span> ' + topic.a +
            ' <span class="qz-close">' + pick(CLOSERS) + '</span>',
      topic: topic.t,
      next: topic.next || null,
      related: (topic.rel || []).map(function (id) {
        var t = byId(id);
        return t ? t.t : null;
      }).filter(Boolean)
    };
  }

  /**
   * Answer a question.
   * Returns { text, topic, next, related } — text is HTML in the Coach's
   * voice; `next` is one concrete in-app action; `related` is follow-up
   * topic labels for chips.
   */
  Q.ask = function (question) {
    var text = (question || '').trim();
    if (!text) {
      return { text: 'You pressed send with an empty box, Queez. Iconic. Try typing words.', topic: null, related: [] };
    }

    if (/^(hi|hey|hello|yo|sup|hiya)\b/i.test(text)) {
      return {
        text: 'Hello to you too, Queez. I am the Coach — I know everything about this terminal ' +
              'and a worrying amount about markets, and I have been assigned to you, of all people. ' +
              'Ask me something useful.',
        topic: null, related: ['Getting started', 'Placing an order', 'Risk management']
      };
    }

    if (/thank|cheers|nice one|legend/i.test(text)) {
      return { text: 'Manners, Queez? In this economy? Genuinely moved.', topic: null, related: [] };
    }

    if (/who are you|what are you|your name/i.test(text)) {
      return {
        text: 'I am the <b>Coach</b>. You are <b>Queez</b> — everyone who walks in here is Queez to me, ' +
              'and every Queez needs teaching. I know this terminal end to end and enough market sense to keep ' +
              'you out of trouble. I am not an oracle and I will not pick your trades — but ask me how anything ' +
              'works, or what any of the jargon means, and I will sort you out.',
        topic: null, related: ['Getting started', 'Practice mode']
      };
    }

    // No trade picks — but the redirect is genuinely useful.
    if (/should i (buy|sell)|what should i (buy|trade)|will .{1,40}(go up|go down|moon|crash)|price prediction|is it a good time/i.test(text)) {
      return {
        text: 'Not a chance, Queez. I am your coach, not your financial adviser, and nobody honest predicts ' +
              'prices in a chat box. Here is what actually helps: <b>backtest</b> the idea over a year of history, ' +
              'check the <b>drawdown</b> would not break you, size the position from your <b>stop</b>, and set an ' +
              '<b>alert</b> at your level instead of staring at the screen. That is four real edges, bozo, and ' +
              'every one is a tab on this site.',
        topic: 'The honest answer',
        next: 'Open the Test tab and run the idea over the last year. Numbers beat vibes.',
        related: ['Backtesting', 'Risk management', 'Alerts']
      };
    }

    var ranked = rank(text);

    if (!ranked.length) {
      return {
        text: 'No idea what you are asking, Queez, and I say that with love. Try words like <b>alerts</b>, ' +
              '<b>portfolio</b>, <b>indicators</b>, <b>backtest</b>, <b>risk</b>, <b>candles</b> or <b>leverage</b> ' +
              '— or press a chip below.',
        topic: null,
        related: ['Getting started', 'Reading candles', 'Risk management']
      };
    }

    // Low confidence: offer the best guesses rather than bluffing an answer.
    if (ranked[0].score < 2 && ranked.length > 1) {
      return {
        text: 'I am only half sure what you mean, Queez, and I do not bluff. Closest things I know: ' +
              ranked.slice(0, 3).map(function (r) { return '<b>' + r.topic.t + '</b>'; }).join(', ') +
              '. Tap one below and I will do it properly.',
        topic: null,
        related: ranked.slice(0, 3).map(function (r) { return r.topic.t; })
      };
    }

    return present(ranked[0].topic);
  };

  /** Answer a topic label directly (used by the follow-up chips). */
  Q.askTopic = function (label) {
    for (var i = 0; i < KB.length; i++) {
      if (KB[i].t === label) return present(KB[i]);
    }
    return Q.ask(label);
  };

  /** Suggested questions shown as chips before any conversation. */
  Q.suggestions = function () {
    return ['How do I set an alert?', 'What is a stop loss?', 'Are these prices real?',
            'How does the portfolio work?', 'What does RSI actually mean?',
            'How much should I risk?', 'Can I make my own indicator?'];
  };

  Q.topicCount = function () { return KB.length; };

  /* ----------------------------------------------------------------------
     QUIPS — reactions to what Queez does
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
