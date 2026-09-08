// Sound.
//
// HTMLAudioElement only. Every effect is a plain WAV authored offline by
// tools/gen_sfx.js; there is no Web Audio API anywhere in the game, by
// design. That costs a little control and buys total portability.
//
// Each effect keeps a small ring of clones so overlapping plays do not cut
// each other off, and each has a minimum re-trigger gap so a stream of
// particles cannot machine-gun the same file.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Aud = {};
  var DIR = 'assets/audio/';
  var VOICES = 4;

  // name -> { pool: [], i: 0, gap: seconds, last: 0, vol: base }
  var bank = {};
  var beds = {};
  var muted = false;
  var sfxVol = 0.62;
  var bedVol = 0.38;
  var unlocked = false;
  var now = 0;

  // The mix.
  //
  // These are not taste, they are arithmetic: each level is a target loudness
  // divided by the measured peak of that WAV, so a file that was authored hot
  // does not arrive louder than one that was not. The first pass set them by
  // ear against the waveforms rather than against each other, and the result
  // was a game where a serac letting go clipped your speakers.
  var SFX = {
    sfx_jump:     { gap: 0.04, vol: 0.23 },
    sfx_land:     { gap: 0.05, vol: 0.21 },
    sfx_land_hard:{ gap: 0.08, vol: 0.26 },
    sfx_step:     { gap: 0.10, vol: 0.15 },
    sfx_dash:     { gap: 0.08, vol: 0.26 },
    sfx_wall:     { gap: 0.06, vol: 0.25 },
    sfx_axe:      { gap: 0.05, vol: 0.28 },
    sfx_axe_hit:  { gap: 0.04, vol: 0.29 },
    sfx_reel:     { gap: 0.20, vol: 0.32 },
    sfx_crystal:  { gap: 0.05, vol: 0.28 },
    sfx_cairn:    { gap: 0.20, vol: 0.33 },
    sfx_crack:    { gap: 0.10, vol: 0.26 },
    sfx_rumble:   { gap: 0.18, vol: 0.32 },
    sfx_shatter:  { gap: 0.05, vol: 0.23 },
    sfx_brittle:  { gap: 0.08, vol: 0.22 },
    sfx_serac:    { gap: 0.35, vol: 0.29 },
    sfx_hurt:     { gap: 0.15, vol: 0.29 },
    sfx_death:    { gap: 0.50, vol: 0.33 },
    sfx_summit:   { gap: 1.00, vol: 0.37 },
    sfx_gust:     { gap: 0.40, vol: 0.26 },
    sfx_ui:       { gap: 0.04, vol: 0.28 },
    sfx_ui_hi:    { gap: 0.04, vol: 0.27 },
    sfx_thunder:  { gap: 0.80, vol: 0.28 }
  };

  var BEDS = { amb_wind: 0.5, amb_storm: 0.62 };

  // Nothing here can mix, so the next best thing: when several effects go off
  // at once, each one steps back. A serac cracking during a landing during a
  // gust is three files at full level on top of each other, and that stack -
  // not any one sound - is what "too loud" actually sounds like.
  var stack = 0;

  Aud.load = function () {
    muted = U.load(C.K_MUTE, '0') === '1';
    sfxVol = U.loadNum(C.K_SFX, 0.62);

    for (var name in SFX) {
      if (!SFX.hasOwnProperty(name)) continue;
      var spec = SFX[name];
      var entry = { pool: [], i: 0, gap: spec.gap, last: -99, vol: spec.vol, ok: false };
      for (var v = 0; v < VOICES; v++) {
        var a = new Audio();
        a.preload = 'auto';
        a.src = DIR + name + '.wav';
        a.addEventListener('canplaythrough', function (e) { entry.ok = true; });
        a.addEventListener('error', function () { /* silence is acceptable */ });
        entry.pool.push(a);
      }
      bank[name] = entry;
    }

    for (var b in BEDS) {
      if (!BEDS.hasOwnProperty(b)) continue;
      var el = new Audio();
      el.preload = 'auto';
      el.loop = true;
      el.src = DIR + b + '.wav';
      el.volume = 0;
      beds[b] = { el: el, base: BEDS[b], target: 0, cur: 0, playing: false };
    }
  };

  // Browsers will not let audio start before a gesture; the first key or tap
  // nudges every element once and then we never think about it again.
  Aud.unlock = function () {
    if (unlocked) return;
    unlocked = true;
    for (var b in beds) {
      if (!beds.hasOwnProperty(b)) continue;
      var el = beds[b].el;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
      beds[b].playing = true;
    }
  };

  Aud.tick = function (dt) {
    now += dt;
    stack = Math.max(0, stack - dt * 7);
    for (var b in beds) {
      if (!beds.hasOwnProperty(b)) continue;
      var bd = beds[b];
      bd.cur = U.approach(bd.cur, muted ? 0 : bd.target, 0.55, dt);
      try { bd.el.volume = U.clamp01(bd.cur * bd.base * bedVol); } catch (e) {}
      if (unlocked && !bd.playing && bd.cur > 0.001) {
        var pr = bd.el.play();
        if (pr && pr.catch) pr.catch(function () {});
        bd.playing = true;
      }
    }
  };

  // opts: { volume, rate, pan (ignored - no Web Audio), delay }
  Aud.play = function (name, opts) {
    if (muted || !unlocked) return;
    var e = bank[name];
    if (!e) return;
    if (now - e.last < e.gap) return;
    e.last = now;
    opts = opts || {};
    var a = e.pool[e.i];
    e.i = (e.i + 1) % e.pool.length;
    try {
      a.currentTime = 0;
      var duck = 1 / (1 + stack * 0.5);
      stack += 1;
      a.volume = U.clamp01(e.vol * (opts.volume === undefined ? 1 : opts.volume) * sfxVol * duck);
      a.playbackRate = opts.rate === undefined ? 1 : U.clamp(opts.rate, 0.5, 3);
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (err) { /* an effect that will not play is not worth a crash */ }
  };

  // Play with a random pitch nudge, which is what keeps a repeated sound from
  // turning into a machine.
  Aud.playVar = function (name, vol, spread) {
    spread = spread === undefined ? 0.12 : spread;
    Aud.play(name, { volume: vol, rate: 1 + (Math.random() * 2 - 1) * spread });
  };

  Aud.bed = function (name, level) {
    var b = beds[name];
    if (b) b.target = U.clamp01(level);
  };

  Aud.allBeds = function (level) {
    for (var b in beds) if (beds.hasOwnProperty(b)) beds[b].target = 0;
  };

  Aud.setMuted = function (m) {
    muted = !!m;
    U.save(C.K_MUTE, muted ? '1' : '0');
  };
  Aud.muted = function () { return muted; };
  Aud.toggleMute = function () { Aud.setMuted(!muted); return muted; };

  Aud.setSfx = function (v) { sfxVol = U.clamp01(v); U.save(C.K_SFX, sfxVol.toFixed(2)); };
  Aud.sfx = function () { return sfxVol; };

  IF.Audio = Aud;
})();
