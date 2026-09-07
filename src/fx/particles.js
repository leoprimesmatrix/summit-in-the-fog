// Particles.
//
// One pooled array, one update, two draw passes (opaque then additive). Each
// particle carries a colour ramp rather than a single colour, because the
// difference between a spark that fades white-to-orange-to-nothing and a
// spark that just fades out is most of the difference between a game that
// looks expensive and one that does not.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Pt = {};
  var MAX = 900;
  var pool = [];
  var live = [];

  function blank() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
      life: 0, max: 1, size: 1, size1: 1,
      rot: 0, rotV: 0, drag: 0, bounce: 0,
      spr: 'spark', frames: 0,
      c0: [1, 1, 1], c1: [1, 1, 1], a0: 1, a1: 0,
      add: 0, lit: 0, emissive: 0, collide: 0, wind: 0,
      lightR: 0, lightI: 0, flick: 0,
      spin: 0, stretch: 0, dead: 1
    };
  }

  Pt.init = function () {
    pool.length = 0; live.length = 0;
    for (var i = 0; i < MAX; i++) pool.push(blank());
  };

  Pt.clear = function () {
    while (live.length) pool.push(live.pop());
  };

  function take() {
    if (pool.length) return pool.pop();
    // Nothing free: reuse the oldest. A dropped particle is invisible; a
    // stall is not.
    return live.shift();
  }

  // The generic spawn. Everything below is a preset over this.
  Pt.spawn = function (o) {
    var p = take();
    p.x = o.x; p.y = o.y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.ax = o.ax || 0; p.ay = o.ay || 0;
    p.life = 0; p.max = o.max || 0.6;
    p.size = o.size === undefined ? 1 : o.size;
    p.size1 = o.size1 === undefined ? p.size : o.size1;
    p.rot = o.rot || 0; p.rotV = o.rotV || 0;
    p.drag = o.drag || 0; p.bounce = o.bounce || 0;
    p.spr = o.spr || 'spark';
    p.frames = o.frames || 0;
    p.c0 = o.c0 || [1, 1, 1];
    p.c1 = o.c1 || p.c0;
    p.a0 = o.a0 === undefined ? 1 : o.a0;
    p.a1 = o.a1 === undefined ? 0 : o.a1;
    p.add = o.add ? 1 : 0;
    p.lit = o.lit ? 1 : 0;
    p.emissive = o.emissive || 0;
    p.collide = o.collide ? 1 : 0;
    p.wind = o.wind || 0;
    p.lightR = o.lightR || 0;
    p.lightI = o.lightI || 0;
    p.flick = o.flick || 0;
    p.stretch = o.stretch || 0;
    p.dead = 0;
    live.push(p);
    return p;
  };

  Pt.count = function () { return live.length; };

  // --- presets -------------------------------------------------------------

  var ICE0 = U.rgb('#eaf9ff'), ICE1 = U.rgb('#6fb6dd');
  var HOT0 = U.rgb('#fff4d2'), HOT1 = U.rgb('#ff5a1e');
  var SNOW0 = U.rgb('#ffffff'), SNOW1 = U.rgb('#cadcea');
  var CYAN0 = U.rgb('#dcfffa'), CYAN1 = U.rgb('#2fd8c8');

  // Ice chips off a struck or shattered block: they tumble, bounce and settle.
  Pt.iceChips = function (x, y, n, power, spread) {
    for (var i = 0; i < n; i++) {
      var a = (Math.random() * U.TAU);
      var sp = power * (0.35 + Math.random() * 0.9);
      Pt.spawn({
        x: x + (Math.random() - 0.5) * (spread || 6),
        y: y + (Math.random() - 0.5) * (spread || 6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - power * 0.35,
        ay: 620, drag: 0.4, bounce: 0.32, collide: 1,
        rot: Math.random() * U.TAU, rotV: (Math.random() - 0.5) * 16,
        spr: 'shard', frames: 6,
        size: 0.7 + Math.random() * 0.8, size1: 0.5,
        c0: ICE0, c1: ICE1, a0: 1, a1: 0,
        max: 0.7 + Math.random() * 0.8, lit: 1
      });
    }
  };

  // Bright sparks: additive, short, and the thing that reads as force.
  Pt.sparks = function (x, y, n, power, col0, col1) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * U.TAU;
      var sp = power * (0.4 + Math.random() * 1.1);
      Pt.spawn({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        ay: 340, drag: 2.6,
        spr: 'spark', size: 0.5 + Math.random() * 0.7, size1: 0.05,
        c0: col0 || HOT0, c1: col1 || HOT1, a0: 1, a1: 0,
        max: 0.22 + Math.random() * 0.42, add: 1, stretch: 0.6
      });
    }
  };

  // Powder: slow, soft, wind-driven. Kicked up by landings and impacts.
  Pt.powder = function (x, y, n, power, up) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * U.TAU;
      var sp = power * (0.2 + Math.random() * 0.8);
      Pt.spawn({
        x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 5,
        vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp * (up === undefined ? 0.8 : up) - 8,
        ay: 55, drag: 1.5, wind: 0.55,
        spr: 'snow_' + (Math.random() * 3 | 0),
        size: 0.8 + Math.random() * 1.6, size1: 2.4 + Math.random(),
        c0: SNOW0, c1: SNOW1, a0: 0.55 + Math.random() * 0.3, a1: 0,
        max: 0.5 + Math.random() * 0.9
      });
    }
  };

  // A single expanding puff, drawn from the animated sprite.
  Pt.puff = function (x, y, size, alpha) {
    Pt.spawn({
      x: x, y: y, vy: -14, drag: 1.6, wind: 0.4,
      spr: 'puff', frames: 5,
      size: size || 1, size1: (size || 1) * 1.5,
      c0: SNOW0, c1: SNOW1, a0: alpha === undefined ? 0.55 : alpha, a1: 0,
      max: 0.55
    });
  };

  // Embers off a lit cairn: they rise, wander and glow.
  Pt.ember = function (x, y) {
    Pt.spawn({
      x: x + (Math.random() - 0.5) * 6, y: y,
      vx: (Math.random() - 0.5) * 14, vy: -18 - Math.random() * 26,
      ay: -12, drag: 0.6, wind: 0.9,
      spr: 'spark', size: 0.5 + Math.random() * 0.5, size1: 0.1,
      c0: HOT0, c1: HOT1, a0: 0.9, a1: 0,
      max: 1.1 + Math.random() * 1.0, add: 1,
      lightR: 22, lightI: 0.35, flick: 1
    });
  };

  // Crystal shatter: cyan, additive, with a couple of chips that survive.
  Pt.crystalBurst = function (x, y) {
    Pt.sparks(x, y, 22, 190, CYAN0, CYAN1);
    for (var i = 0; i < 7; i++) {
      var a = Math.random() * U.TAU;
      Pt.spawn({
        x: x, y: y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 40,
        ay: 500, drag: 0.6, bounce: 0.3, collide: 1,
        rot: Math.random() * U.TAU, rotV: (Math.random() - 0.5) * 14,
        spr: 'shard', frames: 6, size: 0.8, size1: 0.4,
        c0: CYAN0, c1: CYAN1, a0: 1, a1: 0, max: 0.9, lit: 1, emissive: 0.4
      });
    }
  };

  // A trail dot left behind something moving fast.
  Pt.trail = function (x, y, col, size, life) {
    Pt.spawn({
      x: x, y: y, drag: 3,
      spr: 'spark', size: size || 0.7, size1: 0.1,
      c0: col || ICE0, c1: col || ICE1, a0: 0.55, a1: 0,
      max: life || 0.22, add: 1
    });
  };

  // --- update --------------------------------------------------------------

  Pt.update = function (dt, windX) {
    var Chunks = IF.Chunks;
    windX = windX || 0;
    for (var i = live.length - 1; i >= 0; i--) {
      var p = live[i];
      p.life += dt;
      if (p.life >= p.max) {
        live[i] = live[live.length - 1];
        live.pop();
        pool.push(p);
        continue;
      }
      p.vx += (p.ax + windX * p.wind) * dt;
      p.vy += p.ay * dt;
      if (p.drag) {
        var d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      var nx = p.x + p.vx * dt;
      var ny = p.y + p.vy * dt;

      if (p.collide) {
        // Cheap two-axis resolve. Good enough for chips: they should skitter
        // off a ledge, not simulate.
        if (Chunks.solid(nx, p.y)) { p.vx = -p.vx * p.bounce; nx = p.x; p.rotV *= 0.6; }
        if (Chunks.solid(nx, ny)) {
          p.vy = -p.vy * p.bounce; ny = p.y;
          p.vx *= 0.62; p.rotV *= 0.5;
          if (Math.abs(p.vy) < 24) { p.vy = 0; p.ay = 0; p.rotV *= 0.3; }
        }
      }
      p.x = nx; p.y = ny;
      p.rot += p.rotV * dt;
    }
  };

  // Particles that emit light register with the light manager.
  Pt.addLights = function (Cam, Lights) {
    for (var i = 0; i < live.length; i++) {
      var p = live[i];
      if (p.lightR <= 0) continue;
      var t = p.life / p.max;
      var f = p.flick ? (0.7 + 0.3 * Math.sin(IF.time * 18 + p.x)) : 1;
      Lights.add(Cam.sx(p.x), Cam.sy(p.y), p.lightR * (1 - t * 0.4),
                 p.c0[0], p.c0[1], p.c0[2], p.lightI * (1 - t) * f, 10);
    }
  };

  // --- draw ----------------------------------------------------------------

  Pt.draw = function (Cam, additive) {
    var D = IF.Draw;
    var A = IF.Atlas;
    var want = additive ? 1 : 0;
    var any = false;
    for (var i = 0; i < live.length; i++) {
      if (live[i].add === want) { any = true; break; }
    }
    if (!any) return;

    D.useAtlas();
    D.blend(additive ? 'add' : 'normal');

    for (i = 0; i < live.length; i++) {
      var p = live[i];
      if (p.add !== want) continue;
      var sx = Cam.sx(p.x), sy = Cam.sy(p.y);
      if (sx < -40 || sx > C.W + 40 || sy < -40 || sy > C.H + 40) continue;

      var t = p.life / p.max;
      var col = [
        p.c0[0] + (p.c1[0] - p.c0[0]) * t,
        p.c0[1] + (p.c1[1] - p.c0[1]) * t,
        p.c0[2] + (p.c1[2] - p.c0[2]) * t
      ];
      var alpha = p.a0 + (p.a1 - p.a0) * t;
      if (alpha <= 0.004) continue;
      var size = p.size + (p.size1 - p.size) * t;

      var spr = p.spr;
      if (p.frames > 1) spr = spr + '_' + Math.min(p.frames - 1, (t * p.frames) | 0);

      var o = {
        scale: size, alpha: alpha, color: col,
        lit: p.lit, emissive: p.emissive, rot: p.rot
      };
      // Fast things stretch along their velocity, which is what turns a dot
      // into a streak without a second sprite.
      if (p.stretch) {
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (sp > 40) {
          o.rot = Math.atan2(p.vy, p.vx);
          o.sx = size * (1 + Math.min(3.4, sp / 190) * p.stretch);
          o.sy = size;
        }
      }
      D.sprite(spr, sx, sy, o);
    }
  };

  IF.Particles = Pt;
})();
