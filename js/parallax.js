(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var A = SITF.Assets;

  var P = {};

  // Last opaque row of the alpine peak layer, and the ground colour there.
  var GROUND_Y = 282;
  var GROUND_COL = '#415522';
  // Same idea for the night silhouette layer.
  var NIGHT_GROUND_Y = 300;
  var NIGHT_GROUND_COL = '#0b1b31';

  function img(k) { return A.img[k]; }

  function drawFull(ctx, im, x, y, alpha) {
    if (!im) return;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(im, Math.round(x), Math.round(y));
    ctx.restore();
  }

  // Daytime alpine stack (nature_3). climbPx grows as the player ascends.
  // `rf` is the climber's row; when given, the altitude sky (sun, dusk
  // glow, first stars) is layered in. Screens without a climb omit it.
  P.drawDay = function (ctx, climbPx, t, alpha, rf) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    var a = alpha == null ? 1 : alpha;

    var sky = img('sky3');
    if (sky) ctx.drawImage(sky, 0, 0);
    else { ctx.fillStyle = C.COLORS.sky; ctx.fillRect(0, 0, C.W, C.H); }

    if (rf != null) {
      SITF.Sky.drawDuskStars(ctx, rf, t, a);
      SITF.Sky.drawSun(ctx, rf, t, a);
    }

    // The peak sinks slowly as you climb past it. Its source art is
    // transparent below GROUND_Y, so the ground colour is extended down to
    // the bottom of the screen instead of letting the sky show through.
    var peakY = U.clamp(climbPx * 0.10, 0, 210);
    var groundTop = peakY + GROUND_Y;
    if (groundTop < C.H) {
      ctx.fillStyle = GROUND_COL;
      ctx.fillRect(0, Math.round(groundTop), C.W, C.H - Math.round(groundTop));
    }
    drawFull(ctx, img('peak3'), 0, peakY, 1);

    // Alpenglow: the dusk horizon warms the peak but not the near trees.
    if (rf != null) SITF.Sky.drawDuskGlow(ctx, rf);

    // Pale haze band, drifting.
    var hazeY = climbPx * 0.06 + Math.sin(t * 0.2) * 3;
    drawFull(ctx, img('haze3'), 0, hazeY, 0.5);

    // Foreground treeline slides off the bottom in the first dozen rows.
    var foreY = climbPx * 0.55;
    if (foreY < C.H + 40) drawFull(ctx, img('fore3'), 0, foreY, 1);

    ctx.restore();
  };

  // Just the sky half of the night stack: stars and the drifting aurora.
  // Split out so the summit screen can build its own peaks over it.
  P.drawNightSky = function (ctx, t, alpha, rf) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    var stars = img('stars6');
    if (stars) ctx.drawImage(stars, 0, 0);
    else { ctx.fillStyle = C.COLORS.night; ctx.fillRect(0, 0, C.W, C.H); }

    var aur = img('aurora6');
    if (aur) {
      // The aurora itself strengthens over the last zone.
      var lift = rf == null ? 1 : 0.7 + 0.3 * U.smoothstep(100, 150, rf);
      ctx.globalAlpha = alpha * lift * (0.85 + 0.15 * Math.sin(t * 0.4));
      var ax = Math.sin(t * 0.05) * 8;
      ctx.drawImage(aur, Math.round(ax), 0);
      ctx.drawImage(aur, Math.round(ax) - (aur.width || C.W), 0);
    }
    ctx.restore();

    if (rf != null) SITF.Sky.drawNightSky(ctx, rf, t, alpha);
  };

  // Just the peak silhouette of the night stack, at the height it sits for a
  // given climb. Split out alongside drawNightSky so other screens can put
  // their own content between the sky and the peaks.
  P.drawNightPeaks = function (ctx, climbPx, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Dark peaks rise into view through the final zone, then settle.
    var peaksY = P.nightPeaksY(climbPx);
    var nGround = peaksY + NIGHT_GROUND_Y;
    if (nGround < C.H) {
      ctx.fillStyle = NIGHT_GROUND_COL;
      ctx.fillRect(0, Math.round(nGround), C.W, C.H - Math.round(nGround));
    }
    drawFull(ctx, img('peaks6'), 0, peaksY, alpha);

    ctx.restore();
  };

  P.nightPeaksY = function (climbPx) {
    return U.clamp((climbPx - 100 * C.ROW_H) * 0.10 + 60, 0, 190);
  };

  // Aurora night stack (nature_6).
  P.drawNight = function (ctx, climbPx, t, alpha, rf) {
    if (alpha <= 0) return;
    P.drawNightSky(ctx, t, alpha, rf);
    P.drawNightPeaks(ctx, climbPx, alpha);
  };

  // The forest you start in (nature_4), sinking away as you climb out of it.
  P.drawForest = function (ctx, climbPx, t, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    var sky = img('sky4');
    if (sky) ctx.drawImage(sky, 0, 0);
    else { ctx.fillStyle = C.COLORS.sky; ctx.fillRect(0, 0, C.W, C.H); }

    drawFull(ctx, img('cloud4'), Math.sin(t * 0.06) * 12, climbPx * 0.05, 0.9 * alpha);
    drawFull(ctx, img('hill4'), 0, climbPx * 0.26, alpha);
    drawFull(ctx, img('tree4'), 0, climbPx * 0.62, alpha);

    ctx.restore();
  };

  // How much of each backdrop is showing at a given row.
  P.forestAt = function (rowFloat) { return 1 - U.smoothstep(12, 30, rowFloat); };

  // How dusky / how nocturnal the sky is for a given row.
  P.duskAt = function (rowFloat) { return U.smoothstep(56, 74, rowFloat); };
  P.nightAt = function (rowFloat) { return U.smoothstep(112, 128, rowFloat); };

  // A colour cast per stage, so the glacier is cold and the ridge is not.
  // Kept light: the backdrop art and the sky do most of the work.
  var GRADE = [
    null,
    null,
    { color: '#7fc7ff', a: 0.16 },   // the glacier: everything goes blue
    { color: '#8e7fd0', a: 0.12 },   // the ridge at dusk
    { color: '#2b4a7a', a: 0.10 }    // the death zone
  ];

  P.grade = function (ctx, rowFloat) {
    var i = U.zoneIndexOf(Math.floor(U.clamp(rowFloat, 0, C.ROWS)));
    var g = GRADE[U.clamp(i, 0, GRADE.length - 1)];
    // Blend toward the next stage's cast so it arrives gradually.
    var z = C.ZONES[i], t = 0, gn = null;
    if (i < C.ZONES.length - 1 && rowFloat > z.to - 8) {
      t = U.clamp((rowFloat - (z.to - 8)) / 10, 0, 1);
      gn = GRADE[i + 1];
    }
    ctx.save();
    if (g) { ctx.globalAlpha = g.a * (1 - t); ctx.fillStyle = g.color; ctx.fillRect(0, 0, C.W, C.H); }
    if (gn) { ctx.globalAlpha = gn.a * t; ctx.fillStyle = gn.color; ctx.fillRect(0, 0, C.W, C.H); }
    ctx.restore();
  };

  // Full background for gameplay at a given row + camera offset.
  P.draw = function (ctx, rowFloat, climbPx, t) {
    var dusk = P.duskAt(rowFloat);
    var night = P.nightAt(rowFloat);

    var forest = P.forestAt(rowFloat);
    if (forest > 0) P.drawForest(ctx, climbPx, t, 1);

    if (night < 1) {
      // The alpine stack fades in over the forest as you climb out of it.
      P.drawDay(ctx, climbPx, t, 1 - forest, rowFloat);
      if (dusk > 0) {
        ctx.save();
        ctx.globalAlpha = 0.38 * dusk;
        ctx.fillStyle = C.COLORS.dusk;
        ctx.fillRect(0, 0, C.W, C.H);
        ctx.restore();
      }
    }
    if (night > 0) P.drawNight(ctx, climbPx, t, night, rowFloat);

    // The cloud deck sits in front of both stacks: it is nearer than any
    // of the painted mountains once you are above it.
    SITF.Sky.drawClouds(ctx, rowFloat, t);

    // Finally the stage's own light on all of it.
    P.grade(ctx, rowFloat);
  };

  // Fog tint follows the light: cool white by day, grey-blue on the ridge,
  // deep slate under the aurora.
  P.fogColorAt = function (rowFloat) {
    var dusk = P.duskAt(rowFloat);
    var night = P.nightAt(rowFloat);
    var c = U.mixHex(C.COLORS.fog, C.COLORS.fogDark, U.clamp(dusk, 0, 1));
    if (night > 0) c = U.mixHex(c, C.COLORS.fogNight, night);
    return c;
  };

  SITF.Parallax = P;
})();
