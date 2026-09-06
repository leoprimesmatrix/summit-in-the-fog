(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var COL = C.COLORS;

  // Atmosphere that grows with altitude. The parallax art gives the game its
  // three fixed backdrops; this layers the things that change as you rise
  // between them: the sun going down beneath your feet, a sea of cloud you
  // climb through and then look down on, the first stars at dusk, then the
  // moon, meteors and aurora curtains that strengthen all the way to the top.
  // Everything here keys off the climber's row so it is deterministic per
  // altitude, and everything static is baked once.

  var Sky = {};

  var built = false;
  var cloudLayers = [];   // { day, dusk, night, h, par, drift }
  var stars = [];
  var meteors = [];
  var lastT = null;
  var meteorAcc = 0;

  // Altitude curves. Keep these next to each other so the whole climb can be
  // read at once: what appears where, and how fast it settles.
  function sunDrop(rf)     { return U.smoothstep(20, 78, rf); }     // high in the haze -> below the cloud deck
  function cloudIn(rf)     { return U.smoothstep(34, 56, rf); }     // deck fades in as it descends to meet you
  function duskStars(rf)   { return U.smoothstep(66, 116, rf); }    // pinpricks before the night stack exists
  function moonRise(rf)    { return U.smoothstep(108, 148, rf); }
  function summitNear(rf)  { return U.smoothstep(120, 180, rf); }   // aurora and meteors ramp to the top

  // Seamless horizontal band with a soft top edge. Harmonics use whole
  // periods across the width, so the strip tiles without a seam.
  // Two tones below a bright rim: a lit crown that follows the top edge and
  // a shaded body underneath, so stacked layers read as separate banks.
  function strip(seed, h, crown, body, edge, edge2) {
    var cv = U.makeCanvas(C.W, h);
    var cx = cv.getContext('2d');
    var rnd = U.mulberry32(seed);
    // Long swells carry the shape; the short harmonics put the cauliflower
    // bumps on top that make it cloud and not water.
    var k = [2, 3, 5, 9, 17, 31, 53];
    var w = [0.34, 0.24, 0.16, 0.10, 0.08, 0.05, 0.03];
    var ph = [];
    for (var p = 0; p < k.length; p++) ph.push(rnd() * 6.283);
    for (var x = 0; x < C.W; x++) {
      var v = 0;
      for (var i = 0; i < k.length; i++) v += Math.sin(2 * Math.PI * k[i] * x / C.W + ph[i]) * w[i];
      var top = Math.round(h * 0.5 - v * h * 0.42);
      top = Math.max(0, Math.min(h - 2, top));
      var crownH = 9 + Math.round(4 * Math.sin(x * 0.21 + ph[1]) + 2 * Math.sin(x * 0.9 + ph[2]));
      cx.fillStyle = body;
      cx.fillRect(x, top, 1, h - top);
      cx.fillStyle = crown;
      cx.fillRect(x, top, 1, crownH);
      cx.fillStyle = edge;
      cx.fillRect(x, top, 1, 1);
      cx.fillStyle = edge2;
      cx.fillRect(x, top + 1, 1, 1);
    }
    return cv;
  }

  // One lit band, then its own colour flooded to the foot of the screen.
  function paintLayer(ctx, L, imgKey, bodyKey, alpha, off, yy) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(L[imgKey], Math.round(off), yy);
    ctx.drawImage(L[imgKey], Math.round(off) + C.W, yy);
    var below = C.H - (yy + L.h);
    if (below > 0) {
      ctx.fillStyle = L[bodyKey];
      ctx.fillRect(0, yy + L.h, C.W, below);
    }
  }

  function build() {
    if (built) return;
    built = true;

    // Three depths of cloud. Palettes for each light so the deck can be
    // cross-faded through the day rather than tinted at draw time.
    var defs = [
      { seed: 611, h: 44, par: 0.55, drift: 4.0 },
      { seed: 612, h: 52, par: 0.72, drift: 7.5 },
      { seed: 613, h: 60, par: 0.90, drift: 12.0 }
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var deep = i / (defs.length - 1);
      // Body colours are kept alongside the strips: below a strip the same
      // colour is flooded to the foot of the screen, so a bank never ends on
      // a ruled line partway down the frame.
      var bodyDay = U.mixHex('#c2d3e4', '#a4bbd1', deep);
      var bodyDusk = U.mixHex('#8a688a', '#54456c', deep);
      var bodyNight = U.mixHex('#1b2f48', '#101f34', deep);
      cloudLayers.push({
        h: d.h, par: d.par, drift: d.drift,
        bodyDay: bodyDay, bodyDusk: bodyDusk, bodyNight: bodyNight,
        day:   strip(d.seed, d.h, '#e8eff6', bodyDay, '#ffffff', '#f1f6fa'),
        dusk:  strip(d.seed, d.h, U.mixHex('#e3aaa3', '#a97d95', deep), bodyDusk, '#ffd9b0', U.mixHex('#f0b898', '#c58f98', deep)),
        night: strip(d.seed, d.h, U.mixHex('#3b5a7a', '#233a52', deep), bodyNight, U.mixHex(COL.accent, '#9fd8ff', 0.5), U.mixHex('#5f8fb3', '#3b5a7a', 0.5))
      });
    }

    var rnd = U.mulberry32(9090);
    for (var s = 0; s < 70; s++) {
      stars.push({
        x: Math.floor(rnd() * C.W), y: Math.floor(rnd() * 200),
        a: 0.35 + rnd() * 0.55, sp: 0.7 + rnd() * 2.4, ph: rnd() * 6.283,
        big: rnd() < 0.15
      });
    }
  }

  // Pixel disc: one fillRect per row, no anti-aliasing.
  function disc(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    for (var dy = -r; dy <= r; dy++) {
      var half = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
      ctx.fillRect(Math.round(x - half), Math.round(y + dy), half * 2 + 1, 1);
    }
  }

  function glow(ctx, x, y, r, hex, a) {
    if (a <= 0.002) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, U.rgba(hex, a));
    g.addColorStop(0.5, U.rgba(hex, a * 0.35));
    g.addColorStop(1, U.rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // ---- day: the sun -------------------------------------------------------
  // Drawn between the sky and the peak, so it sets behind the mountain.
  Sky.drawSun = function (ctx, rf, t, dayA) {
    build();
    var night = SITF.Parallax.nightAt(rf);
    // Gone by the time the ridge is dark; it has set into the cloud by then.
    var a = dayA * (1 - night) * (1 - U.smoothstep(78, 92, rf));
    if (a <= 0.01) return;
    var k = sunDrop(rf);
    var x = 428 + 36 * k;
    var y = 44 + 262 * k;
    var warm = U.smoothstep(0.35, 0.9, k);
    var col = U.mixHex('#fff4c8', '#ff8a3c', warm);
    ctx.save();
    ctx.globalAlpha = a;
    glow(ctx, x, y, 70 + 50 * warm, U.mixHex('#ffe9a8', '#ff7a3a', warm), 0.30 + 0.25 * warm);
    disc(ctx, x, y, 8 + Math.round(3 * warm), col);
    disc(ctx, x, y, 5, U.mixHex('#ffffff', '#ffd08a', warm));
    ctx.restore();
  };

  // Horizon glow through the dusk: the sky goes copper low down while the
  // top stays the deep blue of the tint the parallax already lays over it.
  Sky.drawDuskGlow = function (ctx, rf) {
    var dusk = SITF.Parallax.duskAt(rf);
    var night = SITF.Parallax.nightAt(rf);
    var a = dusk * (1 - night);
    if (a <= 0.01) return;
    ctx.save();
    var g = ctx.createLinearGradient(0, 110, 0, C.H);
    g.addColorStop(0, U.rgba('#ff8c4a', 0));
    g.addColorStop(0.55, U.rgba('#ff8c4a', 0.40 * a));
    g.addColorStop(1, U.rgba('#ff5f7a', 0.28 * a));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.restore();
  };

  // ---- stars, moon, meteors, curtains ------------------------------------
  function drawStars(ctx, t, a) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var k = a * s.a * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      if (k <= 0.02) continue;
      ctx.globalAlpha = Math.min(1, k);
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big && k > 0.45) {
        ctx.globalAlpha = k * 0.4;
        ctx.fillRect(s.x - 1, s.y, 1, 1); ctx.fillRect(s.x + 1, s.y, 1, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 1); ctx.fillRect(s.x, s.y + 1, 1, 1);
      }
    }
    ctx.restore();
  }

  function drawMoon(ctx, rf, t, a) {
    var k = moonRise(rf);
    if (k <= 0 || a <= 0.01) return;
    var x = 468, y = 296 - 186 * U.easeOutQuad(k);
    ctx.save();
    ctx.globalAlpha = a;
    glow(ctx, x, y, 46, '#dfe9ff', 0.22);
    disc(ctx, x, y, 7, '#f3f0dc');
    // Maria: a few darker pixels so it reads as the moon and not a lamp.
    ctx.fillStyle = '#cfc9b0';
    ctx.fillRect(Math.round(x) - 3, Math.round(y) - 2, 2, 2);
    ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, 3, 1);
    ctx.fillRect(Math.round(x) - 1, Math.round(y) + 3, 2, 1);
    ctx.fillRect(Math.round(x) + 2, Math.round(y) - 3, 1, 1);
    ctx.restore();
  }

  function stepMeteors(dt, rf, a) {
    var rate = a * (0.05 + 0.30 * summitNear(rf));
    meteorAcc += dt * rate;
    while (meteorAcc >= 1) {
      meteorAcc -= 1;
      meteors.push({
        x: Math.random() * C.W * 0.7, y: 6 + Math.random() * 60,
        vx: 180 + Math.random() * 120, vy: 50 + Math.random() * 40,
        age: 0, life: 0.6 + Math.random() * 0.4
      });
    }
    for (var i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      m.age += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.age >= m.life) meteors.splice(i, 1);
    }
  }

  function drawMeteors(ctx, a) {
    if (meteors.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < meteors.length; i++) {
      var m = meteors[i];
      var k = m.age / m.life;
      var fade = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * a;
      for (var j = 0; j < 12; j++) {
        var f = j / 12;
        ctx.globalAlpha = fade * (1 - f) * 0.8;
        ctx.fillStyle = j < 3 ? '#ffffff' : COL.text;
        ctx.fillRect(Math.round(m.x - m.vx * f * 0.05), Math.round(m.y - m.vy * f * 0.05), 1, 1);
      }
    }
    ctx.restore();
  }

  // Slow vertical curtains over the aurora art, brighter and more of them
  // as the summit approaches. Additive, so they lift what is already there.
  function drawCurtains(ctx, rf, t, a) {
    var k = a * (0.25 + 0.75 * summitNear(rf));
    if (k <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 4; i++) {
      var cx = 90 + i * 130 + Math.sin(t * (0.11 + i * 0.03) + i * 1.7) * 70;
      var w = 50 + 30 * Math.sin(t * 0.23 + i);
      var top = 10 + 14 * Math.sin(t * 0.17 + i * 2.1);
      var g = ctx.createLinearGradient(0, top, 0, top + 190);
      var col = (i % 2 === 0) ? COL.accent : '#7ad0ff';
      g.addColorStop(0, U.rgba(col, 0.11 * k));
      g.addColorStop(0.5, U.rgba(col, 0.05 * k));
      g.addColorStop(1, U.rgba(col, 0));
      ctx.fillStyle = g;
      // Soft sides: three overlapping bands instead of one hard column.
      ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.round(cx - w), top, Math.round(w * 2), 190);
      ctx.fillRect(Math.round(cx - w * 0.6), top, Math.round(w * 1.2), 190);
      ctx.fillRect(Math.round(cx - w * 0.25), top, Math.round(w * 0.5), 190);
    }
    ctx.restore();
  }

  // Called from the night stack after the aurora art, before the peaks.
  Sky.drawNightSky = function (ctx, rf, t, nightA) {
    build();
    var dt = (lastT == null) ? 0 : U.clamp(t - lastT, 0, 0.1);
    lastT = t;
    var summit = summitNear(rf);
    stepMeteors(dt, rf, nightA);
    drawCurtains(ctx, rf, t, nightA);
    drawStars(ctx, t, nightA * (0.6 + 0.4 * summit));
    drawMeteors(ctx, nightA);
    drawMoon(ctx, rf, t, nightA);
  };

  // Called from the day stack once dusk begins: the first stars, before the
  // night art has faded in at all.
  Sky.drawDuskStars = function (ctx, rf, t, dayA) {
    build();
    var night = SITF.Parallax.nightAt(rf);
    drawStars(ctx, t, dayA * duskStars(rf) * (1 - night) * 0.7);
  };

  // ---- the cloud deck -----------------------------------------------------
  // The sea of cloud you rise out of. It fades in through the treeline, then
  // settles into a bank along the foot of the screen that sinks a little
  // further away with altitude and takes the colour of whatever light is on
  // it. It stays below the climber so it never fights the route for
  // attention, and every layer floods to the bottom of the frame: a bank that
  // stopped at the foot of its strip left a ruled line across the view.
  Sky.drawClouds = function (ctx, rf, t) {
    build();
    var a = cloudIn(rf);
    if (a <= 0.01) return;
    var dusk = SITF.Parallax.duskAt(rf);
    var night = SITF.Parallax.nightAt(rf);
    var wDay = 1 - dusk, wDusk = dusk * (1 - night), wNight = night;
    var d = Math.max(0, (rf - 54) * C.ROW_H);

    ctx.save();
    var seaTop = C.H;
    for (var i = 0; i < cloudLayers.length; i++) {
      var L = cloudLayers[i];
      // Perspective: the deck falls away quickly at first, then converges.
      var y = 258 + i * 7 + 26 * (1 - Math.exp(-d / 900));
      var off = -((t * L.drift) % C.W);
      var yy = Math.round(y);
      if (yy < seaTop) seaTop = yy;
      var layerA = a * (0.7 + 0.3 * (i / (cloudLayers.length - 1)));
      paintLayer(ctx, L, 'day', 'bodyDay', layerA * wDay, off, yy);
      paintLayer(ctx, L, 'dusk', 'bodyDusk', layerA * wDusk, off, yy);
      paintLayer(ctx, L, 'night', 'bodyNight', layerA * wNight, off, yy);
    }
    ctx.restore();

    // Light on the sea. The setting sun spills warmth across the tops
    // nearest it; under the aurora the whole deck picks up a cold sheen that
    // grows toward the summit.
    if (seaTop < C.H && d > 0) {
      var sunK = sunDrop(rf);
      var sunA = a * wDusk * (1 - U.smoothstep(78, 92, rf)) * U.smoothstep(0.5, 0.9, sunK);
      if (sunA > 0.01) glow(ctx, 428 + 36 * sunK, seaTop + 22, 150, '#ff9a5c', 0.28 * sunA);
      var auroraA = a * wNight * (0.4 + 0.6 * summitNear(rf));
      if (auroraA > 0.01) {
        // Ramped in from well above the cloud tops: a gradient that began at
        // the sea's top edge put a ruled line right across the frame.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var gTop = Math.max(0, Math.round(seaTop) - 54);
        var sg = ctx.createLinearGradient(0, gTop, 0, C.H);
        sg.addColorStop(0, U.rgba(COL.accent, 0));
        sg.addColorStop(0.45, U.rgba(COL.accent, 0.14 * auroraA));
        sg.addColorStop(1, U.rgba(COL.accent, 0));
        ctx.fillStyle = sg;
        ctx.fillRect(0, gTop, C.W, C.H - gTop);
        ctx.restore();
      }
    }
  };

  Sky.reset = function () { meteors.length = 0; meteorAcc = 0; lastT = null; };

  SITF.Sky = Sky;
})();
