/* ==========================================================================
   tour.js — the guided walkthrough and the persistent hint badges

   Runs automatically the first time someone opens the dashboard, and can be
   replayed any time from the help menu. Each step spotlights one region and
   explains it in plain English.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Tour = MC.tour = {};

  /* ----------------------------------------------------------------------
     STEPS
     target : CSS selector to spotlight (null = centred, no spotlight)
     before : optional function run before the step, to set the scene
     ---------------------------------------------------------------------- */
  var STEPS = [
    {
      target: null,
      title: 'Right. You must be Queez.',
      body: 'Everyone who walks in here is Queez, and I am the <b>Coach</b> — the one stuck teaching you. ' +
            'This is a full trading terminal and none of it risks real money, so mash every button you like ' +
            'and the worst that happens is I judge you. Sixty seconds, bozo. Try to keep up.'
    },
    {
      target: '#leftPanel',
      title: 'Your shopping list',
      body: 'Everything you can look at lives here. <b>Click a row</b> to load it. You can also ' +
            '<b>drag rows around</b> to put your favourites at the top, which it remembers, because it is ' +
            'more organised than you are, Queez.'
    },
    {
      target: '#mtabs',
      title: 'The mode switch. The big one.',
      body: 'These do not just filter the list any more — they steer the <b>whole terminal</b>. Pick ' +
            '<b>Crypto</b> and the watchlist, chart, ticker tape, screener, heatmap and signals desk all go ' +
            'crypto. Same for Forex, Stocks, the lot. <b>All markets</b> is everything at once, for the greedy.'
    },
    {
      target: '.search',
      title: 'Search that actually finds things',
      body: 'Click it, or press <b>/</b>. Fuzzy search over the whole board — <b>NVDA</b>, <b>nikkei</b>, ' +
            '<b>shiba</b>, whatever — plus a live hunt across thousands of stocks, coins, pairs and futures ' +
            'beyond it. Pick one of those and it <b>joins your universe permanently</b>. Type <b>?</b> in there ' +
            'and it explains its own syntax, which is more than most people do.'
    },
    {
      target: '#srcSwitch',
      title: 'The important one, so pay attention',
      body: '<b>Live</b> is the real TradingView chart with real market data. <b>Simulated</b> is my engine — ' +
            'it drives the indicators, drawings and backtests on this site, and it works when your internet ' +
            'does not. Two different things. Do not email me about it later.'
    },
    {
      target: '#tfGroup',
      title: 'Time, but adjustable',
      body: 'Each button sets how much time one candle covers. <b>1m</b> for staring at nothing happening, ' +
            '<b>1d</b> or <b>1w</b> for actually seeing the trend. Most people pick 1m and then wonder why they are stressed.'
    },
    {
      target: '.tool-group',
      title: 'The toys',
      body: '<b>Indicators</b> — thirty-five of them, and you can build your own. <b>Drawing tools</b> for lines ' +
            'you will draw confidently and be wrong about. Then fullscreen and settings. Hover anything and I ' +
            'explain it properly.'
    },
    {
      target: '#rightPanel',
      title: 'Where you pretend to trade',
      body: 'Pick <b>BUY</b> or <b>SELL</b>, say how many, and — this bit matters — set a <b>stop loss</b>. ' +
            'That is your safety exit. Skipping it is how people learn expensive lessons. You can also drag a ' +
            'watchlist row straight onto this panel, if clicking twice is beneath you.'
    },
    {
      target: '.rtabs',
      title: 'Four tabs, all useful',
      body: '<b>Trade</b> you have met. <b>Test</b> replays a strategy over real history and tells you the truth. ' +
            '<b>Alerts</b> shouts when something happens, and can forward it to Telegram or Discord. ' +
            '<b>Folio</b> tracks what you actually own and whether you are up or down.'
    },
    {
      target: '#dock',
      title: 'The bottom shelf',
      body: '<b>Vlogs</b> for the videos. <b>Technicals</b>, <b>News</b>, <b>Screener</b>, <b>Heatmap</b> and ' +
            '<b>Calendar</b> are live TradingView panels — and they follow the market mode now. <b>Radar</b> is ' +
            'mine — dated economic events you can set alerts on, and headlines that can shout at you by keyword.'
    },
    {
      target: '[data-dock="signals"]',
      title: 'The signals desk, since you will ask',
      body: 'Four desks — <b>TrendCatcher</b>, <b>momentum</b>, <b>mean reversion</b>, <b>volume</b> — read real ' +
            'price history and vote. Every card shows its confidence, its data source, and one tap opens the ' +
            '<b>actual reasoning</b>, desk by desk, in plain English. The markets you watch most float to the top. ' +
            'It teaches a method, Queez — it does not know the future, and anyone who says otherwise is selling something.'
    },
    {
      target: '.brand',
      title: 'Make it yours',
      body: 'Click the crest to upload your own logo. Or drag an image anywhere onto the page and drop it. ' +
            'Anywhere. Go on, I know you want to test that.'
    },
    {
      target: '#qzFab',
      title: 'And when it all goes wrong, Queez',
      body: 'That button is me, the Coach. Press it and ask me anything about this place — alerts, portfolio, ' +
            'why it cannot log you into TradingView, whatever. I answer properly, I just complain while doing it. ' +
            'And if you start slapping that buy button like you are Machine Gun Kelly on a drum solo, I will hear about it. ' +
            '<br><br>Do you get it now, bozo? Good. Go make some money, Queez.'
    }
  ];

  var index = 0;
  var running = false;
  var els = {};

  /* ----------------------------------------------------------------------
     DOM
     ---------------------------------------------------------------------- */
  function build() {
    if (els.card) return;

    els.veil = document.createElement('div');
    els.veil.className = 'tour-veil';

    els.spot = document.createElement('div');
    els.spot.className = 'tour-spot';

    els.card = document.createElement('div');
    els.card.className = 'tour-card';
    els.card.innerHTML =
      '<div class="tour-step"></div>' +
      '<h4></h4>' +
      '<p></p>' +
      '<div class="tour-actions">' +
        '<div class="tour-dots"></div>' +
        '<button class="tour-btn" data-tour="back">Back</button>' +
        '<button class="tour-btn primary" data-tour="next">Next</button>' +
      '</div>';

    els.skip = document.createElement('button');
    els.skip.className = 'tour-skip';
    els.skip.innerHTML = '<i class="fa-solid fa-xmark"></i> Skip tour';

    document.body.appendChild(els.veil);
    document.body.appendChild(els.spot);
    document.body.appendChild(els.card);
    document.body.appendChild(els.skip);

    els.card.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tour]');
      if (!btn) return;
      if (btn.dataset.tour === 'next') Tour.next();
      else Tour.back();
    });
    els.skip.addEventListener('click', Tour.stop);

    // clicking the dimmed area advances, like most walkthroughs
    els.veil.addEventListener('click', Tour.next);
  }

  /* ----------------------------------------------------------------------
     RENDER ONE STEP
     ---------------------------------------------------------------------- */
  function show() {
    var step = STEPS[index];
    if (step.before) { try { step.before(); } catch (e) {} }

    els.card.querySelector('.tour-step').textContent = 'Step ' + (index + 1) + ' of ' + STEPS.length;
    els.card.querySelector('h4').textContent = step.title;
    els.card.querySelector('p').innerHTML = step.body;

    els.card.querySelector('.tour-dots').innerHTML = STEPS.map(function (_, i) {
      return '<span class="tour-dot' + (i === index ? ' on' : '') + '"></span>';
    }).join('');

    els.card.querySelector('[data-tour="back"]').style.visibility = index === 0 ? 'hidden' : 'visible';
    els.card.querySelector('[data-tour="next"]').textContent =
      index === STEPS.length - 1 ? 'Start trading' : 'Next';

    position(step);
  }

  /** Place the spotlight over the target and the card beside it. */
  function position(step) {
    var target = step.target ? document.querySelector(step.target) : null;
    var box = target ? target.getBoundingClientRect() : null;

    // No target, or the target is hidden (e.g. a drawer on mobile) → centre it.
    if (!box || box.width === 0 || box.height === 0) {
      // Keep the box painted: a 0×0 element still casts its 9999px shadow,
      // which is what dims the page. Setting opacity to 0 would kill that too.
      els.spot.style.opacity = '1';
      els.spot.style.width = '0';
      els.spot.style.height = '0';
      els.spot.style.left = '50%';
      els.spot.style.top = '50%';
      els.spot.style.boxShadow = '0 0 0 9999px rgba(4,6,8,.78)';

      els.card.style.left = 'calc(50% - min(165px, 50vw - 14px))';
      els.card.style.top = 'calc(50% - 110px)';
      els.card.style.right = 'auto';
      return;
    }

    var pad = 7;
    els.spot.style.opacity = '1';
    els.spot.style.boxShadow = '0 0 0 9999px rgba(4,6,8,.78), 0 0 0 2px var(--accent) inset';
    els.spot.style.left = (box.left - pad) + 'px';
    els.spot.style.top = (box.top - pad) + 'px';
    els.spot.style.width = (box.width + pad * 2) + 'px';
    els.spot.style.height = (box.height + pad * 2) + 'px';

    // Card goes to whichever side has the most room.
    var cardW = Math.min(330, window.innerWidth - 28);
    var cardH = els.card.offsetHeight || 210;
    var gap = 16;
    var left, top;

    var roomRight = window.innerWidth - box.right;
    var roomLeft = box.left;
    var roomBelow = window.innerHeight - box.bottom;

    if (roomRight >= cardW + gap) {
      left = box.right + gap;
      top = box.top;
    } else if (roomLeft >= cardW + gap) {
      left = box.left - cardW - gap;
      top = box.top;
    } else if (roomBelow >= cardH + gap) {
      left = box.left + box.width / 2 - cardW / 2;
      top = box.bottom + gap;
    } else {
      left = box.left + box.width / 2 - cardW / 2;
      top = box.top - cardH - gap;
    }

    els.card.style.left = MC.clamp(left, 14, window.innerWidth - cardW - 14) + 'px';
    els.card.style.top = MC.clamp(top, 14, window.innerHeight - cardH - 14) + 'px';
    els.card.style.right = 'auto';
  }

  /* ----------------------------------------------------------------------
     PUBLIC API
     ---------------------------------------------------------------------- */
  Tour.start = function (fromStep) {
    build();
    index = fromStep || 0;
    running = true;
    els.veil.classList.add('on');
    els.spot.style.display = 'block';
    els.card.style.display = 'block';
    els.skip.style.display = 'block';
    show();
  };

  Tour.next = function () {
    if (!running) return;
    if (index >= STEPS.length - 1) { Tour.stop(true); return; }
    index++;
    show();
  };

  Tour.back = function () {
    if (!running || index === 0) return;
    index--;
    show();
  };

  Tour.stop = function (completed) {
    if (!running) return;
    running = false;
    els.veil.classList.remove('on');
    els.spot.style.display = 'none';
    els.card.style.display = 'none';
    els.skip.style.display = 'none';
    MC.store.set('mc_tour_done', '1');

    if (completed === true) {
      MC.ui.toast('Right, off you go 🎩',
        'Hover anything for an explanation, or poke Queez when it goes sideways.', 'gold');
    }
  };

  Tour.isRunning = function () { return running; };

  /** Show the tour once per device, shortly after load. */
  Tour.maybeAutoStart = function () {
    if (MC.store.get('mc_tour_done')) return false;
    setTimeout(function () { Tour.start(); }, 1200);
    return true;
  };

  /* ----------------------------------------------------------------------
     HINT BADGES
     Little numbered markers pinned to each region, explained on hover.
     ---------------------------------------------------------------------- */
  var HINTS = [
    { at: '#leftPanel', pos: 'tr', tip: 'Your markets',
      desc: 'Click a row to load it. Drag rows to reorder them.' },
    { at: '#srcSwitch', pos: 'tr', tip: 'Real data or practice data',
      desc: 'Live is a real TradingView chart. Simulated is the built-in engine that runs offline.' },
    { at: '#tfGroup', pos: 'tr', tip: 'Candle size',
      desc: 'How much time each bar on the chart covers.' },
    { at: '.tool-group', pos: 'tl', tip: 'Chart tools',
      desc: 'Indicators, drawing tools, fullscreen and settings.' },
    { at: '.side-toggle', pos: 'tr', tip: 'Which way you are betting',
      desc: 'BUY profits if the price rises. SELL profits if it falls.' },
    { at: '#dock', pos: 'tr', tip: 'Videos and live market panels',
      desc: 'Vlogs, technical ratings, news, screener, heatmap and the economic calendar.' }
  ];

  Tour.buildHints = function () {
    HINTS.forEach(function (h, i) {
      var host = document.querySelector(h.at);
      if (!host) return;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

      var badge = document.createElement('span');
      badge.className = 'hint';
      badge.textContent = String(i + 1);
      badge.setAttribute('data-tip', h.tip);
      badge.setAttribute('data-tip-desc', h.desc);

      var offset = '-8px';
      if (h.pos === 'tr') { badge.style.right = offset; badge.style.top = offset; }
      else { badge.style.left = offset; badge.style.top = offset; }

      host.appendChild(badge);
    });
  };

  Tour.toggleHints = function () {
    var on = !document.body.classList.contains('hints-on');
    document.body.classList.toggle('hints-on', on);
    MC.ui.toast(
      on ? 'Hints on' : 'Hints off',
      on ? 'Hover any blue marker to see what that area does.' : 'The markers are hidden again.',
      'info'
    );
    return on;
  };

  // keep everything glued to its target when the window changes size
  window.addEventListener('resize', function () {
    if (running) position(STEPS[index]);
  });

})(window);
