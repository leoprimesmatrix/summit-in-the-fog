// The avalanche.
//
// A line that climbs the mountain behind you and does not stop. It is not
// really a hazard - it is a clock you can see, and the reason a route you
// could pick apart at leisure has to be read at speed.
//
// It has one mercy and one cruelty. The mercy: light a cairn and it is shoved
// back down the face. The cruelty: get too far ahead and it speeds up, so
// running away perfectly is never the answer either.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Av = {};

  var Cam, D, Pt, Aud;
  var y = 0;
  var speed = 0;
  var roar = 0;
  var active = false;
  var t = 0;
  var pushT = 0;
  var caught = false;

  // The churning top edge, sampled across the frame and integrated over time
  // so it boils rather than sliding.
  var CREST = 42;
  var crest = new Float32Array(CREST);
  var crestV = new Float32Array(CREST);

  Av.reset = function (startY) {
    Cam = IF.Camera; D = IF.Draw; Pt = IF.Particles; Aud = IF.Audio;
    y = startY + C.AVALANCHE_START;
    speed = 0; roar = 0; t = 0; pushT = 0;
    active = false; caught = false;
    for (var i = 0; i < CREST; i++) { crest[i] = 0; crestV[i] = 0; }
  };

  Av.y = function () { return y; };
  Av.active = function () { return active; };
  Av.start = function () { active = true; };
  Av.caught = function () { return caught; };
  Av.distanceTo = function (py) { return y - py; };

  // A lit cairn shoves it back down the mountain.
  Av.push = function (amount) {
    y += amount === undefined ? C.CAIRN_PUSHBACK : amount;
    pushT = 1;
    Aud.playVar('sfx_gust', 0.8, 0.1);
  };

  Av.update = function (dt, player, zone) {
    t += dt;
    pushT = Math.max(0, pushT - dt * 1.4);

    for (var i = 0; i < CREST; i++) {
      // A loose spring per column, kicked by noise: cheap boiling.
      var target = (U.noise1(t * 1.6 + i * 0.7, 17 + i) - 0.5) * 26 +
                   (U.noise1(t * 0.5 + i * 0.31, 71) - 0.5) * 34;
      crestV[i] += (target - crest[i]) * 22 * dt;
      crestV[i] *= Math.exp(-4.5 * dt);
      crest[i] += crestV[i] * dt;
    }

    if (!active) return;

    var target = zone.avalanche;
    // Too far ahead and it closes; that is the whole tension.
    var gap = y - player.cy();
    if (gap > C.AVALANCHE_CATCHUP_GAP) target *= C.AVALANCHE_CATCHUP_MULT;
    else if (gap < 220) target *= 0.82;      // a hair of mercy up close
    speed = U.approach(speed, target, 1.2, dt);
    y -= speed * dt;

    // It never sits on top of you the instant a cairn lights.
    if (gap < C.AVALANCHE_LEAD_MIN && pushT > 0) y = player.cy() + C.AVALANCHE_LEAD_MIN;

    // Proximity: a roar that rises, and snow torn off the crest.
    var screenGap = y - Cam.y;
    roar = U.clamp01(1 - (y - player.cy()) / 520);
    Aud.bed('amb_storm', Math.max(roar * 0.9, zone.snow * 0.35));

    if (screenGap < C.H + 90 && screenGap > -120) {
      var n = Math.round(dt * (30 + roar * 90));
      for (i = 0; i < n; i++) {
        var px = Math.random() * C.W;
        Pt.spawn({
          x: px, y: y + crestAt(px) - Math.random() * 14,
          vx: (Math.random() - 0.5) * 130, vy: -40 - Math.random() * 170,
          ay: 190, drag: 0.9, wind: 0.5,
          spr: 'snow_' + (Math.random() * 3 | 0),
          size: 1 + Math.random() * 2.4, size1: 3 + Math.random() * 2,
          c0: [1, 1, 1], c1: [0.78, 0.86, 0.94],
          a0: 0.5 + Math.random() * 0.4, a1: 0,
          max: 0.7 + Math.random() * 1.1
        });
      }
    }

    if (!player.dead && !player.won && player.cy() > y + crestAt(player.cx()) - 4) {
      caught = true;
    }
  };

  function crestAt(x) {
    var f = U.clamp(x / C.W * (CREST - 1), 0, CREST - 1);
    var i = f | 0;
    var k = f - i;
    var a = crest[i], b = crest[Math.min(CREST - 1, i + 1)];
    return a + (b - a) * k;
  }
  Av.crestAt = crestAt;

  Av.addLights = function (Lights) {
    if (!active) return;
    var sy = Cam.sy(y);
    if (sy > C.H + 140 || sy < -160) return;
    // The mass is bright: it should throw light up onto the wall above it.
    for (var i = 0; i < 3; i++) {
      var x = (i + 0.5) / 3 * C.W;
      Lights.addHex(Cam.sx(x), sy + crestAt(x) + 16, 120, '#dceaf8', 0.30, 34);
    }
  };

  Av.draw = function () {
    if (!active) return;
    var sy = Cam.sy(y);
    if (sy > C.H + 120) return;

    D.useAtlas();
    D.blend('normal');

    var step = C.W / (CREST - 1);
    var bottom = C.H + 20;

    // The body: a solid mass under a boiling crest, in three bands so it has
    // depth rather than reading as a white rectangle.
    var B = IF.Batch;
    var f = IF.Atlas.get('white');
    var u = (f.u0 + f.u1) * 0.5, v = (f.v0 + f.v1) * 0.5;
    var par = B.params(0, 0, 0, 0);
    var cTop = B.color(0.93, 0.96, 1.00, 1);
    var cMid = B.color(0.70, 0.78, 0.88, 1);
    var cLow = B.color(0.44, 0.52, 0.66, 1);

    for (var i = 0; i < CREST - 1; i++) {
      var x0 = i * step, x1 = x0 + step;
      var y0 = sy + crest[i], y1 = sy + crest[i + 1];
      if (y0 > bottom && y1 > bottom) continue;
      B.free(x0, y0, x1, y1, x1, y1 + 26, x0, y0 + 26, u, v, u, v, cTop, par);
      B.free(x0, y0 + 26, x1, y1 + 26, x1, y1 + 90, x0, y0 + 90, u, v, u, v, cMid, par);
      B.free(x0, Math.min(y0 + 90, bottom), x1, Math.min(y1 + 90, bottom),
             x1, bottom + 40, x0, bottom + 40, u, v, u, v, cLow, par);
    }

    // Blocks tumbling in the front of it.
    var rng = U.rng(((t * 3) | 0) * 977 + 13);
    for (i = 0; i < 9; i++) {
      var bx = rng() * C.W;
      var by = sy + crestAt(bx) + 6 + rng() * 46;
      if (by > bottom) continue;
      D.sprite('boulder0_' + ((i + ((t * 2) | 0)) % 4), bx, by, {
        rot: t * 2 + i, lit: 1, normal: 0.6, alpha: 0.85,
        scale: 0.5 + rng() * 0.7
      });
    }
  };

  Av.drawGlow = function () {
    if (!active) return;
    var sy = Cam.sy(y);
    if (sy > C.H + 120 || sy < -180) return;
    D.useAtlas();
    D.blend('add');
    var step = C.W / (CREST - 1);
    for (var i = 0; i < CREST; i += 3) {
      var x = i * step;
      D.glow(x, sy + crest[i] + 5, 26, '#eaf4ff', 0.10);
    }
    D.blend('normal');
  };

  Av.roar = function () { return roar; };

  IF.Avalanche = Av;
})();
