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

    $('qzChips').innerHTML = MC.queez.suggestions()
      .map(function (s) { return '<button class="qz-chip">' + MC.esc(s) + '</button>'; }).join('');

    $('qzTourBtn').addEventListener('click', function () {
      UI.close();
      MC.tour.start();
    });
    $('qzGuideBtn').addEventListener('click', function () {
      UI.close();
      MC.ui.openModal('mdHelp');
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

  /** Ask a question and print both sides of it. */
  UI.send = function (text, asTopic) {
    say('you', MC.esc(text));
    var typing = say('queez', '<span class="qz-typing"><i></i><i></i><i></i></span>');

    // a beat before answering, so it reads like a reply rather than a lookup
    setTimeout(function () {
      var res = asTopic ? MC.queez.askTopic(text) : MC.queez.ask(text);
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
    }, 420);
  };

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
