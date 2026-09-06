(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Font = SITF.Font;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  SITF.time = 0;
  SITF.canvas = canvas;
  SITF.scale = 1;

  var states = SITF.states;
  var current = null;
  var currentName = '';

  // Fade transition between states.
  var fade = { a: 0, dir: 0, pending: null };
  var FADE_T = 0.35;

  SITF.setState = function (name, params) {
    if (fade.dir !== 0 && fade.pending) return;
    fade.pending = { name: name, params: params };
    fade.dir = 1;
  };

  function applyState(name, params) {
    if (current && current.exit) current.exit();
    current = states[name];
    currentName = name;
    if (current && current.enter) current.enter(params || {});
  }

  SITF.stateName = function () { return currentName; };

  // --- scaling -------------------------------------------------------------

  function resize() {
    var sw = window.innerWidth || document.documentElement.clientWidth || C.W;
    var sh = window.innerHeight || document.documentElement.clientHeight || C.H;
    var fit = Math.min(sw / C.W, sh / C.H);
    // Whole-number scaling keeps the pixels crisp. Only when the window is
    // smaller than the canvas do we scale down fractionally, because showing
    // the whole screen matters more than pixel purity there.
    var s = fit >= 1 ? Math.floor(fit) : fit;
    SITF.scale = s;
    var w = Math.round(C.W * s), h = Math.round(C.H * s);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.left = Math.floor((sw - w) / 2) + 'px';
    canvas.style.top = Math.floor((sh - h) / 2) + 'px';
  }

  // --- input plumbing ------------------------------------------------------

  function pointerHandler(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.clientX - rect.left) / SITF.scale;
    var cy = (e.clientY - rect.top) / SITF.scale;
    if (cx < 0 || cy < 0 || cx > C.W || cy > C.H) return;
    var mode = (currentName === 'play' && current && !current.isPaused()) ? 'play' : 'menu';
    SITF.Input.pointer(cx, cy, mode);
    e.preventDefault();
  }

  // --- loop ----------------------------------------------------------------

  var last = 0;
  var acc = 0;
  var DT = 1 / 60;
  var booted = false;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var delta = (now - last) / 1000;
    last = now;
    if (delta > 0.1) delta = 0.1;
    acc += delta;

    var guard = 0;
    while (acc >= DT && guard < 5) {
      step(DT);
      acc -= DT;
      guard++;
    }
    if (guard >= 5) acc = 0;

    draw();
  }

  function step(dt) {
    SITF.time += dt;
    SITF.Audio.update(dt);

    // Fade drives the state swap at its midpoint.
    if (fade.dir === 1) {
      fade.a += dt / (FADE_T / 2);
      if (fade.a >= 1) {
        fade.a = 1;
        if (fade.pending) {
          applyState(fade.pending.name, fade.pending.params);
          fade.pending = null;
        }
        fade.dir = -1;
      }
    } else if (fade.dir === -1) {
      fade.a -= dt / (FADE_T / 2);
      if (fade.a <= 0) { fade.a = 0; fade.dir = 0; }
    }

    if (!booted) return;
    if (current && current.update) current.update(dt);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;

    if (!booted) {
      ctx.fillStyle = '#06101e';
      ctx.fillRect(0, 0, C.W, C.H);
      Font.draw(ctx, 'LOADING' + (SITF.Assets.ready ? '' : '...'), C.W / 2, C.H / 2 - 4,
                { scale: 2, color: C.COLORS.textDim, align: 'center' });
      return;
    }

    if (current && current.draw) current.draw(ctx);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, C.W, C.H); }

    if (fade.a > 0) {
      ctx.save();
      ctx.globalAlpha = U.clamp(fade.a, 0, 1);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.restore();
    }
  }

  // Drive the game deterministically. The normal loop uses requestAnimationFrame;
  // this exists so the game can also be stepped in environments that never
  // composite a frame (headless previews, automated checks).
  SITF.advance = function (seconds, redraw) {
    var n = Math.max(1, Math.round(seconds / DT));
    for (var i = 0; i < n; i++) step(DT);
    if (redraw !== false) draw();
    return SITF.time;
  };

  // --- boot ----------------------------------------------------------------

  function boot() {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    // Layout is not always settled on the first call.
    window.addEventListener('load', resize);
    setTimeout(resize, 60);
    canvas.addEventListener('pointerdown', pointerHandler);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    SITF.Input.init();
    SITF.Audio.init();
    SITF.Sprites.build();
    SITF.Fog.build();

    window.addEventListener('blur', function () {
      if (currentName === 'play' && current && current.forcePause) current.forcePause();
    });

    requestAnimationFrame(frame);

    // The logo is rendered from the font, so the face must be settled first.
    SITF.Font.load(function () {
      SITF.Logo.build();
      SITF.Assets.load(function () {
        booted = true;
        // ?fly=1 opens the face flythrough instead of the game: the review
        // pass for the mountain itself, with nothing drawn in front of it.
        var fly = /[?&]fly=1/.test(window.location.search);
        if (fly) SITF.Config.DEBUG = true;
        applyState(fly ? 'fly' : 'title', {});
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
