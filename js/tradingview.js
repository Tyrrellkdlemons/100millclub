/* ==========================================================================
   tradingview.js — real TradingView widget embeds (live market data)

   These are the official TradingView embeddable widgets. Unlike the rest of
   the dashboard (which runs on generated mock data so it works offline),
   these panels stream genuine live prices, news and screener results.

   Widgets used:
     · Ticker Tape        — live strip across the top of the page
     · Advanced Chart     — the full TradingView charting engine
     · Symbol Info        — profile + key stats for the selected market
     · Technical Analysis — live buy/sell gauge
     · Timeline           — real market news for the selected market
     · Screener           — scan the whole market
     · Heatmap            — S&P 500 by sector, sized by market cap
     · Economic Calendar  — upcoming macro events
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var TV = MC.TV = {};

  var BASE = 'https://s3.tradingview.com/external-embedding/';
  var SCRIPTS = {
    tickerTape: BASE + 'embed-widget-ticker-tape.js',
    advancedChart: BASE + 'embed-widget-advanced-chart.js',
    symbolInfo: BASE + 'embed-widget-symbol-info.js',
    technical: BASE + 'embed-widget-technical-analysis.js',
    timeline: BASE + 'embed-widget-timeline.js',
    screener: BASE + 'embed-widget-screener.js',
    heatmap: BASE + 'embed-widget-stock-heatmap.js',
    events: BASE + 'embed-widget-events.js'
  };

  /* Shared look so every widget matches the dashboard. */
  var DARK = {
    colorTheme: 'dark',
    locale: 'en',
    isTransparent: true
  };

  /** Which panels have been built, so we only rebuild what actually changed. */
  var mounted = {};

  /**
   * Mount a TradingView widget into `host`.
   * The embed API works by appending a <script> whose text body is the JSON
   * config — so the container is rebuilt from scratch on every change.
   */
  function mount(hostId, scriptSrc, config, options) {
    var host = MC.$(hostId);
    if (!host) return;
    options = options || {};

    host.innerHTML = '';

    // spinner shown until the widget's iframe appears
    var loader = document.createElement('div');
    loader.className = 'tv-loading';
    loader.innerHTML =
      '<i class="fa-solid fa-circle-notch"></i>' +
      '<span>' + (options.loadingText || 'Loading live market data…') + '</span>';
    host.appendChild(loader);

    var container = document.createElement('div');
    container.className = 'tradingview-widget-container';

    var widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    container.appendChild(widget);

    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = scriptSrc;
    script.async = true;
    script.text = JSON.stringify(config);
    container.appendChild(script);

    host.appendChild(container);

    // If no iframe has rendered after a few seconds we are offline, blocked,
    // or running from file:// — say so instead of spinning forever.
    clearTimeout(host._tvTimer);
    host._tvTimer = setTimeout(function () {
      if (host.querySelector('iframe')) {
        loader.classList.add('hidden');
        return;
      }
      loader.innerHTML =
        '<i class="fa-solid fa-cloud-arrow-down" style="animation:none;color:var(--dim)"></i>' +
        '<span style="text-align:center;max-width:280px;line-height:1.5">' +
          'Live TradingView data is unavailable right now.<br>' +
          '<span style="color:var(--dim);font-size:11px">Check your connection — or use the ' +
          '<b style="color:var(--accent)">Simulated</b> chart mode, which works fully offline.</span>' +
        '</span>';
      if (options.onFail) options.onFail();
    }, 6000);

    // Hide the spinner as soon as the iframe lands.
    var observer = new MutationObserver(function () {
      if (host.querySelector('iframe')) {
        loader.classList.add('hidden');
        observer.disconnect();
      }
    });
    observer.observe(host, { childList: true, subtree: true });

    mounted[hostId] = true;
  }

  /* ----------------------------------------------------------------------
     PUBLIC API — one function per panel
     ---------------------------------------------------------------------- */

  /** Live scrolling ticker across the very top of the page. */
  TV.tickerTape = function (onFail) {
    mount('tvTicker', SCRIPTS.tickerTape, Object.assign({
      symbols: MC.TAPE_SYMBOLS,
      showSymbolLogo: true,
      displayMode: 'adaptive'
    }, DARK), { loadingText: 'Connecting to the live tape…', onFail: onFail });
  };

  /** The main TradingView chart — full charting engine with its own toolbars. */
  TV.advancedChart = function () {
    var asset = MC.State.asset;
    mount('tvChart', SCRIPTS.advancedChart, {
      autosize: true,
      symbol: asset.tv,
      interval: MC.TV_INTERVAL[MC.State.tf],
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(14,18,22,1)',
      gridColor: 'rgba(29,37,48,0.6)',
      hide_side_toolbar: false,
      allow_symbol_change: true,
      withdateranges: true,
      save_image: true,
      details: false,
      calendar: false,
      support_host: 'https://www.tradingview.com'
    }, { loadingText: 'Loading the live ' + asset.s + ' chart…' });
  };

  /** Company / instrument profile with key statistics. */
  TV.symbolInfo = function () {
    mount('tvSymbolInfo', SCRIPTS.symbolInfo, Object.assign({
      symbol: MC.State.asset.tv,
      width: '100%'
    }, DARK), { loadingText: 'Loading profile…' });
  };

  /** Live technical rating gauge (strong sell → strong buy). */
  TV.technical = function () {
    var tvInterval = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1D', '1w': '1W' };
    mount('tvTechnical', SCRIPTS.technical, Object.assign({
      symbol: MC.State.asset.tv,
      interval: tvInterval[MC.State.tf] || '1h',
      width: '100%',
      height: '100%',
      showIntervalTabs: true,
      displayMode: 'single'
    }, DARK), { loadingText: 'Reading the tape…' });
  };

  /** Real market news for the selected instrument. */
  TV.news = function () {
    mount('tvNews', SCRIPTS.timeline, Object.assign({
      feedMode: 'symbol',
      symbol: MC.State.asset.tv,
      displayMode: 'regular',
      width: '100%',
      height: '100%'
    }, DARK), { loadingText: 'Fetching the latest headlines…' });
  };

  /** Full market screener. */
  TV.screener = function () {
    var market = MC.State.asset.m === 'crypto' ? 'crypto' : 'america';
    mount('tvScreener', SCRIPTS.screener, Object.assign({
      width: '100%',
      height: '100%',
      market: market,
      defaultColumn: 'overview',
      defaultScreen: 'most_capitalized',
      showToolbar: true
    }, DARK), { loadingText: 'Scanning the market…' });
  };

  /** S&P 500 heatmap, grouped by sector and sized by market cap. */
  TV.heatmap = function () {
    mount('tvHeatmap', SCRIPTS.heatmap, Object.assign({
      dataSource: 'SPX500',
      exchanges: [],
      grouping: 'sector',
      blockSize: 'market_cap_basic',
      blockColor: 'change',
      symbolUrl: '',
      hasTopBar: false,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      width: '100%',
      height: '100%'
    }, DARK), { loadingText: 'Painting the heatmap…' });
  };

  /** Upcoming economic events that move markets. */
  TV.calendar = function () {
    mount('tvCalendar', SCRIPTS.events, Object.assign({
      width: '100%',
      height: '100%',
      importanceFilter: '0,1',
      countryFilter: 'us,eu,gb,jp,de,cn'
    }, DARK), { loadingText: 'Loading the economic calendar…' });
  };

  /* ----------------------------------------------------------------------
     "OPEN IN TRADINGVIEW" — using the visitor's own account

     Worth being precise about how this works, because it is a hard platform
     limit rather than a choice:

     The embedded widgets above always render anonymously. They live in a
     sandboxed third-party iframe, so they cannot read a tradingview.com
     session and there is no supported way to make them inherit a visitor's
     plan. That is why exchange-entitled tickers (SP:SPX, DJ:DJI …) refuse to
     load in the embed no matter who is looking at them.

     What *does* respect the visitor's subscription is tradingview.com itself.
     So these helpers deep-link to the exact symbol and timeframe currently on
     screen. If the visitor is already signed in, the page opens with their own
     plan: real-time entitled data, their saved layouts, indicators and alerts.
     If they are not signed in, they get the normal free view.
     ---------------------------------------------------------------------- */

  var TV_BASE = 'https://www.tradingview.com';

  /** NASDAQ:AAPL → NASDAQ-AAPL, the shape tradingview.com uses in its paths. */
  function symbolPath(ticker) {
    return ticker.replace(':', '-');
  }

  /**
   * Prefer the exchange-entitled ticker when we have one — a subscriber
   * should land on the real feed, not the delayed index proxy.
   */
  TV.bestTicker = function (asset) {
    var a = asset || MC.State.asset;
    return a.tvPro || a.tv;
  };

  /** Build a tradingview.com URL for the current market. */
  TV.deepLink = function (kind) {
    var asset = MC.State.asset;
    var ticker = TV.bestTicker(asset);
    var path = symbolPath(ticker);

    switch (kind) {
      case 'chart':
        return TV_BASE + '/chart/?symbol=' + encodeURIComponent(ticker) +
               '&interval=' + encodeURIComponent(MC.TV_INTERVAL[MC.State.tf]);
      case 'technicals':
        return TV_BASE + '/symbols/' + path + '/technicals/';
      case 'news':
        return TV_BASE + '/symbols/' + path + '/news/';
      case 'screener':
        return TV_BASE + (asset.m === 'crypto' ? '/crypto-screener/' : '/screener/');
      case 'heatmap':
        return TV_BASE + '/heatmap/stock/';
      case 'calendar':
        return TV_BASE + '/economic-calendar/';
      default:
        return TV_BASE + '/symbols/' + path + '/';
    }
  };

  /** Open it in a new tab, carrying the visitor's own TradingView session. */
  TV.openInTradingView = function (kind) {
    var url = TV.deepLink(kind || 'chart');
    var win = window.open(url, '_blank', 'noopener,noreferrer');

    if (!win) {
      MC.ui.toast('Popup blocked', 'Allow popups for this site to open TradingView.', 'err');
      return;
    }
    MC.ui.toast(
      'Opening in TradingView',
      'Signed in there? You will see it on your own plan — real-time data, your layouts and indicators.',
      'gold'
    );
  };

  /* ----------------------------------------------------------------------
     REFRESH HOOKS
     ---------------------------------------------------------------------- */

  /**
   * Rebuild everything that depends on the selected symbol.
   * Debounced because clicking down a watchlist quickly would otherwise
   * spawn a widget per keystroke.
   */
  TV.refreshSymbol = MC.debounce(function () {
    if (MC.State.source === 'live') TV.advancedChart();
    if (mounted.tvSymbolInfo) TV.symbolInfo();
    if (mounted.tvTechnical) TV.technical();
    if (mounted.tvNews) TV.news();
  }, 320);

  /** Rebuild only what cares about the timeframe. */
  TV.refreshInterval = MC.debounce(function () {
    if (MC.State.source === 'live') TV.advancedChart();
    if (mounted.tvTechnical) TV.technical();
  }, 320);

  /** Build a dock panel the first time it is opened (lazy — saves bandwidth). */
  TV.ensurePanel = function (name) {
    var builders = {
      technicals: function () {
        if (!mounted.tvSymbolInfo) TV.symbolInfo();
        if (!mounted.tvTechnical) TV.technical();
      },
      news: function () { if (!mounted.tvNews) TV.news(); },
      screener: function () { if (!mounted.tvScreener) TV.screener(); },
      heatmap: function () { if (!mounted.tvHeatmap) TV.heatmap(); },
      calendar: function () { if (!mounted.tvCalendar) TV.calendar(); }
    };
    if (builders[name]) builders[name]();
  };

})(window);
