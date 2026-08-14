/* ==========================================================================
   markets.js — market modes, the expanded universe, dynamic instruments

   Loads straight after data.js and grows MC.ASSETS from the founding 34 to
   the full curated universe (~130), then keeps growing it at runtime: any
   symbol found through search can be registered as a real instrument and
   from that moment it charts, quotes, trades and alerts like a built-in.

   It also owns the MARKET MODE — All / Futures / Stocks / Crypto / Forex /
   Indices — which used to filter only the watchlist. Now it steers the whole
   terminal: watchlist universe, chart symbol, ticker tape, screener, heatmap
   and the signals desk all follow it.

   And it remembers taste: every market the visitor loads is counted, so
   search results and signals can put what they actually watch first.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var M = MC.markets = {};

  var MODE_KEY   = 'mc_market';
  var RECENT_KEY = 'mc_recent_syms';
  var FAV_KEY    = 'mc_fav_syms';
  var SEEN_KEY   = 'mc_seen_syms';
  var CUSTOM_KEY = 'mc_custom_assets';

  /* ----------------------------------------------------------------------
     THE EXPANDED UNIVERSE
     Same shape as data.js entries, plus:
       exch  exchange / venue label shown in search
       sec   sector or category label shown in search
       yh    Yahoo Finance symbol, used by the /api quote+history proxy
     Seeds (p) are only anchors for the simulated engine — the live feeds
     overwrite them within seconds wherever a real price is obtainable.
     ---------------------------------------------------------------------- */
  var EXTRA = [
    /* ---- Stocks: the names people actually search ---- */
    { s: 'NFLX', n: 'Netflix Inc.',            m: 'stocks', p: 1180.00, d: 2, v: 0.024, tv: 'NASDAQ:NFLX', exch: 'NASDAQ', sec: 'Media' },
    { s: 'DIS',  n: 'Walt Disney Company',     m: 'stocks', p: 118.40,  d: 2, v: 0.018, tv: 'NYSE:DIS',    exch: 'NYSE',   sec: 'Media' },
    { s: 'JPM',  n: 'JPMorgan Chase & Co.',    m: 'stocks', p: 292.10,  d: 2, v: 0.015, tv: 'NYSE:JPM',    exch: 'NYSE',   sec: 'Banks' },
    { s: 'BAC',  n: 'Bank of America',         m: 'stocks', p: 47.85,   d: 2, v: 0.017, tv: 'NYSE:BAC',    exch: 'NYSE',   sec: 'Banks' },
    { s: 'V',    n: 'Visa Inc.',               m: 'stocks', p: 352.60,  d: 2, v: 0.014, tv: 'NYSE:V',      exch: 'NYSE',   sec: 'Payments' },
    { s: 'MA',   n: 'Mastercard Inc.',         m: 'stocks', p: 585.20,  d: 2, v: 0.014, tv: 'NYSE:MA',     exch: 'NYSE',   sec: 'Payments' },
    { s: 'WMT',  n: 'Walmart Inc.',            m: 'stocks', p: 102.35,  d: 2, v: 0.012, tv: 'NYSE:WMT',    exch: 'NYSE',   sec: 'Retail' },
    { s: 'COST', n: 'Costco Wholesale',        m: 'stocks', p: 985.40,  d: 2, v: 0.014, tv: 'NASDAQ:COST', exch: 'NASDAQ', sec: 'Retail' },
    { s: 'KO',   n: 'Coca-Cola Company',       m: 'stocks', p: 71.20,   d: 2, v: 0.010, tv: 'NYSE:KO',     exch: 'NYSE',   sec: 'Consumer' },
    { s: 'PEP',  n: 'PepsiCo Inc.',            m: 'stocks', p: 148.75,  d: 2, v: 0.011, tv: 'NASDAQ:PEP',  exch: 'NASDAQ', sec: 'Consumer' },
    { s: 'MCD',  n: "McDonald's Corporation",  m: 'stocks', p: 302.15,  d: 2, v: 0.011, tv: 'NYSE:MCD',    exch: 'NYSE',   sec: 'Consumer' },
    { s: 'NKE',  n: 'Nike Inc.',               m: 'stocks', p: 78.90,   d: 2, v: 0.019, tv: 'NYSE:NKE',    exch: 'NYSE',   sec: 'Consumer' },
    { s: 'INTC', n: 'Intel Corporation',       m: 'stocks', p: 24.15,   d: 2, v: 0.030, tv: 'NASDAQ:INTC', exch: 'NASDAQ', sec: 'Semis' },
    { s: 'ADBE', n: 'Adobe Inc.',              m: 'stocks', p: 368.40,  d: 2, v: 0.021, tv: 'NASDAQ:ADBE', exch: 'NASDAQ', sec: 'Software' },
    { s: 'CRM',  n: 'Salesforce Inc.',         m: 'stocks', p: 268.90,  d: 2, v: 0.020, tv: 'NYSE:CRM',    exch: 'NYSE',   sec: 'Software' },
    { s: 'ORCL', n: 'Oracle Corporation',      m: 'stocks', p: 246.30,  d: 2, v: 0.022, tv: 'NYSE:ORCL',   exch: 'NYSE',   sec: 'Software' },
    { s: 'AVGO', n: 'Broadcom Inc.',           m: 'stocks', p: 298.55,  d: 2, v: 0.026, tv: 'NASDAQ:AVGO', exch: 'NASDAQ', sec: 'Semis' },
    { s: 'QCOM', n: 'Qualcomm Inc.',           m: 'stocks', p: 168.20,  d: 2, v: 0.024, tv: 'NASDAQ:QCOM', exch: 'NASDAQ', sec: 'Semis' },
    { s: 'MU',   n: 'Micron Technology',       m: 'stocks', p: 122.60,  d: 2, v: 0.033, tv: 'NASDAQ:MU',   exch: 'NASDAQ', sec: 'Semis' },
    { s: 'SMCI', n: 'Super Micro Computer',    m: 'stocks', p: 44.80,   d: 2, v: 0.045, tv: 'NASDAQ:SMCI', exch: 'NASDAQ', sec: 'Hardware' },
    { s: 'PLTR', n: 'Palantir Technologies',   m: 'stocks', p: 158.30,  d: 2, v: 0.038, tv: 'NASDAQ:PLTR', exch: 'NASDAQ', sec: 'Software' },
    { s: 'COIN', n: 'Coinbase Global',         m: 'stocks', p: 318.45,  d: 2, v: 0.042, tv: 'NASDAQ:COIN', exch: 'NASDAQ', sec: 'Crypto-adjacent' },
    { s: 'HOOD', n: 'Robinhood Markets',       m: 'stocks', p: 104.60,  d: 2, v: 0.040, tv: 'NASDAQ:HOOD', exch: 'NASDAQ', sec: 'Brokers' },
    { s: 'MSTR', n: 'MicroStrategy (Strategy)',m: 'stocks', p: 368.20,  d: 2, v: 0.052, tv: 'NASDAQ:MSTR', exch: 'NASDAQ', sec: 'Crypto-adjacent' },
    { s: 'PYPL', n: 'PayPal Holdings',         m: 'stocks', p: 74.10,   d: 2, v: 0.023, tv: 'NASDAQ:PYPL', exch: 'NASDAQ', sec: 'Payments' },
    { s: 'UBER', n: 'Uber Technologies',       m: 'stocks', p: 92.35,   d: 2, v: 0.023, tv: 'NYSE:UBER',   exch: 'NYSE',   sec: 'Platforms' },
    { s: 'ABNB', n: 'Airbnb Inc.',             m: 'stocks', p: 128.70,  d: 2, v: 0.024, tv: 'NASDAQ:ABNB', exch: 'NASDAQ', sec: 'Platforms' },
    { s: 'SHOP', n: 'Shopify Inc.',            m: 'stocks', p: 118.25,  d: 2, v: 0.031, tv: 'NYSE:SHOP',   exch: 'NYSE',   sec: 'E-commerce' },
    { s: 'SPOT', n: 'Spotify Technology',      m: 'stocks', p: 685.90,  d: 2, v: 0.024, tv: 'NYSE:SPOT',   exch: 'NYSE',   sec: 'Media' },
    { s: 'BABA', n: 'Alibaba Group (ADR)',     m: 'stocks', p: 118.55,  d: 2, v: 0.028, tv: 'NYSE:BABA',   exch: 'NYSE',   sec: 'E-commerce' },
    { s: 'TSM',  n: 'Taiwan Semiconductor',    m: 'stocks', p: 238.40,  d: 2, v: 0.024, tv: 'NYSE:TSM',    exch: 'NYSE',   sec: 'Semis' },
    { s: 'GME',  n: 'GameStop Corp.',          m: 'stocks', p: 23.80,   d: 2, v: 0.055, tv: 'NYSE:GME',    exch: 'NYSE',   sec: 'Retail' },
    { s: 'F',    n: 'Ford Motor Company',      m: 'stocks', p: 11.45,   d: 2, v: 0.020, tv: 'NYSE:F',      exch: 'NYSE',   sec: 'Autos' },
    { s: 'GM',   n: 'General Motors',          m: 'stocks', p: 52.90,   d: 2, v: 0.020, tv: 'NYSE:GM',     exch: 'NYSE',   sec: 'Autos' },
    { s: 'XOM',  n: 'Exxon Mobil',             m: 'stocks', p: 112.80,  d: 2, v: 0.016, tv: 'NYSE:XOM',    exch: 'NYSE',   sec: 'Energy' },
    { s: 'CVX',  n: 'Chevron Corporation',     m: 'stocks', p: 152.30,  d: 2, v: 0.015, tv: 'NYSE:CVX',    exch: 'NYSE',   sec: 'Energy' },
    { s: 'JNJ',  n: 'Johnson & Johnson',       m: 'stocks', p: 162.40,  d: 2, v: 0.011, tv: 'NYSE:JNJ',    exch: 'NYSE',   sec: 'Health' },
    { s: 'UNH',  n: 'UnitedHealth Group',      m: 'stocks', p: 282.60,  d: 2, v: 0.023, tv: 'NYSE:UNH',    exch: 'NYSE',   sec: 'Health' },
    { s: 'PFE',  n: 'Pfizer Inc.',             m: 'stocks', p: 24.95,   d: 2, v: 0.016, tv: 'NYSE:PFE',    exch: 'NYSE',   sec: 'Health' },

    /* ---- Crypto: every one of these has a Binance USDT pair, so the price
       goes live with no key the moment the page is online ---- */
    { s: 'BNB',  n: 'BNB',              m: 'crypto', p: 845.00,   d: 2, v: 0.040, tv: 'BINANCE:BNBUSDT',  exch: 'Binance', sec: 'Exchange token' },
    { s: 'AVAX', n: 'Avalanche',        m: 'crypto', p: 24.30,    d: 3, v: 0.060, tv: 'BINANCE:AVAXUSDT', exch: 'Binance', sec: 'Layer 1' },
    { s: 'LINK', n: 'Chainlink',        m: 'crypto', p: 17.85,    d: 3, v: 0.055, tv: 'BINANCE:LINKUSDT', exch: 'Binance', sec: 'Oracle' },
    { s: 'DOT',  n: 'Polkadot',         m: 'crypto', p: 3.92,     d: 3, v: 0.055, tv: 'BINANCE:DOTUSDT',  exch: 'Binance', sec: 'Layer 0' },
    { s: 'LTC',  n: 'Litecoin',         m: 'crypto', p: 118.40,   d: 2, v: 0.045, tv: 'BINANCE:LTCUSDT',  exch: 'Binance', sec: 'Payments' },
    { s: 'SHIB', n: 'Shiba Inu',        m: 'crypto', p: 0.0000132,d: 8, v: 0.075, tv: 'BINANCE:SHIBUSDT', exch: 'Binance', sec: 'Meme' },
    { s: 'PEPE', n: 'Pepe',             m: 'crypto', p: 0.0000108,d: 8, v: 0.095, tv: 'BINANCE:PEPEUSDT', exch: 'Binance', sec: 'Meme' },
    { s: 'UNI',  n: 'Uniswap',          m: 'crypto', p: 9.85,     d: 3, v: 0.060, tv: 'BINANCE:UNIUSDT',  exch: 'Binance', sec: 'DeFi' },
    { s: 'ATOM', n: 'Cosmos',           m: 'crypto', p: 4.55,     d: 3, v: 0.058, tv: 'BINANCE:ATOMUSDT', exch: 'Binance', sec: 'Layer 0' },
    { s: 'NEAR', n: 'NEAR Protocol',    m: 'crypto', p: 2.65,     d: 3, v: 0.062, tv: 'BINANCE:NEARUSDT', exch: 'Binance', sec: 'Layer 1' },
    { s: 'ARB',  n: 'Arbitrum',         m: 'crypto', p: 0.485,    d: 4, v: 0.065, tv: 'BINANCE:ARBUSDT',  exch: 'Binance', sec: 'Layer 2' },
    { s: 'OP',   n: 'Optimism',         m: 'crypto', p: 0.72,     d: 4, v: 0.065, tv: 'BINANCE:OPUSDT',   exch: 'Binance', sec: 'Layer 2' },
    { s: 'APT',  n: 'Aptos',            m: 'crypto', p: 4.85,     d: 3, v: 0.062, tv: 'BINANCE:APTUSDT',  exch: 'Binance', sec: 'Layer 1' },
    { s: 'SUI',  n: 'Sui',              m: 'crypto', p: 3.65,     d: 3, v: 0.068, tv: 'BINANCE:SUIUSDT',  exch: 'Binance', sec: 'Layer 1' },
    { s: 'TRX',  n: 'TRON',             m: 'crypto', p: 0.352,    d: 4, v: 0.038, tv: 'BINANCE:TRXUSDT',  exch: 'Binance', sec: 'Layer 1' },
    { s: 'BCH',  n: 'Bitcoin Cash',     m: 'crypto', p: 585.00,   d: 2, v: 0.048, tv: 'BINANCE:BCHUSDT',  exch: 'Binance', sec: 'Payments' },
    { s: 'ETC',  n: 'Ethereum Classic', m: 'crypto', p: 22.40,    d: 3, v: 0.052, tv: 'BINANCE:ETCUSDT',  exch: 'Binance', sec: 'Layer 1' },
    { s: 'FIL',  n: 'Filecoin',         m: 'crypto', p: 2.85,     d: 3, v: 0.058, tv: 'BINANCE:FILUSDT',  exch: 'Binance', sec: 'Storage' },
    { s: 'INJ',  n: 'Injective',        m: 'crypto', p: 13.60,    d: 3, v: 0.068, tv: 'BINANCE:INJUSDT',  exch: 'Binance', sec: 'DeFi' },
    { s: 'HBAR', n: 'Hedera',           m: 'crypto', p: 0.245,    d: 4, v: 0.060, tv: 'BINANCE:HBARUSDT', exch: 'Binance', sec: 'Layer 1' },
    { s: 'ICP',  n: 'Internet Computer',m: 'crypto', p: 5.45,     d: 3, v: 0.058, tv: 'BINANCE:ICPUSDT',  exch: 'Binance', sec: 'Compute' },
    { s: 'AAVE', n: 'Aave',             m: 'crypto', p: 315.00,   d: 2, v: 0.058, tv: 'BINANCE:AAVEUSDT', exch: 'Binance', sec: 'DeFi' },
    { s: 'ALGO', n: 'Algorand',         m: 'crypto', p: 0.275,    d: 4, v: 0.058, tv: 'BINANCE:ALGOUSDT', exch: 'Binance', sec: 'Layer 1' },
    { s: 'XLM',  n: 'Stellar',          m: 'crypto', p: 0.435,    d: 4, v: 0.055, tv: 'BINANCE:XLMUSDT',  exch: 'Binance', sec: 'Payments' },
    { s: 'TON',  n: 'Toncoin',          m: 'crypto', p: 3.35,     d: 3, v: 0.060, tv: 'BINANCE:TONUSDT',  exch: 'Binance', sec: 'Layer 1' },

    /* ---- Forex: majors' crosses + the liquid exotics. Every pair here can
       be priced from ECB reference rates, so they are live with no key ---- */
    { s: 'USDCHF', n: 'US Dollar / Swiss Franc',     m: 'forex', p: 0.79850, d: 5, v: 0.005, tv: 'FX:USDCHF', exch: 'FX', sec: 'Major' },
    { s: 'NZDUSD', n: 'New Zealand / US Dollar',     m: 'forex', p: 0.59720, d: 5, v: 0.007, tv: 'FX:NZDUSD', exch: 'FX', sec: 'Major' },
    { s: 'EURGBP', n: 'Euro / British Pound',        m: 'forex', p: 0.86420, d: 5, v: 0.004, tv: 'FX:EURGBP', exch: 'FX', sec: 'Cross' },
    { s: 'EURJPY', n: 'Euro / Japanese Yen',         m: 'forex', p: 172.450, d: 3, v: 0.006, tv: 'FX:EURJPY', exch: 'FX', sec: 'Cross' },
    { s: 'GBPJPY', n: 'British Pound / Japanese Yen',m: 'forex', p: 199.520, d: 3, v: 0.007, tv: 'FX:GBPJPY', exch: 'FX', sec: 'Cross' },
    { s: 'AUDJPY', n: 'Australian Dollar / Yen',     m: 'forex', p: 97.340,  d: 3, v: 0.007, tv: 'FX:AUDJPY', exch: 'FX', sec: 'Cross' },
    { s: 'EURCHF', n: 'Euro / Swiss Franc',          m: 'forex', p: 0.93250, d: 5, v: 0.004, tv: 'FX:EURCHF', exch: 'FX', sec: 'Cross' },
    { s: 'EURAUD', n: 'Euro / Australian Dollar',    m: 'forex', p: 1.76380, d: 5, v: 0.006, tv: 'FX:EURAUD', exch: 'FX', sec: 'Cross' },
    { s: 'CADJPY', n: 'Canadian Dollar / Yen',       m: 'forex', p: 107.680, d: 3, v: 0.006, tv: 'FX:CADJPY', exch: 'FX', sec: 'Cross' },
    { s: 'GBPCHF', n: 'British Pound / Swiss Franc', m: 'forex', p: 1.07890, d: 5, v: 0.005, tv: 'FX:GBPCHF', exch: 'FX', sec: 'Cross' },
    { s: 'AUDNZD', n: 'Australian / New Zealand',    m: 'forex', p: 1.10880, d: 5, v: 0.005, tv: 'FX:AUDNZD', exch: 'FX', sec: 'Cross' },
    { s: 'USDMXN', n: 'US Dollar / Mexican Peso',    m: 'forex', p: 18.6250, d: 4, v: 0.008, tv: 'FX:USDMXN', exch: 'FX', sec: 'Exotic' },
    { s: 'USDZAR', n: 'US Dollar / South African Rand', m: 'forex', p: 17.6480, d: 4, v: 0.010, tv: 'FX:USDZAR', exch: 'FX', sec: 'Exotic' },
    { s: 'USDTRY', n: 'US Dollar / Turkish Lira',    m: 'forex', p: 40.850,  d: 3, v: 0.010, tv: 'FX:USDTRY', exch: 'FX', sec: 'Exotic' },
    { s: 'USDSGD', n: 'US Dollar / Singapore Dollar',m: 'forex', p: 1.28150, d: 5, v: 0.004, tv: 'FX:USDSGD', exch: 'FX', sec: 'Exotic' },
    { s: 'USDSEK', n: 'US Dollar / Swedish Krona',   m: 'forex', p: 9.5480,  d: 4, v: 0.007, tv: 'FX:USDSEK', exch: 'FX', sec: 'Exotic' },
    { s: 'USDNOK', n: 'US Dollar / Norwegian Krone', m: 'forex', p: 10.1250, d: 4, v: 0.007, tv: 'FX:USDNOK', exch: 'FX', sec: 'Exotic' },

    /* ---- Commodities: TVC feeds confirmed free-streaming (the tape already
       runs TVC:GOLD and TVC:USOIL). Filed under futures, where they live ---- */
    { s: 'GOLD',   n: 'Gold',        m: 'futures', p: 3385.00, d: 2, v: 0.010, tv: 'TVC:GOLD',   exch: 'TVC', sec: 'Metal',  yh: 'GC=F' },
    { s: 'SILVER', n: 'Silver',      m: 'futures', p: 38.25,   d: 3, v: 0.016, tv: 'TVC:SILVER', exch: 'TVC', sec: 'Metal',  yh: 'SI=F' },
    { s: 'USOIL',  n: 'Crude Oil (WTI)', m: 'futures', p: 63.80, d: 2, v: 0.018, tv: 'TVC:USOIL', exch: 'TVC', sec: 'Energy', yh: 'CL=F' }
  ];

  /* Yahoo symbols for the founding assets, so the keyless /api proxy can
     price the things the browser alone never could: real micro futures,
     real index levels, real stocks. Crypto is deliberately absent — Binance
     owns those, straight from the browser. */
  var YH_MAP = {
    MES: 'MES=F', MNQ: 'MNQ=F', MYM: 'MYM=F', M2K: 'M2K=F',
    SPX: '^GSPC', NDX: '^NDX', DJI: '^DJI', RUT: '^RUT',
    FTSE: '^FTSE', DAX: '^GDAXI', CAC: '^FCHI', N225: '^N225',
    HSI: '^HSI', STOXX: '^STOXX50E', VIX: '^VIX'
  };

  /* ----------------------------------------------------------------------
     MODES — what each one means and where it lands you
     ---------------------------------------------------------------------- */
  M.MODES = {
    all:     { label: 'All markets', icon: 'fa-globe',          flagship: 'MES',
               blurb: 'Everything at once — the blended board.' },
    futures: { label: 'Futures',     icon: 'fa-bolt',           flagship: 'MES',
               blurb: 'The micros and the commodities.' },
    stocks:  { label: 'Stocks',      icon: 'fa-building-columns', flagship: 'AAPL',
               blurb: 'US equities, live via the keyless proxy.' },
    crypto:  { label: 'Crypto',      icon: 'fa-coins',          flagship: 'BTC',
               blurb: 'Live from Binance, streaming, no key.' },
    forex:   { label: 'Forex',       icon: 'fa-arrow-right-arrow-left', flagship: 'EURUSD',
               blurb: 'Majors, crosses and liquid exotics.' },
    indices: { label: 'Indices',     icon: 'fa-chart-line',     flagship: 'SPX',
               blurb: 'The world benchmarks.' }
  };

  /** Ticker-tape line-ups per mode — real TradingView feeds, mode-flavoured. */
  M.TAPE = {
    all: null,   // null = the founding MC.TAPE_SYMBOLS blend
    futures: [
      { proName: 'AMEX:SPY', title: 'S&P 500' }, { proName: 'NASDAQ:QQQ', title: 'NASDAQ 100' },
      { proName: 'TVC:DJI', title: 'Dow' }, { proName: 'TVC:RUT', title: 'Russell' },
      { proName: 'TVC:GOLD', title: 'Gold' }, { proName: 'TVC:SILVER', title: 'Silver' },
      { proName: 'TVC:USOIL', title: 'Crude Oil' }, { proName: 'TVC:VIX', title: 'VIX' }
    ],
    stocks: [
      { proName: 'NASDAQ:AAPL', title: 'Apple' }, { proName: 'NASDAQ:NVDA', title: 'NVIDIA' },
      { proName: 'NASDAQ:MSFT', title: 'Microsoft' }, { proName: 'NASDAQ:TSLA', title: 'Tesla' },
      { proName: 'NASDAQ:META', title: 'Meta' }, { proName: 'NASDAQ:AMZN', title: 'Amazon' },
      { proName: 'NASDAQ:GOOGL', title: 'Alphabet' }, { proName: 'NYSE:JPM', title: 'JPMorgan' },
      { proName: 'NASDAQ:COIN', title: 'Coinbase' }, { proName: 'NYSE:TSM', title: 'TSMC' }
    ],
    crypto: [
      { proName: 'BINANCE:BTCUSDT', title: 'Bitcoin' }, { proName: 'BINANCE:ETHUSDT', title: 'Ethereum' },
      { proName: 'BINANCE:SOLUSDT', title: 'Solana' }, { proName: 'BINANCE:BNBUSDT', title: 'BNB' },
      { proName: 'BINANCE:XRPUSDT', title: 'XRP' }, { proName: 'BINANCE:DOGEUSDT', title: 'Dogecoin' },
      { proName: 'BINANCE:ADAUSDT', title: 'Cardano' }, { proName: 'BINANCE:AVAXUSDT', title: 'Avalanche' },
      { proName: 'BINANCE:LINKUSDT', title: 'Chainlink' }, { proName: 'BINANCE:TONUSDT', title: 'Toncoin' }
    ],
    forex: [
      { proName: 'FX:EURUSD', title: 'EUR/USD' }, { proName: 'FX:GBPUSD', title: 'GBP/USD' },
      { proName: 'FX:USDJPY', title: 'USD/JPY' }, { proName: 'FX:AUDUSD', title: 'AUD/USD' },
      { proName: 'FX:USDCAD', title: 'USD/CAD' }, { proName: 'FX:USDCHF', title: 'USD/CHF' },
      { proName: 'FX:EURJPY', title: 'EUR/JPY' }, { proName: 'FX:GBPJPY', title: 'GBP/JPY' },
      { proName: 'TVC:DXY', title: 'Dollar Index' }, { proName: 'TVC:GOLD', title: 'Gold' }
    ],
    indices: [
      { proName: 'AMEX:SPY', title: 'S&P 500' }, { proName: 'NASDAQ:QQQ', title: 'NASDAQ 100' },
      { proName: 'TVC:DJI', title: 'Dow' }, { proName: 'TVC:UKX', title: 'FTSE 100' },
      { proName: 'TVC:DEU40', title: 'DAX' }, { proName: 'TVC:CAC40', title: 'CAC 40' },
      { proName: 'TVC:NI225', title: 'Nikkei' }, { proName: 'TVC:HSI', title: 'Hang Seng' },
      { proName: 'TVC:SX5E', title: 'Euro Stoxx' }, { proName: 'TVC:VIX', title: 'VIX' }
    ]
  };

  /* ----------------------------------------------------------------------
     BOOT — runs at parse time, before any module reads MC.ASSETS
     ---------------------------------------------------------------------- */
  function register(def) {
    if (MC.MAP[def.s]) return MC.MAP[def.s];
    def.base = def.p;
    def.chg = Math.random() * 4 - 1.6;
    MC.ASSETS.push(def);
    MC.MAP[def.s] = def;
    return def;
  }

  function readJson(key, fallback) {
    try {
      var v = JSON.parse(MC.store.get(key) || 'null');
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  EXTRA.forEach(register);

  // Yahoo symbols: founding assets from the map, stocks by their own ticker,
  // forex pairs as PAIR=X. Crypto stays off Yahoo — Binance is better.
  MC.ASSETS.forEach(function (a) {
    if (a.yh) return;
    if (YH_MAP[a.s]) a.yh = YH_MAP[a.s];
    else if (a.m === 'stocks') a.yh = a.s;
    else if (a.m === 'forex' && a.s.length === 6) a.yh = a.s + '=X';
  });

  // instruments the visitor added through search, restored from last visit
  readJson(CUSTOM_KEY, []).forEach(function (def) {
    if (def && def.s && !MC.MAP[def.s]) register(def);
  });

  // the remembered mode, restored before first render
  var savedMode = MC.store.get(MODE_KEY);
  if (savedMode && M.MODES[savedMode]) MC.State.market = savedMode;

  /* ----------------------------------------------------------------------
     DYNAMIC INSTRUMENTS — anything searched becomes a real one
     ---------------------------------------------------------------------- */

  /**
   * Register a symbol found through search so it charts, quotes and trades
   * like a built-in. `def` needs at least {s, n, m, tv}; price/decimals are
   * estimated until the live feed corrects them.
   */
  M.ensureAsset = function (def) {
    var existing = MC.MAP[def.s];
    if (existing) return existing;

    var a = register({
      s: def.s, n: def.n || def.s, m: def.m || 'stocks',
      p: isFinite(def.p) && def.p > 0 ? def.p : 100,
      d: isFinite(def.d) ? def.d : (def.m === 'forex' ? 5 : 2),
      v: def.m === 'crypto' ? 0.06 : def.m === 'forex' ? 0.006 : 0.025,
      tv: def.tv, exch: def.exch || '', sec: def.sec || '', yh: def.yh,
      custom: true
    });

    // remember it (cap the shelf so storage stays sane)
    var customs = readJson(CUSTOM_KEY, []).filter(function (c) { return c.s !== a.s; });
    customs.push({ s: a.s, n: a.n, m: a.m, p: a.p, d: a.d, v: a.v, tv: a.tv,
                   exch: a.exch, sec: a.sec, yh: a.yh, custom: true });
    MC.store.set(CUSTOM_KEY, JSON.stringify(customs.slice(-60)));

    if (MC.watchlist) MC.watchlist.render();
    if (MC.quotes && MC.quotes.refresh) MC.quotes.refresh();
    return a;
  };

  /* ----------------------------------------------------------------------
     TASTE — recents, favourites, view counts (powers personalisation)
     ---------------------------------------------------------------------- */
  M.noteView = function (sym) {
    var recents = readJson(RECENT_KEY, []).filter(function (s) { return s !== sym; });
    recents.unshift(sym);
    MC.store.set(RECENT_KEY, JSON.stringify(recents.slice(0, 12)));

    var seen = readJson(SEEN_KEY, {});
    seen[sym] = (seen[sym] || 0) + 1;
    MC.store.set(SEEN_KEY, JSON.stringify(seen));
  };

  M.recents = function () {
    return readJson(RECENT_KEY, []).filter(function (s) { return MC.MAP[s]; });
  };

  M.viewCounts = function () { return readJson(SEEN_KEY, {}); };

  M.favorites = function () {
    return readJson(FAV_KEY, []).filter(function (s) { return MC.MAP[s]; });
  };

  M.isFav = function (sym) { return readJson(FAV_KEY, []).indexOf(sym) !== -1; };

  M.toggleFav = function (sym) {
    var favs = readJson(FAV_KEY, []);
    var i = favs.indexOf(sym);
    if (i === -1) favs.unshift(sym); else favs.splice(i, 1);
    MC.store.set(FAV_KEY, JSON.stringify(favs.slice(0, 40)));
    return i === -1;
  };

  /** The symbols the visitor demonstrably cares about, best first. */
  M.personalPicks = function (mode, limit) {
    var seen = M.viewCounts();
    var favs = readJson(FAV_KEY, []);
    return MC.ASSETS
      .filter(function (a) { return (mode === 'all' || !mode) ? true : a.m === mode; })
      .map(function (a) {
        return { a: a, score: (seen[a.s] || 0) + (favs.indexOf(a.s) !== -1 ? 6 : 0) };
      })
      .filter(function (x) { return x.score > 0; })
      .sort(function (x, y) { return y.score - x.score; })
      .slice(0, limit || 6)
      .map(function (x) { return x.a; });
  };

  /* ----------------------------------------------------------------------
     THE MODE SWITCH — one call steers the whole terminal
     ---------------------------------------------------------------------- */
  var modeHooks = [];
  M.onMode = function (fn) { modeHooks.push(fn); };

  M.setMode = function (mode, opts) {
    if (!M.MODES[mode]) return;
    opts = opts || {};
    var was = MC.State.market;
    MC.State.market = mode;
    MC.store.set(MODE_KEY, mode);

    // both tab strips (navbar + phone drawer) stay in step
    MC.$$('.mtab').forEach(function (t) {
      t.classList.toggle('on', t.dataset.mkt === mode);
    });

    MC.watchlist.render();

    // land on a market that belongs to the mode — keep the current one when
    // it already fits, jump to the flagship when it does not
    var here = MC.State.asset;
    var fits = mode === 'all' || (here && here.m === mode);
    if (!fits && !opts.keepSymbol && MC.selectSymbol) {
      MC.selectSymbol(M.MODES[mode].flagship);
    }

    // the live panels that have a per-mode flavour
    if (MC.TV) {
      if (MC.TV.tapeForMode) MC.TV.tapeForMode(mode);
      if (MC.TV.remountModePanels) MC.TV.remountModePanels();
    }

    modeHooks.forEach(function (fn) {
      try { fn(mode, was); } catch (e) { /* one bad hook must not stop the rest */ }
    });
  };

  /** Called once from app boot, after the DOM exists. */
  M.initUI = function () {
    // reflect the restored mode in both tab strips without re-rendering
    MC.$$('.mtab').forEach(function (t) {
      t.classList.toggle('on', t.dataset.mkt === MC.State.market);
    });
  };

  /* ----------------------------------------------------------------------
     FUZZY MATCHING — shared by search and anything else that ranks symbols
     Subsequence match with sane scoring: exact symbol beats prefix beats
     word-start beats scattered letters. Returns 0 for no match.
     ---------------------------------------------------------------------- */
  M.fuzzyScore = function (query, symbol, name) {
    var q = query.toLowerCase();
    var s = symbol.toLowerCase();
    var n = (name || '').toLowerCase();

    if (!q) return 1;
    if (s === q) return 1000;
    if (s.indexOf(q) === 0) return 700 - s.length;
    if (n.indexOf(q) === 0) return 500;
    if (s.indexOf(q) !== -1) return 350;

    var wordStart = n.split(/[\s/·-]+/).some(function (w) { return w.indexOf(q) === 0; });
    if (wordStart) return 300;
    if (n.indexOf(q) !== -1) return 200;

    // scattered subsequence over the symbol ("mes" → M2K? no; "btc" → BTC yes)
    var i = 0;
    for (var c = 0; c < s.length && i < q.length; c++) {
      if (s[c] === q[i]) i++;
    }
    if (i === q.length) return 90 - s.length;

    // and over the name ("micro sp" → Micro E-mini S&P 500)
    i = 0;
    for (c = 0; c < n.length && i < q.length; c++) {
      if (n[c] === q[i]) i++;
    }
    return i === q.length ? 40 : 0;
  };

})(window);
