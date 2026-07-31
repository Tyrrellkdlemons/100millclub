/* ==========================================================================
   news.js — the headline feed and keyword alerts

   Honest note on sources. There is no good market-news API that is free,
   key-free and browser-callable: every serious provider needs a key, and
   most block cross-origin requests outright. I checked several before
   settling on this arrangement:

     Hacker News   works with no key and returns proper CORS headers, so it
                   is the default. Tech-heavy, but real and always available.
     Finnhub       proper market news wire. Free tier, but you bring a key.
     Marketaux     same deal — free tier, your own key.
     Custom        any JSON endpoint you like, with a field mapping.

   Browsing-quality market news is already in the dock via the TradingView
   news widget; this module exists so that *alerts* have machine-readable
   headlines to match keywords against.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var News = MC.news = {};

  var CFG_KEY = 'mc_news_cfg';
  var SEEN_KEY = 'mc_news_seen';

  var items = [];
  var loading = false;
  var lastError = null;

  News.SOURCES = [
    { id: 'hn',        name: 'Hacker News',  needsKey: false,
      note: 'Free and always available. Tech and business stories.' },
    { id: 'finnhub',   name: 'Finnhub',      needsKey: true,
      note: 'A real market news wire. Free tier — get a key at finnhub.io.' },
    { id: 'marketaux', name: 'Marketaux',    needsKey: true,
      note: 'Market news with symbol tagging. Free tier at marketaux.com.' },
    { id: 'custom',    name: 'My own feed',  needsKey: false,
      note: 'Any JSON endpoint that allows browser requests.' }
  ];

  /* ----------------------------------------------------------------------
     CONFIG
     ---------------------------------------------------------------------- */
  News.config = function () {
    try {
      var v = JSON.parse(MC.store.get(CFG_KEY) || 'null');
      return v || { source: 'hn', apiKey: '', customUrl: '', keywords: '', refreshMins: 10 };
    } catch (e) {
      return { source: 'hn', apiKey: '', customUrl: '', keywords: '', refreshMins: 10 };
    }
  };

  News.saveConfig = function (cfg) { MC.store.set(CFG_KEY, JSON.stringify(cfg)); };

  News.items = function () { return items; };
  News.isLoading = function () { return loading; };
  News.error = function () { return lastError; };

  /* ----------------------------------------------------------------------
     FETCH
     ---------------------------------------------------------------------- */
  News.refresh = function () {
    var cfg = News.config();
    loading = true;
    lastError = null;
    if (News.onUpdate) News.onUpdate();

    return fetchFrom(cfg)
      .then(function (list) {
        items = list;
        loading = false;
        checkKeywords(list, cfg);
        if (News.onUpdate) News.onUpdate();
        return list;
      })
      .catch(function (err) {
        loading = false;
        lastError = err.message;
        if (News.onUpdate) News.onUpdate();
        return [];
      });
  };

  function fetchFrom(cfg) {
    if (cfg.source === 'finnhub') {
      if (!cfg.apiKey) return Promise.reject(new Error('Add your Finnhub API key first.'));
      return json('https://finnhub.io/api/v1/news?category=general&token=' + encodeURIComponent(cfg.apiKey))
        .then(function (d) {
          if (!Array.isArray(d)) throw new Error('Finnhub did not return a list — check the key.');
          return d.slice(0, 40).map(function (n) {
            return { title: n.headline, url: n.url, source: n.source || 'Finnhub', at: (n.datetime || 0) * 1000 };
          });
        });
    }

    if (cfg.source === 'marketaux') {
      if (!cfg.apiKey) return Promise.reject(new Error('Add your Marketaux API key first.'));
      return json('https://api.marketaux.com/v1/news/all?language=en&limit=40&api_token=' + encodeURIComponent(cfg.apiKey))
        .then(function (d) {
          var arr = (d && d.data) || [];
          return arr.map(function (n) {
            return { title: n.title, url: n.url, source: n.source || 'Marketaux', at: Date.parse(n.published_at) || Date.now() };
          });
        });
    }

    if (cfg.source === 'custom') {
      if (!cfg.customUrl) return Promise.reject(new Error('Paste a feed URL first.'));
      return json(cfg.customUrl).then(normaliseUnknown);
    }

    // Default — Hacker News, no key required.
    // Algolia has no boolean OR: every word in `query` is required. A long
    // "a OR b OR c" string therefore matches nothing, which is exactly what
    // it did. Two well-chosen words score far better than a keyword pile —
    // "stock market" returns thousands of genuinely market-related stories,
    // newest first, where the optionalWords variants drifted off-topic.
    return json('https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=40&query=' +
                encodeURIComponent('stock market'))
      .then(function (d) {
        return ((d && d.hits) || []).map(function (h) {
          return {
            title: h.title || h.story_title,
            url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
            source: 'Hacker News',
            at: (h.created_at_i || 0) * 1000
          };
        }).filter(function (x) { return x.title; });
      });
  }

  function json(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('The feed returned ' + r.status + '.');
      return r.json();
    }).catch(function (e) {
      if (e instanceof TypeError) {
        throw new Error('The browser blocked that request — the feed may not allow cross-origin calls.');
      }
      throw e;
    });
  }

  /** Make a best-effort guess at the shape of an unknown JSON feed. */
  function normaliseUnknown(d) {
    var arr = Array.isArray(d) ? d
      : (d.articles || d.data || d.items || d.results || d.hits || []);
    if (!Array.isArray(arr)) throw new Error('I could not find a list of articles in that response.');

    return arr.slice(0, 40).map(function (n) {
      return {
        title: n.title || n.headline || n.name || '(untitled)',
        url: n.url || n.link || n.web_url || '#',
        source: (n.source && (n.source.name || n.source)) || 'Feed',
        at: Date.parse(n.publishedAt || n.published_at || n.datetime || n.date || '') || Date.now()
      };
    });
  }

  /* ----------------------------------------------------------------------
     KEYWORD ALERTS
     ---------------------------------------------------------------------- */
  function readSeen() {
    try {
      var v = JSON.parse(MC.store.get(SEEN_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function checkKeywords(list, cfg) {
    var words = (cfg.keywords || '')
      .split(',')
      .map(function (w) { return w.trim().toLowerCase(); })
      .filter(Boolean);
    if (!words.length) return;

    var seen = readSeen();
    var hits = [];

    list.forEach(function (item) {
      var key = (item.url || item.title).slice(0, 160);
      if (seen.indexOf(key) !== -1) return;

      var lower = (item.title || '').toLowerCase();
      var matched = words.filter(function (w) { return lower.indexOf(w) !== -1; });
      if (!matched.length) return;

      seen.push(key);
      hits.push({ item: item, words: matched });
    });

    MC.store.set(SEEN_KEY, JSON.stringify(seen.slice(-400)));

    hits.slice(0, 3).forEach(function (hit) {
      var text = '“' + hit.item.title + '” — matched ' + hit.words.join(', ') + ' · ' + hit.item.source;
      MC.ui.toast('News match 📰', text, 'gold');
      MC.alerts.notifyExternal('News match', text);
    });
  }

  /**
   * Mark everything currently loaded as already seen.
   * Called once on the first successful load so turning keywords on does not
   * immediately fire for the whole backlog.
   */
  News.primeSeen = function () {
    var seen = readSeen();
    items.forEach(function (i) {
      var key = (i.url || i.title).slice(0, 160);
      if (seen.indexOf(key) === -1) seen.push(key);
    });
    MC.store.set(SEEN_KEY, JSON.stringify(seen.slice(-400)));
  };

  /* ----------------------------------------------------------------------
     AUTO REFRESH
     ---------------------------------------------------------------------- */
  var timer = null;

  News.startAuto = function () {
    clearInterval(timer);
    var mins = Math.max(2, News.config().refreshMins || 10);
    timer = setInterval(News.refresh, mins * 60000);
  };

  News.stopAuto = function () { clearInterval(timer); };

})(window);
