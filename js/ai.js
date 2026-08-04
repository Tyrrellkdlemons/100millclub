/* ==========================================================================
   ai.js — the AI desk, via the visitor's own OpenRouter key

   Ask the Coach anything starting with "ai" ("ai what do you make of this
   chart?") and, if a key is saved, the question goes to OpenRouter with the
   current chart context attached. The key lives in THIS browser's storage
   and is sent to exactly one place: openrouter.ai. Never through this site's
   servers — it has none. Usage bills to the visitor's own OpenRouter
   account; free-tier models exist and are the default suggestion.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var AI = MC.ai = {};

  var CFG_KEY = 'mc_ai_cfg';
  var DEFAULT_MODEL = 'deepseek/deepseek-chat-v3.1:free';

  AI.config = function () {
    try {
      var c = JSON.parse(MC.store.get(CFG_KEY) || 'null');
      return c && typeof c === 'object' ? c : {};
    } catch (e) { return {}; }
  };

  AI.saveConfig = function (cfg) {
    MC.store.set(CFG_KEY, JSON.stringify({
      key: (cfg.key || '').trim(),
      model: (cfg.model || '').trim() || DEFAULT_MODEL
    }));
  };

  AI.enabled = function () { return !!AI.config().key; };
  AI.defaultModel = DEFAULT_MODEL;

  /** What the model gets to see: the same numbers the visitor sees. */
  function context() {
    var s = MC.State;
    var a = s.asset;
    var acct = MC.trade.account();
    var positions = (s.positions || []).map(function (p) {
      var m = MC.MAP[p.sym];
      var pl = m ? (m.p - p.entry) * p.qty * (p.side === 'buy' ? 1 : -1) : 0;
      return p.side.toUpperCase() + ' ' + p.qty + ' ' + p.sym + ' from ' + p.entry +
             ' (open P/L ' + pl.toFixed(2) + ')';
    });

    var read = '';
    try { read = MC.read.plain(); } catch (e) { /* chart read unavailable */ }

    return [
      'Current market: ' + s.symbol + ' (' + a.n + '), price ' + a.p + ', day change ' + (a.chg || 0).toFixed(2) + '%.',
      'Timeframe on screen: ' + s.tf + '. Chart style: ' + (s.chartStyle || 'candles') + '.',
      'Demo account: equity ' + acct.equity.toFixed(2) + ', started at ' + acct.start +
        ', realized P/L ' + acct.realized.toFixed(2) + '.',
      positions.length ? 'Open demo positions: ' + positions.join('; ') + '.' : 'No open demo positions.',
      read ? 'The terminal’s own chart read:\n' + read : ''
    ].filter(Boolean).join('\n');
  }

  var SYSTEM =
    'You are the AI desk inside 100MillClub, an educational paper-trading terminal. The user is a ' +
    'learning trader. Answer their question using the context provided. Rules: be concise (under 250 ' +
    'words), structure with short headed sections or bullets, teach the reasoning rather than giving ' +
    'orders, never present guesses as certainties, never invent probabilities or price targets you did ' +
    'not derive, and never give personalized financial advice — frame everything as education about the ' +
    'method. If the context says the price history is simulated, respect that honestly.';

  /**
   * Ask OpenRouter. Resolves with plain text; rejects with a human-readable
   * message. The visitor's key goes in the Authorization header, to
   * openrouter.ai and nowhere else.
   */
  AI.ask = function (question) {
    var cfg = AI.config();
    if (!cfg.key) return Promise.reject(new Error('No OpenRouter key saved yet.'));

    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfg.key,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': '100MillClub'
      },
      body: JSON.stringify({
        model: cfg.model || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: 'Context:\n' + context() + '\n\nQuestion: ' + question }
        ],
        max_tokens: 600
      })
    }).then(function (res) {
      if (res.status === 401) throw new Error('OpenRouter says the key is invalid. Check it in the AI desk settings.');
      if (res.status === 402) throw new Error('OpenRouter says the account is out of credits. Free models exist — try ' + DEFAULT_MODEL + '.');
      if (res.status === 429) throw new Error('OpenRouter rate limit hit. Give it a minute.');
      if (!res.ok) throw new Error('OpenRouter answered ' + res.status + '. Try again, or try a different model.');
      return res.json();
    }).then(function (json) {
      var msg = json.choices && json.choices[0] && json.choices[0].message;
      if (!msg || !msg.content) throw new Error('The model sent back an empty reply. Try again or switch models.');
      return msg.content.trim();
    });
  };

  /** Minimal safe formatting: escape everything, then allow bold + line breaks. */
  AI.toHtml = function (text) {
    return MC.esc(text)
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/^### (.+)$/gm, '<b>$1</b>')
      .replace(/^## (.+)$/gm, '<b>$1</b>')
      .replace(/^# (.+)$/gm, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  };

})(window);
