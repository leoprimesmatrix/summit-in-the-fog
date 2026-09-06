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
  P.drawDay = function (ctx, climbPx, t, alpha) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;

    var sky = img('sky3');
    if (sky) ctx.drawImage(sky, 0, 0);
    else { ctx.fillStyle = C.COLORS.sky; ctx.fillRect(0, 0, C.W, C.H); }

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

    // Pale haze band, drifting.
    var hazeY = climbPx * 0.06 + Math.sin(t * 0.2) * 3;
    drawFull(ctx, img('haze3'), 0, hazeY, 0.5);

    // Foreground treeline slides off the bottom in the first dozen rows.
    var foreY = climbPx * 0.55;
    if (foreY < C.H + 40) drawFull(ctx, img('fore3'), 0, foreY, 1);

    ctx.restore();
  };

  // Aurora night stack (nature_6).
  P.drawNight = function (ctx, climbPx, t, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    var stars = img('stars6');
    if (stars) ctx.drawImage(stars, 0, 0);
    else { ctx.fillStyle = C.COLORS.night; ctx.fillRect(0, 0, C.W, C.H); }

    var aur = img('aurora6');
    if (aur) {
      ctx.save();
      ctx.globalAlpha = alpha * (0.85 + 0.15 * Math.sin(t * 0.4));
      var ax = Math.sin(t * 0.05) * 8;
      ctx.drawImage(aur, Math.round(ax), 0);
      ctx.drawImage(aur, Math.round(ax) - (aur.width || C.W), 0);
      ctx.restore();
    }

    // Dark peaks rise into view through the final zone, then settle.
    var peaksY = U.clamp((climbPx - 100 * C.ROW_H) * 0.10 + 60, 0, 190);
    var nGround = peaksY + NIGHT_GROUND_Y;
    if (nGround < C.H) {
      ctx.fillStyle = NIGHT_GROUND_COL;
      ctx.fillRect(0, Math.round(nGround), C.W, C.H - Math.round(nGround));
    }
    drawFull(ctx, img('peaks6'), 0, peaksY, alpha);

    ctx.restore();
  };

  // How dusky / how nocturnal the sky is for a given row.
  P.duskAt = function (rowFloat) { return U.smoothstep(44, 56, rowFloat); };
  P.nightAt = function (rowFloat) { return U.smoothstep(96, 106, rowFloat); };

  // Full background for gameplay at a given row + camera offset.
  P.draw = function (ctx, rowFloat, climbPx, t) {
    var dusk = P.duskAt(rowFloat);
    var night = P.nightAt(rowFloat);

    if (night < 1) {
      P.drawDay(ctx, climbPx, t, 1);
      if (dusk > 0) {
        ctx.save();
        ctx.globalAlpha = 0.38 * dusk;
        ctx.fillStyle = C.COLORS.dusk;
        ctx.fillRect(0, 0, C.W, C.H);
        ctx.restore();
      }
    }
    if (night > 0) P.drawNight(ctx, climbPx, t, night);
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
