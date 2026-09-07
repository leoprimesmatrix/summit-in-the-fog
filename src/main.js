// Boot and the main loop.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var canvas = document.getElementById('game');
  var loader = document.getElementById('loader');
  var bar = document.getElementById('bar');
  var note = document.getElementById('note');

  IF.time = 0;
  IF.dt = 0;
  IF.canvas = canvas;
  IF.frame = 0;

  var current = null, currentName = '';
  var fade = { a: 0, dir: 0, pending: null };
  var FADE_T = 0.30;

  IF.setState = function (name, params) {
    if (fade.dir > 0 && fade.pending) return;
    fade.pending = { name: name, params: params || {} };
    fade.dir = 1;
  };

  IF.setStateNow = function (name, params) {
    apply(name, params || {});
    fade.a = 0; fade.dir = 0; fade.pending = null;
  };

  function apply(name, params) {
    if (current && current.exit) current.exit();
    current = IF.states[name];
    currentName = name;
    if (!current) { console.error('[main] no such state: ' + name); return; }
    if (current.enter) current.enter(params || {});
  }

  IF.stateName = function () { return currentName; };
  IF.state = function () { return current; };
  IF.fade = function () { return 1 - fade.a; };

  // --- fitting the window --------------------------------------------------

  var dpr = 1;

  function resize() {
    var sw = window.innerWidth || document.documentElement.clientWidth;
    var sh = window.innerHeight || document.documentElement.clientHeight;
    var fit = Math.min(sw / C.W, sh / C.H);
    var w = Math.max(1, Math.floor(C.W * fit));
    var h = Math.max(1, Math.floor(C.H * fit));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.left = Math.floor((sw - w) / 2) + 'px';
    canvas.style.top = Math.floor((sh - h) / 2) + 'px';

    // The backing store follows the device, capped: a 4K window does not
    // need four times the fragments to show a 640x360 image sharply.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw; canvas.height = bh;
    }
  }

  // --- the loading sequence ------------------------------------------------
  // Split into steps so the bar actually moves and the tab never looks hung.

  var steps = [];
  var stepIndex = 0;

  function setProgress(t, label) {
    if (bar) bar.style.width = Math.round(U.clamp01(t) * 100) + '%';
    if (note && label) note.textContent = label;
  }

  function fail(msg) {
    if (loader) {
      loader.innerHTML = '<div class="fail"><h1>ICEFALL</h1><p>' + msg + '</p></div>';
    }
    console.error('[boot] ' + msg);
  }

  function buildSteps() {
    steps = [];
    // One material per step: each is a quarter of a second of noise, and
    // batching them looks like a hang.
    for (var m = 0; m < IF.Rock.count(); m++) {
      (function (i) {
        steps.push(['Cutting ' + IF.Rock.nameOf(i).replace('_', ' '),
                    function () { IF.Rock.buildOne(i); }]);
      })(m);
    }
    steps = steps.concat([
      ['Packing sprites', function () {
        IF.Atlas.reset();
        IF.Props.build();
      }],
      ['Rigging the climber', function () { IF.ClimberArt.build(); }],
      // The wordmark is cut from the font's own glyphs, so type comes first.
      ['Setting type', function () { IF.Font.build('m5x7'); }],
      ['Carving the title', function () { IF.LogoArt.build(); }],
      ['Painting the range', function () { IF.Backdrop.build(); }],
      ['Uploading', function () {
        IF.Atlas.upload(IF.GL);
        IF.Draw.init();
        IF.Backdrop.upload(IF.GL);
      }],
      ['Growing the mountain', function () { IF.Terrain.generate(C.SEED); }],
      ['Warming the face', function () {
        IF.Chunks.reset();
        IF.Chunks.prebake(IF.Terrain.startY() - C.H * 0.6, 3);
      }],
      ['Tuning', function () {
        IF.Audio.load();
        IF.Particles.init();
        IF.Weather.init();
        IF.Camera.setStrength(U.loadNum(C.K_SHAKE, 1));
        if (U.load(C.K_QUALITY, '1') === '0') IF.Pipeline.setQuality(0);
      }]
    ]);
  }

  function runStep() {
    if (stepIndex >= steps.length) {
      finishBoot();
      return;
    }
    var s = steps[stepIndex];
    setProgress(stepIndex / steps.length, s[0]);
    // Yield between steps so the bar paints. A frame callback is the right
    // way to do that, but a backgrounded tab never gets one, so a timer runs
    // alongside it and whichever arrives first wins.
    var fired = false;
    var go = function () {
      if (fired) return;
      fired = true;
      try {
        s[1]();
      } catch (e) {
        fail('Failed while ' + s[0].toLowerCase() + ': ' + e.message);
        console.error(e);
        return;
      }
      stepIndex++;
      runStep();
    };
    requestAnimationFrame(go);
    setTimeout(go, 24);
  }

  function finishBoot() {
    setProgress(1, 'Ready');
    if (loader) loader.classList.add('gone');
    setTimeout(function () { if (loader && loader.parentNode) loader.parentNode.removeChild(loader); }, 420);
    IF.setStateNow('title', {});
    booted = true;
    last = 0;
    // Kick the loop. It re-schedules itself from then on, but somebody has
    // to throw the first frame.
    requestAnimationFrame(frame);
  }

  // --- loop ----------------------------------------------------------------

  var booted = false;
  var last = 0;
  var acc = 0;
  var DT = 1 / 60;
  var slowFrames = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!booted) return;

    if (!last) last = now;
    var delta = (now - last) / 1000;
    last = now;
    if (delta > 0.25) delta = 0.25;      // a tab that was hidden does not fast-forward

    acc += delta;
    var steps = 0;
    while (acc >= DT && steps < 5) {
      step(DT);
      acc -= DT;
      steps++;
    }
    if (steps >= 5) acc = 0;             // give up rather than spiral

    render();
    IF.frame++;

    // Drop the heavier post work if the machine cannot keep up. Two seconds
    // of sustained slowness is a real problem, not a hiccup.
    if (delta > 0.030) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 120 && IF.Pipeline.quality()) {
      IF.Pipeline.setQuality(0);
      slowFrames = 0;
      console.warn('[main] dropping to reduced effects');
    }
  }

  function step(dt) {
    IF.time += dt;
    IF.dt = dt;
    IF.Input.update(dt);
    IF.Audio.tick(dt);

    if (fade.dir > 0) {
      fade.a += dt / FADE_T;
      if (fade.a >= 1) {
        fade.a = 1;
        apply(fade.pending.name, fade.pending.params);
        fade.pending = null;
        fade.dir = -1;
      }
    } else if (fade.dir < 0) {
      fade.a -= dt / FADE_T;
      if (fade.a <= 0) { fade.a = 0; fade.dir = 0; }
    }

    if (current && current.update) current.update(dt, fade.dir !== 0);
    IF.Input.endFrame();
  }

  function render() {
    if (IF.GL.lost()) return;
    if (current && current.render) current.render();
  }

  // --- start ---------------------------------------------------------------

  function boot() {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    var gl = IF.GL.init(canvas);
    if (!gl) {
      fail('This game needs WebGL2, and this browser did not provide it. ' +
           'Try a recent Chrome, Edge, Firefox or Safari.');
      return;
    }

    IF.Input.init(canvas);
    // The first interaction of any kind is what lets sound start.
    var unlock = function () { IF.Audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });

    try {
      IF.Pipeline.init(canvas);
    } catch (e) {
      fail('The renderer failed to start: ' + e.message);
      console.error(e);
      return;
    }

    buildSteps();
    // The font has to be in the document before glyphs can be rasterised.
    IF.Font.load('assets/fonts/m5x7.ttf', 'm5x7').then(function () {
      runStep();
    });
  }

  // --- debug hooks ---------------------------------------------------------
  // Used by the headless test harness; harmless in a shipped build.

  IF.advance = function (seconds, sub) {
    var n = Math.max(1, Math.round(seconds / DT));
    for (var i = 0; i < n; i++) step(DT);
    render();
    return n;
  };

  // Simulate without drawing. The route audit runs tens of thousands of
  // frames and does not care what any of them looked like.
  IF.tick = function (frames) {
    var n = Math.max(1, frames | 0);
    for (var i = 0; i < n; i++) step(DT);
    return n;
  };

  IF.stats = function () {
    return {
      state: currentName,
      time: IF.time,
      draws: IF.GL.stats.draws,
      passes: IF.GL.stats.passes,
      lights: IF.Lights.count(),
      chunks: IF.Chunks.cached(),
      bake: IF.Chunks.lastBakeMs()
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
