/* ==========================================================================
   queez-ui.js — the Queez help panel
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var UI = MC.queezUI = {};
  var $ = MC.$;
  var open = false;

  UI.init = function () {
    $('qzFab').addEventListener('click', UI.toggle);
    $('qzClose').addEventListener('click', UI.close);

    $('qzForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var text = $('qzInput').value.trim();
      if (!text) return;
      UI.send(text);
      $('qzInput').value = '';
    });

    MC.on($('qzChips'), 'click', '.qz-chip', function (e, chip) {
      UI.send(chip.textContent);
    });
    MC.on($('qzLog'), 'click', '.qz-rel-chip', function (e, chip) {
      UI.send(chip.getAttribute('data-qztopic'), true);
    });

    renderChips();

    $('qzTourBtn').addEventListener('click', function () {
      UI.close();
      MC.tour.start();
    });
    $('qzGuideBtn').addEventListener('click', function () {
      UI.close();
      MC.ui.openModal('mdHelp');
    });

    /* ---- the AI desk: bring-your-own OpenRouter key ---- */
    $('qzAiBtn').addEventListener('click', function () {
      var cfg = MC.ai.config();
      $('qzAiKey').value = cfg.key || '';
      $('qzAiModel').value = cfg.model || '';
      $('qzAiCfg').classList.toggle('hidden');
    });
    $('qzAiSave').addEventListener('click', function () {
      MC.ai.saveConfig({ key: $('qzAiKey').value, model: $('qzAiModel').value });
      $('qzAiCfg').classList.add('hidden');
      renderChips();
      MC.ui.toast(
        MC.ai.enabled() ? 'AI desk on 🤖' : 'AI desk off',
        MC.ai.enabled()
          ? 'Start a question with "ai" — the key stays in this browser and talks only to OpenRouter.'
          : 'Key removed. The Coach still answers everything himself.',
        MC.ai.enabled() ? 'gold' : 'info');
    });

    // opening line, written once per visit
    say('queez',
      'There you are. I am the <b>Coach</b>, and you — you are <b>Queez</b>. Everyone who walks in ' +
      'here is. My whole job is teaching Queez how to work this terminal, so ask me anything — or ' +
      'press a button below if typing is too much effort, bozo.');
  };

  UI.toggle = function () { open ? UI.close() : UI.show(); };

  UI.show = function () {
    open = true;
    $('qzPanel').classList.add('on');
    $('qzFab').classList.add('on');
    setTimeout(function () { $('qzInput').focus(); }, 220);

    var quip = MC.queez.noteHelpOpen();
    if (quip) say('queez', quip);
  };

  UI.close = function () {
    open = false;
    $('qzPanel').classList.remove('on');
    $('qzFab').classList.remove('on');
  };

  UI.isOpen = function () { return open; };

  function renderChips() {
    var html = MC.queez.suggestions()
      .map(function (s) { return '<button class="qz-chip">' + MC.esc(s) + '</button>'; }).join('');
    html = '<button class="qz-chip">go — read this chart</button>' + html;
    if (MC.ai && MC.ai.enabled()) {
      html += '<button class="qz-chip">ai: what do you make of this chart?</button>';
    }
    $('qzChips').innerHTML = html;
  }

  /** Ask a question and print both sides of it. */
  UI.send = function (text, asTopic) {
    // "ai …" routes to the AI desk, the visitor's own key and bill
    var aiQ = !asTopic && text.match(/^\s*(?:ai[:,]\s*|ai\s+|@ai\s+)(.+)/i);
    if (aiQ) return sendAI(aiQ[1]);

    say('you', MC.esc(text));
    var typing = say('queez', '<span class="qz-typing"><i></i><i></i><i></i></span>');

    // a beat before answering, so it reads like a reply rather than a lookup
    setTimeout(function () {
      var res;
      // "go" (alone, or with "chart") — the Coach reads the chart in front of
      // you. "go over risk with me" is a question, not a chart-read request.
      var t = text.trim().toLowerCase();
      var wantsRead = /^go[\s!.?]*$/.test(t) ||
                      (/^go\b/.test(t) && /chart/.test(t)) ||
                      /^read (the |this )?chart/.test(t) ||
                      (/^analy[sz]e\b/.test(t) && /chart|this/.test(t));
      if (!asTopic && wantsRead) {
        res = MC.read.go();
      } else {
        res = asTopic ? MC.queez.askTopic(text) : MC.queez.ask(text);
      }
      renderResult(typing, res);
    }, 420);
  };

  function renderResult(typing, res) {
    typing.innerHTML = res.text;

    // the Coach always leaves Queez with a concrete next move
    if (res.next) {
      typing.insertAdjacentHTML('beforeend',
        '<span class="qz-next"><i class="fa-solid fa-arrow-right"></i><b>Next move:</b> ' + res.next + '</span>');
    }
    if (res.topic) {
      typing.insertAdjacentHTML('beforeend', '<span class="qz-topic">' + MC.esc(res.topic) + '</span>');
    }
    // related topics become tappable follow-ups
    if (res.related && res.related.length) {
      typing.insertAdjacentHTML('beforeend',
        '<span class="qz-rel">' + res.related.map(function (r) {
          return '<button class="qz-rel-chip" data-qztopic="' + MC.esc(r) + '">' + MC.esc(r) + '</button>';
        }).join('') + '</span>');
    }
    scroll();
  }

  /** The AI desk reply — clearly labeled, clearly the visitor's own model. */
  function sendAI(question) {
    say('you', MC.esc('ai: ' + question));
    if (!MC.ai || !MC.ai.enabled()) {
      say('queez',
        'The <b>AI desk</b> is not switched on yet, Queez. Tap <b>AI desk</b> below, paste your own ' +
        'OpenRouter key (free at openrouter.ai/keys — free models included), then start any question ' +
        'with <b>ai</b>. The key stays in this browser and talks only to OpenRouter.');
      return;
    }
    var typing = say('queez', '<span class="qz-typing"><i></i><i></i><i></i></span>');
    MC.ai.ask(question).then(function (reply) {
      typing.innerHTML =
        '<span class="qz-ai-tag"><i class="fa-solid fa-robot"></i> AI desk — your key, your model</span>' +
        MC.ai.toHtml(reply);
      scroll();
    }).catch(function (e) {
      typing.innerHTML = 'The AI desk hit a snag: ' + MC.esc(e.message || 'unknown error');
      scroll();
    });
  }

  /** Push a line into the transcript. Returns the bubble, so it can be edited. */
  function say(who, html) {
    var row = document.createElement('div');
    row.className = 'qz-msg ' + who;
    row.innerHTML = who === 'queez'
      ? '<span class="qz-face">🎩</span><div class="qz-bubble">' + html + '</div>'
      : '<div class="qz-bubble">' + html + '</div>';
    $('qzLog').appendChild(row);
    scroll();
    return row.querySelector('.qz-bubble');
  }

  function scroll() {
    var log = $('qzLog');
    log.scrollTop = log.scrollHeight;
  }

  /**
   * Drop a remark into the panel without opening it, and nudge the button so
   * you can tell he has something to say.
   */
  UI.remark = function (text) {
    if (!text) return;
    say('queez', text);
    if (!open) {
      $('qzFab').classList.add('has-news');
      MC.ui.toast('Coach says', stripTags(text), 'gold');
      setTimeout(function () { $('qzFab').classList.remove('has-news'); }, 6000);
    }
  };

  function stripTags(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent;
  }

})(window);
