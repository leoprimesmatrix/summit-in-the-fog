// Air.
//
// Snow, wind, gusts, lightning and the near-field rock that passes between
// you and the camera. All of it exists for one reason: a flat 2-D frame has
// no depth until something moves through the space in front of the subject.
//
// The snow lives in screen space with a depth value, and the camera's own
// motion is fed back into it as parallax. That keeps the count fixed - no
// spawning, no culling - while still reading as a volume you are moving
// through.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Wx = {};

  var FLAKES = 300;
  var flakes = [];
  var lastCamY = 0;

  // Wind is a slow base plus gusts that arrive, peak and pass.
  var windBase = 0, windTarget = 0, windGust = 0, gustT = 0, gustNext = 4;
  var wind = 0;

  var flashLevel = 0, flashNext = 6, flashCol = [0.7, 0.8, 1];
  var boltT = 0, boltX = 0, boltSeed = 0;

  // Near-field rock. Placed once in world space, drawn in front of everything
  // at greater than one parallax so it rushes past.
  var fg = [];

  Wx.init = function () {
    flakes.length = 0;
    var rng = U.rng(9091);
    for (var i = 0; i < FLAKES; i++) {
      var depth = Math.pow(rng(), 0.7);
      flakes.push({
        x: rng() * (C.W + 60) - 30,
        y: rng() * (C.H + 60) - 30,
        d: depth,
        sway: rng() * U.TAU,
        swayF: 0.6 + rng() * 2.2,
        swayA: 2 + depth * 9,
        spin: (rng() - 0.5) * 4,
        rot: rng() * U.TAU,
        big: depth > 0.86 && rng() < 0.35
      });
    }

    fg.length = 0;
    var r2 = U.rng(3771);
    var y = C.WORLD_H - 300;
    while (y > 200) {
      y -= 520 + r2() * 900;
      var side = r2() < 0.5 ? 0 : 1;
      fg.push({
        y: y,
        // Anchored to the frame edge and only ever a fifth of the width in,
        // so it never covers the line you are trying to read.
        x: side ? C.W + 4 : -4,
        s: 0.55 + r2() * 0.65,
        v: (r2() * 4) | 0,
        flip: side === 1,
        par: 1.18 + r2() * 0.28
      });
    }
    lastCamY = C.WORLD_H;
  };

  Wx.reset = function (camY) {
    lastCamY = camY;
    wind = windBase = windTarget = 0;
    windGust = 0; gustT = 0; gustNext = 3 + Math.random() * 4;
    flashLevel = 0; flashNext = 5 + Math.random() * 8; boltT = 0;
  };

  Wx.wind = function () { return wind; };
  Wx.flash = function () { return flashLevel; };
  Wx.flashColor = function () { return flashCol; };
  Wx.gusting = function () { return windGust > 0.35; };

  // zone: the blended zone description. `stormy` enables lightning.
  Wx.update = function (dt, camY, zone, stormy) {
    // Wind: a lazy target the base chases, plus gusts on their own clock.
    if (Math.random() < dt * 0.25) {
      windTarget = (Math.random() * 2 - 1) * zone.windVar;
    }
    windBase = U.approach(windBase, windTarget, 1.4, dt);

    gustT -= dt;
    if (gustT <= 0) {
      gustT = gustNext;
      gustNext = 4 + Math.random() * 7;
      windGust = 1;
      if (IF.Audio) IF.Audio.playVar('sfx_gust', 0.7, 0.2);
    }
    // A gust ramps in fast and decays slowly, which is what wind does.
    windGust = Math.max(0, windGust - dt * 0.55);
    var gustShape = windGust > 0.82 ? U.map(windGust, 1, 0.82, 0, 1) : windGust / 0.82;
    wind = windBase + Math.sign(windTarget || 1) * zone.wind * gustShape * 1.5;

    // Lightning.
    if (stormy) {
      flashNext -= dt;
      if (flashNext <= 0) {
        flashNext = 3.5 + Math.random() * 9;
        flashLevel = 0.55 + Math.random() * 0.5;
        boltT = 0.22;
        boltX = 40 + Math.random() * (C.W - 80);
        boltSeed = (Math.random() * 10000) | 0;
        if (IF.Audio) IF.Audio.playVar('sfx_thunder', 0.8, 0.15);
      }
    }
    flashLevel = Math.max(0, flashLevel - dt * 4.5);
    boltT = Math.max(0, boltT - dt);

    // Snow, with the camera's motion folded in as parallax.
    var camDelta = camY - lastCamY;
    lastCamY = camY;
    var fall = 40 + zone.snow * 130;
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      var near = 0.3 + f.d * 1.5;
      f.sway += f.swayF * dt;
      f.x += (wind * near * 0.9 + Math.cos(f.sway) * f.swayA) * dt;
      f.y += fall * near * dt - camDelta * (0.25 + f.d * 0.85);
      f.rot += f.spin * dt;

      if (f.y > C.H + 30) { f.y -= C.H + 60; f.x = Math.random() * (C.W + 60) - 30; }
      else if (f.y < -30) { f.y += C.H + 60; f.x = Math.random() * (C.W + 60) - 30; }
      if (f.x > C.W + 30) f.x -= C.W + 60;
      else if (f.x < -30) f.x += C.W + 60;
    }
  };

  // Snow is drawn in two passes so the near flakes can sit in front of the
  // climber while the far ones sit behind him.
  Wx.drawSnow = function (density, tint, nearOnly, farOnly) {
    var D = IF.Draw;
    D.useAtlas();
    D.blend('normal');
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      if (nearOnly && f.d < 0.62) continue;
      if (farOnly && f.d >= 0.62) continue;
      var a = (0.16 + f.d * 0.62) * density;
      if (a <= 0.01) continue;
      var s = 0.35 + f.d * 1.5;
      if (f.big) {
        D.sprite('flake', f.x, f.y, {
          scale: s * 0.9, alpha: a * 0.85, color: tint, lit: 0, rot: f.rot
        });
      } else {
        D.sprite('snow_' + (f.d > 0.7 ? 2 : (f.d > 0.4 ? 1 : 0)), f.x, f.y, {
          scale: s, alpha: a, color: tint, lit: 0
        });
      }
    }
  };

  // The lightning bolt itself: a jagged additive line, two frames long.
  Wx.drawBolt = function () {
    if (boltT <= 0) return;
    var D = IF.Draw;
    D.useAtlas();
    D.blend('add');
    var a = (boltT / 0.22);
    var x = boltX, y = -10;
    var rng = U.rng(boltSeed);
    var col = [0.85, 0.92, 1];
    while (y < C.H * 0.62) {
      var nx = x + (rng() - 0.5) * 34;
      var ny = y + 14 + rng() * 22;
      D.line(x, y, nx, ny, 2.2, col, a * 0.9);
      D.line(x, y, nx, ny, 6, col, a * 0.22);
      if (rng() < 0.22) {
        // A fork that dies out quickly.
        var fx = nx + (rng() - 0.5) * 60, fy = ny + 20 + rng() * 30;
        D.line(nx, ny, fx, fy, 1.4, col, a * 0.5);
      }
      x = nx; y = ny;
    }
  };

  // Near-field rock, drawn last and dark. It is out of focus by being flat:
  // no lighting, no detail, just mass moving past at the wrong speed.
  Wx.drawForeground = function (camY, hazeCol, alpha) {
    var D = IF.Draw;
    D.useAtlas();
    D.blend('normal');
    for (var i = 0; i < fg.length; i++) {
      var o = fg[i];
      var sy = o.y - camY * o.par + (C.WORLD_H * (o.par - 1));
      if (sy < -260 || sy > C.H + 260) continue;
      D.sprite('fgrock_' + o.v, o.x, sy, {
        scale: o.s, alpha: alpha * 0.94, flipX: o.flip,
        // Near-black but not black: a silhouette that keeps a little of the
        // air's colour still reads as being in the same world.
        color: [hazeCol[0] * 0.34 + 0.02, hazeCol[1] * 0.36 + 0.02, hazeCol[2] * 0.44 + 0.03],
        lit: 0
      });
    }
  };

  Wx.flakes = function () { return flakes; };

  IF.Weather = Wx;
})();
