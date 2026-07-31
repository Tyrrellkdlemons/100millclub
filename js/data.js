/* ==========================================================================
   data.js — instruments, TradingView symbol mapping, vlogs, shared state
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};

  /* ----------------------------------------------------------------------
     INSTRUMENTS
     s  = symbol            n  = full name        m  = market category
     p  = current price     d  = decimal places   v  = daily volatility
     tv = TradingView ticker used by the live widgets
     ---------------------------------------------------------------------- */
  MC.ASSETS = [
    /* ---- Futures: the micros ----
       CME's delayed feed resolves on the scanner but the embedded widget
       refuses it outright ("only available on TradingView") — verified by
       loading it, not assumed. So the live chart tracks each micro's free
       proxy with the gold "via" chip owning up to it, while `tvPro` carries
       the genuine continuous contract for the TradingView handoff. Prices
       are seeded from the actual CME closes read off the scanner. */
    { s: 'MES',  n: 'Micro E-mini S&P 500',    m: 'futures', p: 7470.00,  d: 2, v: 0.011,
      tv: 'AMEX:SPY',   tvPro: 'CME_MINI:MES1!', tvProxy: 'SPY ETF' },
    { s: 'MNQ',  n: 'Micro E-mini Nasdaq-100', m: 'futures', p: 28264.25, d: 2, v: 0.015,
      tv: 'NASDAQ:QQQ', tvPro: 'CME_MINI:MNQ1!', tvProxy: 'QQQ ETF' },
    { s: 'MYM',  n: 'Micro E-mini Dow',        m: 'futures', p: 52430,    d: 0, v: 0.010,
      tv: 'TVC:DJI',    tvPro: 'CBOT_MINI:MYM1!', tvProxy: 'DJI index' },
    { s: 'M2K',  n: 'Micro E-mini Russell',    m: 'futures', p: 2928.9,   d: 1, v: 0.016,
      tv: 'TVC:RUT',    tvPro: 'CME_MINI:M2K1!', tvProxy: 'RUT index' },

    /* ---- Stocks ---- */
    { s: 'AAPL',  n: 'Apple Inc.',              m: 'stocks',  p: 227.52,   d: 2, v: 0.018, tv: 'NASDAQ:AAPL' },
    { s: 'NVDA',  n: 'NVIDIA Corporation',      m: 'stocks',  p: 131.26,   d: 2, v: 0.034, tv: 'NASDAQ:NVDA' },
    { s: 'MSFT',  n: 'Microsoft Corporation',   m: 'stocks',  p: 428.15,   d: 2, v: 0.016, tv: 'NASDAQ:MSFT' },
    { s: 'AMZN',  n: 'Amazon.com Inc.',         m: 'stocks',  p: 186.43,   d: 2, v: 0.021, tv: 'NASDAQ:AMZN' },
    { s: 'GOOGL', n: 'Alphabet Inc. Class A',   m: 'stocks',  p: 171.09,   d: 2, v: 0.019, tv: 'NASDAQ:GOOGL' },
    { s: 'TSLA',  n: 'Tesla Inc.',              m: 'stocks',  p: 248.77,   d: 2, v: 0.041, tv: 'NASDAQ:TSLA' },
    { s: 'META',  n: 'Meta Platforms Inc.',     m: 'stocks',  p: 563.20,   d: 2, v: 0.023, tv: 'NASDAQ:META' },
    { s: 'AMD',   n: 'Advanced Micro Devices',  m: 'stocks',  p: 142.88,   d: 2, v: 0.036, tv: 'NASDAQ:AMD' },

    /* ---- Crypto ---- */
    { s: 'BTC',   n: 'Bitcoin',                 m: 'crypto',  p: 67420.50, d: 2, v: 0.038, tv: 'BINANCE:BTCUSDT' },
    { s: 'ETH',   n: 'Ethereum',                m: 'crypto',  p: 3284.16,  d: 2, v: 0.045, tv: 'BINANCE:ETHUSDT' },
    { s: 'SOL',   n: 'Solana',                  m: 'crypto',  p: 171.42,   d: 2, v: 0.062, tv: 'BINANCE:SOLUSDT' },
    { s: 'XRP',   n: 'XRP',                     m: 'crypto',  p: 0.6234,   d: 4, v: 0.055, tv: 'BINANCE:XRPUSDT' },
    { s: 'ADA',   n: 'Cardano',                 m: 'crypto',  p: 0.4487,   d: 4, v: 0.058, tv: 'BINANCE:ADAUSDT' },
    { s: 'DOGE',  n: 'Dogecoin',                m: 'crypto',  p: 0.1382,   d: 4, v: 0.071, tv: 'BINANCE:DOGEUSDT' },

    /* ---- Forex ---- */
    { s: 'EURUSD', n: 'Euro / US Dollar',           m: 'forex', p: 1.08642, d: 5, v: 0.005, tv: 'FX:EURUSD' },
    { s: 'GBPUSD', n: 'British Pound / US Dollar',  m: 'forex', p: 1.29315, d: 5, v: 0.006, tv: 'FX:GBPUSD' },
    { s: 'USDJPY', n: 'US Dollar / Japanese Yen',   m: 'forex', p: 151.284, d: 3, v: 0.006, tv: 'FX:USDJPY' },
    { s: 'AUDUSD', n: 'Australian / US Dollar',     m: 'forex', p: 0.66218, d: 5, v: 0.007, tv: 'FX:AUDUSD' },
    { s: 'USDCAD', n: 'US Dollar / Canadian Dollar',m: 'forex', p: 1.36420, d: 5, v: 0.005, tv: 'FX:USDCAD' },

    /* ---- Indices ----
       Index tickers are the one place the embedded widget gets fussy, so these
       were chosen by probing TradingView's scanner for what actually resolves
       anonymously:

       · TVC: feeds that report update_mode "streaming" are TradingView's own
         free index feeds and render for everyone — used wherever one exists.
       · The S&P 500 and NASDAQ 100 have no free index feed (SP:SPX, TVC:SPX
         and every broker CFD mirror either 404 or demand a data entitlement),
         so those chart the liquid ETF that tracks them. `tvProxy` flags that
         so the UI can say so out loud.
       · `tvPro` is the real exchange ticker. It is never used for the embed —
         only for the "Open in TradingView" link, so anyone who *does* hold the
         entitlement lands on the genuine index in their own account. */
    { s: 'SPX',   n: 'S&P 500',               m: 'indices', p: 5745.37,  d: 2, v: 0.011,
      tv: 'AMEX:SPY',    tvPro: 'SP:SPX',        tvProxy: 'SPY ETF' },
    { s: 'NDX',   n: 'NASDAQ 100',            m: 'indices', p: 20012.84, d: 2, v: 0.015,
      tv: 'NASDAQ:QQQ',  tvPro: 'NASDAQ:NDX',    tvProxy: 'QQQ ETF' },
    { s: 'DJI',   n: 'Dow Jones Industrial',  m: 'indices', p: 42330.15, d: 2, v: 0.010,
      tv: 'TVC:DJI',     tvPro: 'DJ:DJI' },
    { s: 'RUT',   n: 'Russell 2000',          m: 'indices', p: 2224.71,  d: 2, v: 0.016, tv: 'TVC:RUT' },
    { s: 'FTSE',  n: 'FTSE 100 · UK',         m: 'indices', p: 8320.76,  d: 2, v: 0.010, tv: 'TVC:UKX' },
    { s: 'DAX',   n: 'DAX 40 · Germany',      m: 'indices', p: 19473.63, d: 2, v: 0.012,
      tv: 'TVC:DEU40',   tvPro: 'XETR:DAX' },
    { s: 'CAC',   n: 'CAC 40 · France',       m: 'indices', p: 7791.79,  d: 2, v: 0.012,
      tv: 'TVC:CAC40',   tvPro: 'EURONEXT:PX1' },
    { s: 'N225',  n: 'Nikkei 225 · Japan',    m: 'indices', p: 38925.63, d: 2, v: 0.014, tv: 'TVC:NI225' },
    { s: 'HSI',   n: 'Hang Seng · Hong Kong', m: 'indices', p: 20632.30, d: 2, v: 0.018, tv: 'TVC:HSI' },
    { s: 'STOXX', n: 'Euro Stoxx 50',         m: 'indices', p: 5067.45,  d: 2, v: 0.012, tv: 'TVC:SX5E' },
    { s: 'VIX',   n: 'Volatility Index',      m: 'indices', p: 16.42,    d: 2, v: 0.070, tv: 'TVC:VIX' }
  ];

  /** Fast symbol → asset lookup. */
  MC.MAP = {};
  MC.ASSETS.forEach(function (a) {
    a.base = a.p;                          // anchor used by the bar generator
    a.chg = Math.random() * 4 - 1.6;       // opening daily % change
    MC.MAP[a.s] = a;
  });

  MC.MKT_LABEL = { futures: 'Futures', stocks: 'Stocks', crypto: 'Crypto', forex: 'Forex', indices: 'Indices' };

  /** Seconds covered by one bar, per timeframe. */
  MC.TF_SEC = { '1s': 1, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };

  /** Our timeframe → TradingView interval code. */
  /* '1S' needs a paid TradingView plan, so the anonymous embed cannot show
     seconds — picking 1s flips to the simulated engine, which genuinely
     rolls a fresh bar every second. */
  MC.TV_INTERVAL = { '1s': '1', '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };

  /** Symbols shown in the live TradingView ticker tape across the top. */
  MC.TAPE_SYMBOLS = [
    { proName: 'AMEX:SPY',          title: 'S&P 500' },
    { proName: 'NASDAQ:QQQ',        title: 'NASDAQ 100' },
    { proName: 'TVC:DJI',           title: 'Dow Jones' },
    { proName: 'TVC:UKX',           title: 'FTSE 100' },
    { proName: 'TVC:DEU40',         title: 'DAX' },
    { proName: 'TVC:NI225',         title: 'Nikkei 225' },
    { proName: 'NASDAQ:AAPL',       title: 'Apple' },
    { proName: 'NASDAQ:NVDA',       title: 'NVIDIA' },
    { proName: 'NASDAQ:TSLA',       title: 'Tesla' },
    { proName: 'BINANCE:BTCUSDT',   title: 'Bitcoin' },
    { proName: 'BINANCE:ETHUSDT',   title: 'Ethereum' },
    { proName: 'FX:EURUSD',         title: 'EUR/USD' },
    { proName: 'TVC:GOLD',          title: 'Gold' },
    { proName: 'TVC:USOIL',         title: 'Crude Oil' }
  ];

  /* ----------------------------------------------------------------------
     VLOGS — sample creator content
     ---------------------------------------------------------------------- */
  /* Each tape fronts a real, embeddable YouTube video (every id verified via
     oEmbed before it went in) — clicking a card genuinely plays it in the
     mini-player, and `by` credits the actual creator. */
  MC.VLOGS = [
    { id: 'v1', t: 'How I turned $1K into $10K — the grind breakdown',        tag: 'New', yt: '26k11QP0hk8', by: 'kentrell hill' },
    { id: 'v2', t: 'The only candlestick pattern guide you will ever need',   tag: '',    yt: 'tW13N4Hll88', by: 'TradingLab' },
    { id: 'v3', t: 'Risk management — never blow an account again',           tag: 'Hot', yt: '94GFz7tPKVE', by: 'Justin Werlein' },
    { id: 'v4', t: 'How to backtest a strategy the right way',                tag: '',    yt: 'FNTRAIkLvek', by: 'Jooviers Gems' },
    { id: 'v5', t: 'Crypto vs stocks — where should the money go?',           tag: '',    yt: 'Gg61BMUilBw', by: 'VP Motion' },
    { id: 'v6', t: 'The 6AM routine before the bell rings',                   tag: '',    yt: 'MvvXipgWYnY', by: 'Day Trading Addict' },
    { id: 'v7', t: 'Forex sessions explained — when to trade, when to sit',   tag: '',    yt: 'znpD7T_9fMQ', by: 'SimulationFX' },
    { id: 'v8', t: 'Day trading results from a real first year',              tag: 'Doc', yt: 'u7OYK0EcXSc', by: 'James Rich Young' }
  ];

  /** Plain-English description shown under the strategy dropdown. */
  MC.STRAT_NOTE = {
    sma:  'Buys when the 10-bar average crosses above the 30-bar average, and sells when it crosses back below. A classic trend follower.',
    rsi:  'Buys when momentum drops under 30 (oversold) and sells when it climbs back over 70 (overbought). Works best in sideways markets.',
    macd: 'Buys when the MACD line crosses above its signal line and sells on the cross back down. A momentum-flip system.',
    bb:   'Buys when price closes below the lower band and sells when it returns to the middle band. A mean-reversion play.'
  };

  /* ----------------------------------------------------------------------
     SHARED STATE — every module reads and writes this one object
     ---------------------------------------------------------------------- */
  MC.State = {
    symbol: 'MES',
    tf: '1h',
    market: 'all',
    query: '',
    source: 'live',        // 'live' = TradingView widget · 'sim' = Lightweight Charts
    chartStyle: 'candles', // candles | bars | heikin | line | area | baseline
    bars: [],
    side: 'buy',
    positions: [],
    chart: null,

    /** Indicators currently on the chart: [{ uid, id, params }]. */
    activeIndicators: [],
    showVolume: true,

    cfg: { live: true, speed: 1500 },
    draw: null,
    drawPts: [],
    liveTimer: null,

    /** The currently selected instrument. */
    get asset() { return MC.MAP[this.symbol]; }
  };

})(window);
