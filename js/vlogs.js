/* ==========================================================================
   vlogs.js — the video row and its social sharing
   Share buttons open real, pre-formatted https:// share URLs in a popup.
   ========================================================================== */
(function (window) {
  'use strict';

  var MC = window.MC = window.MC || {};
  var Vlogs = MC.vlogs = {};

  /** Public site the share links point at. */
  var SITE = 'https://100millclub.netlify.app';

  /** Currently open in the "more options" share sheet. */
  var shareTarget = null;

  Vlogs.linkFor = function (video) {
    return SITE + '/vlog/' + video.id;
  };

  Vlogs.find = function (id) {
    return MC.VLOGS.filter(function (v) { return v.id === id; })[0];
  };

  /* ----------------------------------------------------------------------
     RENDER
     ---------------------------------------------------------------------- */
  Vlogs.render = function () {
    MC.$('vlogBody').innerHTML = MC.VLOGS.map(function (v) {
      return '<article class="vid" data-vid="' + v.id + '">' +
        '<div class="thumb">' +
          '<img loading="lazy" alt="" src="https://picsum.photos/seed/' + v.seed + '/480/270" ' +
               'onerror="this.style.display=\'none\'">' +
          (v.tag ? '<span class="badge-tag">' + MC.esc(v.tag) + '</span>' : '') +
          '<span class="dur">' + v.dur + '</span>' +
          '<span class="play"><i class="fa-solid fa-play"></i></span>' +
        '</div>' +
        '<div class="vinfo">' +
          '<div class="vtitle">' + MC.esc(v.t) + '</div>' +
          '<div class="vmeta"><i class="fa-solid fa-eye"></i>' + v.views + ' views · ' + v.date + '</div>' +
          '<div class="shares">' +
            btn('yt', 'youtube',   'fa-brands fa-youtube',   'Share to YouTube') +
            btn('tt', 'tiktok',    'fa-brands fa-tiktok',    'Share to TikTok') +
            btn('ig', 'instagram', 'fa-brands fa-instagram', 'Share to Instagram') +
            btn('tw', 'twitter',   'fa-brands fa-x-twitter', 'Share to X (Twitter)') +
            btn('more', 'more',    'fa-solid fa-share-nodes','More sharing options') +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
  };

  function btn(cls, platform, icon, tip) {
    return '<button class="sbtn ' + cls + '" data-plat="' + platform + '" ' +
           'data-tip="' + tip + '" aria-label="' + tip + '"><i class="' + icon + '"></i></button>';
  }

  /* ----------------------------------------------------------------------
     SHARING
     ---------------------------------------------------------------------- */

  /**
   * Open the platform's share flow in a popup window.
   * X, Telegram and WhatsApp accept a pre-filled URL + text. YouTube,
   * TikTok and Instagram have no public web share intent, so those open the
   * upload/post entry point with the copy ready on the clipboard instead.
   */
  Vlogs.shareTo = function (platform, video) {
    var url = encodeURIComponent(Vlogs.linkFor(video));
    var text = encodeURIComponent(video.t + ' — 100MillClub · City of Grind');

    var targets = {
      youtube:   'https://studio.youtube.com/channel/UC/videos/upload?title=' + text,
      tiktok:    'https://www.tiktok.com/upload?lang=en',
      instagram: 'https://www.instagram.com/',
      twitter:   'https://twitter.com/intent/tweet?text=' + text + '&url=' + url,
      telegram:  'https://t.me/share/url?url=' + url + '&text=' + text,
      whatsapp:  'https://api.whatsapp.com/send?text=' + text + '%20' + url
    };

    var win = window.open(
      targets[platform] || targets.twitter,
      '_blank',
      'noopener,noreferrer,width=620,height=680'
    );

    if (!win) {
      MC.ui.toast('Popup blocked', 'Allow popups for this site, or use Copy to grab the link.', 'err');
    } else {
      MC.ui.toast(
        'Opening ' + platform,
        'Share sheet ready for “' + video.t.slice(0, 42) + '…”',
        'gold'
      );
    }
  };

  /** Open the full share sheet for a video. */
  Vlogs.openShareSheet = function (video) {
    shareTarget = video;
    MC.$('shareTitle').textContent = video.t;
    MC.$('shareLink').value = Vlogs.linkFor(video);
    MC.ui.openModal('mdShare');
  };

  Vlogs.getShareTarget = function () { return shareTarget; };

  /** Copy the share link, with a fallback for browsers without the async API. */
  Vlogs.copyLink = function () {
    var input = MC.$('shareLink');
    var value = input.value;

    function done() { MC.ui.toast('Link copied', value, 'ok'); }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done, legacy);
    } else {
      legacy();
    }

    function legacy() {
      input.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { MC.ui.toast('Copy failed', 'Select the link and copy it manually.', 'err'); }
    }
  };

})(window);
