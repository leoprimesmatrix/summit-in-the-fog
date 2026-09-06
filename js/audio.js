(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  // -------------------------------------------------------------------------
  // Audio playback uses HTMLAudioElement ONLY. There is deliberately no
  // Web Audio API usage anywhere in this project (no AudioContext, no
  // oscillators, no buffers). Every sound is a real file supplied in
  // assets/audio/. Missing files are harmless: the cue is silently skipped.
  // -------------------------------------------------------------------------

  var NAMES = [
    'amb_wind',
    'sfx_gust', 'sfx_hop', 'sfx_land', 'sfx_slip', 'sfx_cairn',
    'sfx_crumble', 'sfx_whiteout', 'sfx_summit', 'sfx_ui', 'sfx_crystal', 'sfx_echo'
  ];
  var EXTS = ['wav', 'ogg', 'mp3'];
  var DIR = 'assets/audio/';

  var VOL = { music: 0.22, ambient: 0.14, sfx: 0.7, ui: 0.5 };
  var POOL_SIZE = 4;

  var A = {
    muted: false,
    unlocked: false,
    available: {},
    missing: {},
    src: {}
  };

  var base = {};
  var pools = {};
  var pending = null;

  // --- loading ------------------------------------------------------------

  function tryLoad(name, idx) {
    if (idx >= EXTS.length) {
      A.missing[name] = true;
      console.warn('[audio] missing: ' + name + ' (tried .' + EXTS.join(' .') + ')');
      return;
    }
    var el = base[name];
    var url = DIR + name + '.' + EXTS[idx];

    function cleanup() {
      el.removeEventListener('error', onError);
      el.removeEventListener('canplaythrough', onOk);
      el.removeEventListener('loadeddata', onOk);
    }
    function onError() {
      cleanup();
      tryLoad(name, idx + 1);
    }
    function onOk() {
      cleanup();
      A.available[name] = true;
      A.src[name] = url;
      el.muted = A.muted;
    }

    el.addEventListener('error', onError);
    el.addEventListener('canplaythrough', onOk);
    el.addEventListener('loadeddata', onOk);
    el.src = url;
    try { el.load(); } catch (e) { /* ignore */ }
  }

  A.init = function () {
    A.muted = (U.storageGet(C.STORAGE_KEY_MUTE) === '1');
    var mv = parseFloat(U.storageGet(C.STORAGE_KEY_MUSIC));
    var sv = parseFloat(U.storageGet(C.STORAGE_KEY_SFX));
    A.musicVol = isFinite(mv) ? U.clamp(mv, 0, 1) : 1;
    A.sfxVol = isFinite(sv) ? U.clamp(sv, 0, 1) : 1;
    for (var i = 0; i < NAMES.length; i++) {
      var n = NAMES[i];
      var el = new Audio();
      el.preload = 'auto';
      el.muted = A.muted;
      base[n] = el;
      pools[n] = [];
      tryLoad(n, 0);
    }
  };

  A.ready = function (name) { return !!A.available[name]; };

  // --- sfx ----------------------------------------------------------------

  function poolGet(name) {
    var p = pools[name];
    for (var i = 0; i < p.length; i++) {
      if (p[i].paused || p[i].ended) return p[i];
    }
    if (p.length < POOL_SIZE) {
      var clone = base[name].cloneNode(true);
      clone.muted = A.muted;
      p.push(clone);
      return clone;
    }
    return p[0];
  }

  A.play = function (name, opts) {
    if (!A.available[name]) return;
    opts = opts || {};
    var el = poolGet(name);
    try {
      el.currentTime = 0;
      el.volume = U.clamp((opts.volume == null ? 1 : opts.volume) * VOL.sfx * A.sfxVol, 0, 1);
      el.playbackRate = opts.rate || 1;
      el.muted = A.muted;
      var pr = el.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) { /* ignore */ }
  };

  A.ui = function () {
    A.play('sfx_ui', { volume: VOL.ui / VOL.sfx });
  };

  // --- music (two crossfading channels) ------------------------------------

  var chan = [
    { el: null, name: null, vol: 0, target: 0, rate: 0 },
    { el: null, name: null, vol: 0, target: 0, rate: 0 }
  ];
  var activeChan = 0;
  var currentMusic = null;

  A.music = function (name, fadeSec) {
    fadeSec = (fadeSec == null) ? 1.2 : fadeSec;
    if (currentMusic === name) return;

    if (!A.unlocked) {
      pending = { name: name, fade: fadeSec };
      currentMusic = name;
      return;
    }
    currentMusic = name;

    var cur = chan[activeChan];
    if (cur.el) {
      cur.target = 0;
      cur.rate = fadeSec > 0 ? (cur.vol / fadeSec) : 999;
    }

    if (!name || !A.available[name]) return;

    activeChan = 1 - activeChan;
    var nx = chan[activeChan];
    if (nx.el) { try { nx.el.pause(); } catch (e) {} }

    var el = base[name].cloneNode(true);
    el.loop = true;
    el.volume = 0;
    el.muted = A.muted;
    nx.el = el;
    nx.name = name;
    nx.vol = 0;
    nx.target = VOL.music * A.musicVol;
    nx.rate = fadeSec > 0 ? (VOL.music / fadeSec) : 999;
    var pr = el.play();
    if (pr && pr.catch) pr.catch(function () {});
  };

  // --- ambient loop --------------------------------------------------------

  var amb = { el: null, vol: 0, target: 0, rate: 0, base: 0 };

  A.ambient = function (target, fadeSec) {
    fadeSec = (fadeSec == null) ? 1.5 : fadeSec;
    if (!A.available['amb_wind']) return;
    amb.base = U.clamp(target, 0, 1);
    var goal = amb.base * VOL.ambient * A.musicVol;
    if (!amb.el) {
      amb.el = base['amb_wind'].cloneNode(true);
      amb.el.loop = true;
      amb.el.volume = 0;
      amb.el.muted = A.muted;
    }
    if (goal > 0 && amb.el.paused && A.unlocked) {
      var pr = amb.el.play();
      if (pr && pr.catch) pr.catch(function () {});
    }
    amb.target = goal;
    amb.rate = fadeSec > 0 ? Math.abs(goal - amb.vol) / fadeSec : 999;
    if (amb.rate < 0.0001) amb.rate = 0.5;
  };

  // --- update / mute / unlock ----------------------------------------------

  function stepChan(c, dt) {
    if (!c.el) return;
    if (c.vol < c.target) c.vol = Math.min(c.target, c.vol + c.rate * dt);
    else if (c.vol > c.target) c.vol = Math.max(c.target, c.vol - c.rate * dt);
    try { c.el.volume = U.clamp(c.vol, 0, 1); } catch (e) {}
    if (c.vol <= 0.0001 && c.target === 0 && !c.el.paused) {
      try { c.el.pause(); } catch (e) {}
    }
  }

  A.update = function (dt) {
    stepChan(chan[0], dt);
    stepChan(chan[1], dt);
    if (amb.el) {
      if (amb.vol < amb.target) amb.vol = Math.min(amb.target, amb.vol + amb.rate * dt);
      else if (amb.vol > amb.target) amb.vol = Math.max(amb.target, amb.vol - amb.rate * dt);
      try { amb.el.volume = U.clamp(amb.vol, 0, 1); } catch (e) {}
      if (amb.vol <= 0.0001 && amb.target === 0 && !amb.el.paused) {
        try { amb.el.pause(); } catch (e) {}
      }
    }
  };

  A.unlock = function () {
    if (A.unlocked) return;
    A.unlocked = true;
    if (pending) {
      var p = pending;
      pending = null;
      currentMusic = null;
      A.music(p.name, p.fade);
    }
    if (amb.el && amb.target > 0 && amb.el.paused) {
      var pr = amb.el.play();
      if (pr && pr.catch) pr.catch(function () {});
    }
  };

  function applyMute() {
    for (var i = 0; i < NAMES.length; i++) {
      var n = NAMES[i];
      if (base[n]) base[n].muted = A.muted;
      var p = pools[n];
      for (var j = 0; j < p.length; j++) p[j].muted = A.muted;
    }
    if (chan[0].el) chan[0].el.muted = A.muted;
    if (chan[1].el) chan[1].el.muted = A.muted;
    if (amb.el) amb.el.muted = A.muted;
  }

  A.setMuted = function (m) {
    A.muted = !!m;
    U.storageSet(C.STORAGE_KEY_MUTE, A.muted ? '1' : '0');
    applyMute();
  };

  A.toggleMuted = function () { A.setMuted(!A.muted); };

  // Volume sliders (0..1). Applied live to whatever is playing.
  A.setMusicVolume = function (v) {
    A.musicVol = U.clamp(v, 0, 1);
    U.storageSet(C.STORAGE_KEY_MUSIC, String(A.musicVol));
    var cur = chan[activeChan];
    if (cur.el && cur.target > 0) { cur.target = VOL.music * A.musicVol; cur.rate = 2; }
    if (amb.el && amb.base > 0) { amb.target = amb.base * VOL.ambient * A.musicVol; amb.rate = 2; }
  };
  A.setSfxVolume = function (v) {
    A.sfxVol = U.clamp(v, 0, 1);
    U.storageSet(C.STORAGE_KEY_SFX, String(A.sfxVol));
  };

  SITF.Audio = A;
})();
