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

  MC.MKT_LABEL = { stocks: 'Stocks', crypto: 'Crypto', forex: 'Forex', indices: 'Indices' };

  /** Seconds covered by one bar, per timeframe. */
  MC.TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };

  /** Our timeframe → TradingView interval code. */
  MC.TV_INTERVAL = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };

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
  MC.VLOGS = [
    { id: 'v1', t: 'How I turned $1K into $10K — the full City of Grind breakdown', tag: 'New', dur: '18:42', views: '184K', date: '2 days ago',   seed: 'grind1' },
    { id: 'v2', t: 'Reading candles like a pro: the only 3 patterns that matter',        tag: '',    dur: '12:05', views: '96K',  date: '5 days ago',   seed: 'grind2' },
    { id: 'v3', t: 'Risk management 101 — never blow an account again',             tag: 'Hot', dur: '22:17', views: '241K', date: '1 week ago',   seed: 'grind3' },
    { id: 'v4', t: 'Backtesting a moving average crossover live on stream',              tag: '',    dur: '31:08', views: '58K',  date: '2 weeks ago',  seed: 'grind4' },
    { id: 'v5', t: 'Crypto vs stocks — where the grind actually pays in 2026',      tag: '',    dur: '15:33', views: '127K', date: '3 weeks ago',  seed: 'grind5' },
    { id: 'v6', t: 'My morning routine before the bell rings (full walkthrough)',        tag: '',    dur: '09:51', views: '72K',  date: '1 month ago',  seed: 'grind6' },
    { id: 'v7', t: 'Forex sessions explained — when to trade and when to sit out',  tag: '',    dur: '14:26', views: '83K',  date: '1 month ago',  seed: 'grind7' },
    { id: 'v8', t: 'From broke to break-even: year one of the 100MillClub journey',      tag: 'Doc', dur: '44:12', views: '312K', date: '2 months ago', seed: 'grind8' }
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
    symbol: 'AAPL',
    tf: '1h',
    market: 'all',
    query: '',
    source: 'live',        // 'live' = TradingView widget · 'sim' = Lightweight Charts
    bars: [],
    side: 'buy',
    positions: [],
    chart: null,
    rsiChart: null,
    rsiSeries: null,
    ind: { sma: false, ema: false, bb: false, rsi: false, vol: true },
    cfg: { live: true, speed: 1500 },
    draw: null,
    drawPts: [],
    liveTimer: null,

    /** The currently selected instrument. */
    get asset() { return MC.MAP[this.symbol]; }
  };

})(window);
