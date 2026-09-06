(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Part = SITF.Particles;

  // Fog is composed at half resolution and upscaled, which keeps the noise
  // chunky and in keeping with the pixel art rather than smoothly gradient.
  var LOW_W = C.W / 2, LOW_H = C.H / 2;

  var F = {
    gustTimer: 1.5,
    gustProgress: -1,
    gustDelayLeft: 0,
    gustPending: false,
    gustReveal: 7,
    lanternAlpha: 0,
    clearings: [],       // {row, lane}
    frontRow: C.WHITEOUT_START_ROW,
    globalReveal: 0,
    blowing: false,
    surge: 0
  };

  var low = null, lowCtx = null;
  var tileA = null, tileB = null;

  function blobTile(w, h, count, rMin, rMax, seed, color) {
    var big = U.makeCanvas(w, h);
    var cx = big.getContext('2d');
    var rnd = U.mulberry32(seed);
    for (var i = 0; i < count; i++) {
      var bx = rnd() * w;
      var by = rnd() * h;
      var r = rMin + rnd() * (rMax - rMin);
      var a = 0.05 + rnd() * 0.05;
      // Draw at three x positions so the tile wraps horizontally.
      for (var k = -1; k <= 1; k++) {
        var g = cx.createRadialGradient(bx + k * w, by, 0, bx + k * w, by, r);
        g.addColorStop(0, U.rgba(color, a));
        g.addColorStop(0.6, U.rgba(color, a * 0.5));
        g.addColorStop(1, U.rgba(color, 0));
        cx.fillStyle = g;
        cx.fillRect(bx + k * w - r, by - r, r * 2, r * 2);
      }
    }
    // Quantise to half res and back up for chunky pixels.
    var small = U.makeCanvas(Math.round(w / 2), Math.round(h / 2));
    var scx = small.getContext('2d');
    scx.imageSmoothingEnabled = false;
    scx.drawImage(big, 0, 0, small.width, small.height);
    return small;
  }

  F.build = function () {
    low = U.makeCanvas(LOW_W, LOW_H);
    lowCtx = low.getContext('2d');
    lowCtx.imageSmoothingEnabled = false;
    tileA = blobTile(C.W, C.H, 140, 18, 48, 1337, C.COLORS.fog);
    tileB = blobTile(C.W, C.H, 90, 30, 64, 9001, C.COLORS.fog);
  };

  F.reset = function () {
    F.gustTimer = 1.5;
    F.gustProgress = -1;
    F.gustDelayLeft = 0;
    F.gustPending = false;
    F.gustReveal = C.ZONES[0].revealRows;
    F.lanternAlpha = 0;
    F.clearings.length = 0;
    F.frontRow = C.WHITEOUT_START_ROW;
    F.globalReveal = 0;
    F.blowing = false;
    F.surge = 0;
  };

  F.addClearing = function (row, lane) {
    F.clearings.push({ row: row, lane: lane, age: 0 });
  };

  // Clearings open up over a moment rather than appearing at full size.
  F.clearingRadius = function (cl) {
    var k = U.clamp((cl.age == null ? 1 : cl.age) / 0.7, 0, 1);
    return C.CAIRN_CLEAR_RADIUS * U.easeOutCubic(k);
  };

  F.tick = function (dt) {
    for (var i = 0; i < F.clearings.length; i++) F.clearings[i].age += dt;
  };

  F.pushWhiteout = function () {
    F.frontRow = Math.max(C.WHITEOUT_START_ROW, F.frontRow - C.CAIRN_PUSHBACK_ROWS);
  };

  F.blowAway = function () { F.blowing = true; };

  F.isGusting = function () { return F.gustProgress >= 0; };


  // Seconds until the next gust actually starts revealing.
  F.timeToGust = function () {
    if (F.gustProgress >= 0) return 0;
    return F.gustTimer + (F.gustPending ? F.gustDelayLeft : 0);
  };

  // --- gust ---------------------------------------------------------------

  // `suppress` stops new gusts starting (the storm has the wind), but a gust
  // already sweeping must still be allowed to finish: freezing one mid-sweep
  // leaves the face permanently open behind it.
  F.updateGust = function (dt, zone, onFire, suppress) {
    if (suppress && F.gustProgress < 0) {
      F.gustTimer = Math.max(F.gustTimer, 0.6);
      F.gustPending = false;
      F.gustDelayLeft = 0;
      return;
    }
    if (F.blowing) {
      F.globalReveal = Math.min(1, F.globalReveal + dt / 2.0);
      return;
    }

    if (F.gustProgress >= 0) {
      F.gustProgress += dt / C.GUST_DURATION;
      if (F.gustProgress >= 1) {
        F.gustProgress = -1;
        F.gustTimer = zone.gustInterval;
      }
      return;
    }

    if (F.gustPending) {
      F.gustDelayLeft -= dt;
      if (F.gustDelayLeft <= 0) {
        F.gustPending = false;
        F.gustProgress = 0;
      }
      return;
    }

    F.gustTimer -= dt;
    if (F.gustTimer <= 0) {
      F.gustReveal = zone.revealRows;
      if (onFire) onFire(zone);
      if (zone.gustDelay > 0) {
        // The whoosh arrives before the reveal: you hear it, then it clears.
        F.gustPending = true;
        F.gustDelayLeft = zone.gustDelay;
      } else {
        F.gustProgress = 0;
      }
    }
  };

  F.gustWipeX = function () {
    if (F.gustProgress < 0) return -100;
    var p = Math.min(1, F.gustProgress / C.GUST_WIPE_PORTION);
    return U.lerp(-80, C.W + 80, U.easeOutQuad(p));
  };

  F.gustAlpha = function () {
    if (F.gustProgress < 0) return 0;
    var fadeStart = 1 - C.GUST_FADE_PORTION;
    if (F.gustProgress <= fadeStart) return 1;
    return 1 - (F.gustProgress - fadeStart) / C.GUST_FADE_PORTION;
  };

  // --- whiteout -----------------------------------------------------------

  // `mult` is the weather's contribution: 1 in calm air, more in a storm, and
  // 0 while the climber is sheltering somewhere the front cannot pass.
  F.updateWhiteout = function (dt, climberRow, zone, mult) {
    var speed = zone.whiteoutSpeed * (mult == null ? 1 : mult);
    if (climberRow - F.frontRow > C.WHITEOUT_CATCHUP_GAP) speed *= C.WHITEOUT_CATCHUP_MULT;
    F.frontRow += speed * dt;
  };

  // --- lantern ------------------------------------------------------------

  F.updateLantern = function (dt, idleTime, fast) {
    var delay = fast ? 0.04 : C.LANTERN_DELAY;
    var fade = fast ? 0.16 : C.LANTERN_FADE;
    if (idleTime >= delay) {
      F.lanternAlpha = Math.min(1, F.lanternAlpha + dt / fade);
    } else {
      F.lanternAlpha = 0;
    }
  };

  F.resetLantern = function () { F.lanternAlpha = 0; };

  // --- drawing ------------------------------------------------------------

  // view: {toScreenY(worldY), climberRowFloat, density, color, lanternTargets:[{x,y}]}
  F.draw = function (ctx, view) {
    if (!low) return;
    var t = SITF.time;
    var density = U.clamp(view.density, 0, 1);
    var color = view.color || C.COLORS.fog;

    lowCtx.setTransform(1, 0, 0, 1, 0, 0);
    lowCtx.globalCompositeOperation = 'source-over';
    lowCtx.globalAlpha = 1;
    lowCtx.clearRect(0, 0, LOW_W, LOW_H);

    // Everything below is in half-res coordinates.
    var fogLineY = (view.fogLineY) / 2;

    // Bank of fog above the climber. Its lower edge rolls rather than sitting
    // on a ruled line, so it reads as weather instead of a UI element.
    // The skirt is a per-pixel ramp rather than three wide steps: stepping it
    // put visible bands, and starting the first step at 0.45 left a ruled
    // line where the solid bank ended. It now leaves the bank at nearly full
    // strength and falls away over 32 real pixels.
    var skirt = 16; // half-res px (32 real)
    lowCtx.fillStyle = color;

    for (var x = 0; x < LOW_W; x += 2) {
      var wob = Math.sin(x * 0.09 + t * 0.7) * 3.5 +
                Math.sin(x * 0.023 - t * 0.45) * 2.5;
      var lineY = fogLineY + wob;

      lowCtx.globalAlpha = density;
      if (lineY > 0) lowCtx.fillRect(x, 0, 2, lineY);

      // Each column's steps sit at a different sub-pixel offset, so the ramp
      // does not quantise into bands that line up across the screen.
      var jitter = ((x * 7919) % 32) / 32;
      for (var i = 0; i < skirt; i++) {
        var u = (i + 1) / skirt;
        lowCtx.globalAlpha = density * (1 - u) * (1 - u);
        lowCtx.fillRect(x, lineY + i + jitter, 2, 1);
      }
    }
    lowCtx.globalAlpha = 1;

    // Drifting cloud layers inside the bank. The clip used to stop dead at
    // the foot of the skirt, which showed as a rule straight across the
    // screen; the last rows are now faded out one at a time instead.
    var ax = Math.round(-((t * 8) % C.W) / 2);
    var bx = Math.round(((t * 5) % C.W) / 2);
    var by = Math.round(Math.sin(t * 0.3) * 3);
    var tileBottom = Math.max(0, fogLineY + skirt);
    var tileFade = 20;
    var solidBottom = Math.max(0, Math.floor(tileBottom - tileFade));

    lowCtx.save();
    lowCtx.beginPath();
    lowCtx.rect(0, 0, LOW_W, solidBottom);
    lowCtx.clip();
    lowCtx.globalAlpha = density * 0.9;
    lowCtx.drawImage(tileA, ax, 0);
    lowCtx.drawImage(tileA, ax + LOW_W, 0);
    lowCtx.globalAlpha = density * 0.7;
    lowCtx.drawImage(tileB, bx - LOW_W, by);
    lowCtx.drawImage(tileB, bx, by);
    lowCtx.restore();

    for (var s = 0; s < tileFade; s++) {
      var ty = solidBottom + s;
      if (ty >= LOW_H || ty >= tileBottom) break;
      var tf = 1 - (s + 1) / tileFade;
      tf *= tf;
      tileRow(tileA, ax, ty, ty, density * 0.9 * tf);
      tileRow(tileA, ax + LOW_W, ty, ty, density * 0.9 * tf);
      tileRow(tileB, bx - LOW_W, ty, ty - by, density * 0.7 * tf);
      tileRow(tileB, bx, ty, ty - by, density * 0.7 * tf);
    }
    lowCtx.globalAlpha = 1;

    // ---- punch the reveals out of the fog ----
    lowCtx.globalCompositeOperation = 'destination-out';

    // Gust: a band covering the next N rows, wiped in from the left.
    if (F.gustProgress >= 0) {
      var ga = F.gustAlpha();
      var wipeX = F.gustWipeX() / 2;
      var topY = (view.toScreenY(-(view.climberRowFloat + F.gustReveal) * C.ROW_H) - C.ROW_H * 0.6) / 2;
      var botY = fogLineY + skirt;
      var h = botY - topY;
      if (h > 0 && wipeX > -40) {
        // Not a full punch: the wind thins the fog rather than deleting it,
        // so the mountain behind stays atmospheric.
        ga *= 0.82;
        lowCtx.fillStyle = '#000';
        var bw = Math.max(0, wipeX);
        // The top of the cleared band used to be a rectangle edge, which read
        // as a ruled line straight across the sky. It now feathers in over
        // 24 real pixels, and the leading edge is ramped in finer columns.
        var feather = Math.min(12, Math.floor(h));
        var ec = 6, ew = 4;
        for (var s = 0; s < feather; s++) {
          var v = (s + 1) / feather;
          v *= v;
          lowCtx.globalAlpha = ga * v;
          lowCtx.fillRect(0, topY + s, bw, 1);
          for (var e = 0; e < ec; e++) {
            lowCtx.globalAlpha = ga * v * (1 - (e + 0.5) / ec);
            lowCtx.fillRect(wipeX + e * ew, topY + s, ew, 1);
          }
        }
        var restY = topY + feather, restH = h - feather;
        if (restH > 0) {
          lowCtx.globalAlpha = ga;
          lowCtx.fillRect(0, restY, bw, restH);
          for (var e2 = 0; e2 < ec; e2++) {
            lowCtx.globalAlpha = ga * (1 - (e2 + 0.5) / ec);
            lowCtx.fillRect(wipeX + e2 * ew, restY, ew, restH);
          }
        }
      }
    }

    // The lantern deliberately does not thin the fog: cutting a window here
    // would show the scenery behind it. The ledge it finds is instead drawn
    // on top of the fog, so it reads as a shape emerging from the murk.

    // Cairns thin the fog slightly around themselves, for the rest of the run.
    if (view.clearingPoints) {
      for (var ci = 0; ci < view.clearingPoints.length; ci++) {
        var cp = view.clearingPoints[ci];
        punchRadial(cp.x / 2, cp.y / 2, (cp.r != null ? cp.r : C.CAIRN_CLEAR_RADIUS) / 2, 0.34, 0.5);
      }
    }

    // The climber's own body pushes a little fog aside as they land.
    if (view.echo && view.echo.alpha > 0) {
      punchRadial(view.echo.x / 2, view.echo.y / 2, view.echo.r / 2, view.echo.alpha * 0.55, 0.55);
    }

    // A burning flare drives the fog back around itself: the one reveal you
    // can see happening rather than simply having.
    if (view.flare && view.flare.alpha > 0.01) {
      punchRadial(view.flare.x / 2, view.flare.y / 2, view.flare.radius / 2,
                  view.flare.alpha * 0.9, 0.35);
    }

    // Summit: the whole sky clears.
    if (F.globalReveal > 0) {
      lowCtx.globalAlpha = F.globalReveal;
      lowCtx.fillStyle = '#000';
      lowCtx.fillRect(0, 0, LOW_W, LOW_H);
    }

    lowCtx.globalCompositeOperation = 'source-over';
    lowCtx.globalAlpha = 1;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, C.W, C.H);
    ctx.restore();
  };

  // One destination row of a tile, so the bank's texture can be faded out
  // row by row instead of clipped off.
  function tileRow(img, dx, dy, srcY, alpha) {
    if (alpha <= 0.003 || srcY < 0 || srcY >= img.height) return;
    lowCtx.globalAlpha = alpha;
    lowCtx.drawImage(img, 0, srcY, img.width, 1, dx, dy, img.width, 1);
  }

  function punchRadial(x, y, r, alpha, softFrom) {
    if (r <= 0 || alpha <= 0) return;
    var g = lowCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + alpha + ')');
    g.addColorStop(softFrom, 'rgba(0,0,0,' + alpha * 0.85 + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lowCtx.globalAlpha = 1;
    lowCtx.fillStyle = g;
    lowCtx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // The rising whiteout, drawn on the main canvas above the fog.
  F.drawWhiteout = function (ctx, frontScreenY) {
    var t = SITF.time;
    var yBase = frontScreenY - F.surge * C.H;
    if (yBase > C.H + 20) return;

    ctx.save();

    // Dithered leading band above the solid front.
    ctx.fillStyle = C.COLORS.whiteoutEdge;
    for (var x = 0; x < C.W; x += 2) {
      var edgeY = yBase + 6 * Math.sin(x * 0.07 + t * 1.3) + 4 * Math.sin(x * 0.19 - t * 2.1);
      for (var d = 0; d < 6; d++) {
        var yy = edgeY - 12 + d * 2;
        var on = ((Math.floor(x / 2) + d) % 2) === 0;
        var a = 0.25 + d * 0.12;
        if (!on) a *= 0.4;
        ctx.globalAlpha = a;
        ctx.fillRect(x, Math.round(yy), 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.COLORS.whiteout;
      var solidY = Math.round(edgeY);
      if (solidY < C.H) ctx.fillRect(x, solidY, 2, C.H - solidY);
      ctx.fillStyle = C.COLORS.whiteoutEdge;
    }

    ctx.restore();
  };

  F.updateSurge = function (dt) {
    F.surge = Math.min(1.2, F.surge + dt / 1.2);
  };

  SITF.Fog = F;
})();
