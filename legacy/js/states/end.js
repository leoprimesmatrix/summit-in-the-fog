(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Font = SITF.Font;
  var M = SITF.Mountain;
  var Par = SITF.Parallax;
  var Part = SITF.Particles;
  var Aud = SITF.Audio;
  var S = SITF.Sprites;
  var COL = C.COLORS;

  var data, t, best, isRecord, inputDelay, snowAcc, moteAcc, bestScore, isScoreRecord;
  var rows, rowsShown, scoreDone, shootTimer, shoot;

  // Reveal timeline in seconds after entering the screen.
  var T_TITLE = 0.0, T_ALT = 0.25, T_ROWS = 0.5, T_ROW_STEP = 0.1, T_ROW_LEN = 0.18;
  var T_SCORE = 1.15, T_SCORE_LEN = 0.85, T_FOOT = 2.1;

  var End = {};

  End.enter = function (params) {
    data = params || {};
    t = 0;
    inputDelay = 0.6;
    snowAcc = 0;
    moteAcc = 0;
    rowsShown = 0;
    scoreDone = false;
    shootTimer = 2.5;
    shoot = null;
    Part.clear();
    buildVista();

    var stored = U.storageGet(C.STORAGE_KEY_BEST);
    var prev = stored ? parseFloat(stored) : null;
    if (prev != null && !isFinite(prev)) prev = null;
    isRecord = false;

    if (data.result === 'summit') {
      if (prev == null || data.time < prev) {
        isRecord = true;
        U.storageSet(C.STORAGE_KEY_BEST, String(data.time));
        best = data.time;
      } else {
        best = prev;
      }
    } else {
      best = prev;
    }

    // Best score counts on any run, summit or not.
    var ps = parseFloat(U.storageGet(C.STORAGE_KEY_SCORE));
    if (!isFinite(ps)) ps = 0;
    var sc = data.score || 0;
    isScoreRecord = sc > ps;
    bestScore = Math.max(ps, sc);
    if (isScoreRecord) U.storageSet(C.STORAGE_KEY_SCORE, String(sc));

    if (data.result === 'summit') {
      rows = [
        ['TIME', U.formatTime(data.time) + (isRecord ? '  NEW BEST' : ''), isRecord ? COL.warn : COL.text],
        ['TIME BONUS', '+' + (data.timeBonus || 0), COL.accent],
        ['BLIND HOPS', String(data.blind || 0), COL.text],
        ['CRYSTALS', String(data.crystals || 0), COL.text],
        ['SLIPS', String(data.slips || 0), COL.text],
        ['BEST COMBO', 'X' + (data.bestCombo || 0), COL.text]
      ];
    } else {
      rows = [
        ['SCORE', String(data.score || 0) + (isScoreRecord ? '  NEW BEST' : ''), isScoreRecord ? COL.warn : COL.text],
        ['TIME', U.formatTime(data.time), COL.text],
        ['BLIND HOPS', String(data.blind || 0), COL.text],
        ['CRYSTALS', String(data.crystals || 0), COL.text],
        ['SLIPS', String(data.slips || 0), COL.text],
        ['BEST COMBO', 'X' + (data.bestCombo || 0), COL.text]
      ];
    }
  };

  End.exit = function () {};
  End.isPaused = function () { return false; };

  End.update = function (dt) {
    t += dt;
    if (inputDelay > 0) inputDelay -= dt;

    if (data.result === 'summit') {
      snowAcc += dt * 8;
      while (snowAcc >= 1) {
        snowAcc -= 1;
        Part.spawn('snow', Math.random() * C.W, -4, {
          vx: -12 + Math.random() * 24, vy: 18 + Math.random() * 16,
          life: 12, w: 1, h: 1,
          color: Math.random() < 0.12 ? COL.accent : COL.snow,
          alpha: 0.4 + Math.random() * 0.5, layer: 'screen'
        });
      }
      // Motes of aurora light climb slowly past the results.
      moteAcc += dt * 3;
      while (moteAcc >= 1) {
        moteAcc -= 1;
        Part.spawn('mote', Math.random() * C.W, C.H + 4, {
          vx: (Math.random() - 0.5) * 6, vy: -12 - Math.random() * 14,
          life: 7 + Math.random() * 5, w: 1, h: 1,
          color: Math.random() < 0.7 ? COL.accent : '#ffffff', alpha: 0.5, layer: 'screen'
        });
      }
      // The occasional meteor over the far ranges.
      if (shoot) {
        shoot.age += dt;
        shoot.x += shoot.vx * dt;
        shoot.y += shoot.vy * dt;
        if (shoot.age >= shoot.life) shoot = null;
      } else {
        shootTimer -= dt;
        if (shootTimer <= 0) {
          shootTimer = 5 + Math.random() * 8;
          shoot = {
            x: Math.random() * C.W * 0.6, y: 8 + Math.random() * 46,
            vx: 170 + Math.random() * 110, vy: 46 + Math.random() * 34,
            age: 0, life: 0.75 + Math.random() * 0.35
          };
        }
      }
    } else {
      snowAcc += dt * 14;
      while (snowAcc >= 1) {
        snowAcc -= 1;
        Part.spawn('flake', -10, Math.random() * C.H, {
          vx: 60 + Math.random() * 60, vy: 18 + Math.random() * 20,
          life: 12, w: 2, h: 2, color: '#ffffff', alpha: 0.55, layer: 'screen'
        });
      }
    }
    Part.update(dt);

    // A quiet tick as each stat lands, one brighter note when the score settles.
    var want = t < T_ROWS ? 0 : Math.min(rows.length, Math.floor((t - T_ROWS) / T_ROW_STEP) + 1);
    while (rowsShown < want) {
      rowsShown++;
      Aud.play('sfx_ui', { volume: 0.18, rate: 1 + rowsShown * 0.03 });
    }
    if (!scoreDone && t >= T_SCORE + T_SCORE_LEN) {
      scoreDone = true;
      if (data.result === 'summit' && isScoreRecord) {
        Aud.play('sfx_crystal', { volume: 0.5 });
        for (var i = 0; i < 20; i++) {
          Part.spawn('sparkle', C.W / 2 - 60 + Math.random() * 120, SUM_SCORE_Y + Math.random() * 14, {
            vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40,
            life: 0.5 + Math.random() * 0.5, w: 1, h: 1, color: COL.warn, alpha: 1, layer: 'front'
          });
        }
      } else {
        Aud.play('sfx_ui', { volume: 0.28, rate: 0.9 });
      }
    }

    var acts = SITF.Input.takeActions();
    SITF.Input.takeHop();
    var confirm = false, back = false;
    for (var k = 0; k < acts.length; k++) {
      if (acts[k] === 'mute') Aud.toggleMuted();
      else if (acts[k] === 'confirm' || acts[k] === 'restart') confirm = true;
      else if (acts[k] === 'pause' || acts[k] === 'quit') back = true;
    }
    if (inputDelay > 0) return;
    if (confirm) { Aud.ui(); SITF.setState('play'); }
    else if (back) { Aud.ui(); SITF.setState('title'); }
  };

  End.draw = function (ctx) {
    if (data.result === 'summit') drawSummit(ctx);
    else drawWhiteout(ctx);
    Part.draw(ctx, 'front');
  };

  // 0..1 progress of an element that starts at `at` and takes `len` seconds.
  function reveal(at, len) {
    return U.easeOutCubic(U.clamp((t - at) / len, 0, 1));
  }

  // ---- layout -------------------------------------------------------------
  // Every slab shares one column width and a constant 8px gap, so the stack
  // reads as one block instead of three centred rectangles of random size.
  // The width comes from the title, which is the widest thing on the screen.
  var PW = 290, PX = Math.round((C.W - PW) / 2);
  var ROW_X0 = PX + 36, ROW_X1 = PX + PW - 36;
  var ROW_STEP = 16;
  var PANEL_A = 0.5;

  var SUM_TITLE_Y = 22, SUM_TITLE_H = 64;
  var SUM_STATS_Y = 94, SUM_STATS_H = 154;
  var SUM_SCORE_Y = 212;
  var FOOT_Y = 256, FOOT_H = 40;

  function drawSummit(ctx) {
    Par.drawNightSky(ctx, SITF.time, 1);
    drawStars(ctx);
    drawShoot(ctx);
    drawFarPeaks(ctx);
    drawFogBands(ctx, SITF.time, 0, 1);
    drawNearPeaks(ctx);
    drawFogBands(ctx, SITF.time, 1, 2);
    drawRoute(ctx);
    drawFogBands(ctx, SITF.time, 2, 3);
    Part.draw(ctx, 'screen');

    ctx.save();
    var g = ctx.createLinearGradient(0, 0, 0, C.H);
    g.addColorStop(0, U.rgba(COL.night, 0.55));
    g.addColorStop(0.5, U.rgba(COL.night, 0.15));
    g.addColorStop(1, U.rgba(COL.night, 0.7));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(S.img.vignette, 0, 0);
    ctx.restore();

    // Title block.
    var k1 = reveal(T_TITLE, 0.35);
    if (k1 > 0) {
      ctx.save();
      ctx.globalAlpha = k1;
      var dy1 = Math.round((1 - k1) * -8);
      U.softPanel(ctx, PX, SUM_TITLE_Y + dy1, PW, SUM_TITLE_H, PANEL_A);
      Font.draw(ctx, 'SUMMIT REACHED', C.W / 2, SUM_TITLE_Y + 7 + dy1,
                { scale: 3, align: 'center', color: COL.accent, shadow: COL.ink });
      var k2 = reveal(T_ALT, 0.3);
      if (k2 > 0) {
        Font.draw(ctx, M.altitudeOf(C.ROWS) + ' M', C.W / 2, SUM_TITLE_Y + 39 + dy1,
                  { scale: 2, align: 'center', color: COL.text, shadow: COL.ink, alpha: k2 });
      }
      ctx.restore();
    }

    // Stats block with the score beneath.
    var k3 = reveal(T_ROWS - 0.1, 0.3);
    if (k3 > 0) {
      U.softPanel(ctx, PX, SUM_STATS_Y, PW, SUM_STATS_H, PANEL_A * k3);
      drawResults(ctx, SUM_STATS_Y + 13);

      var ks = U.clamp((t - T_SCORE) / T_SCORE_LEN, 0, 1);
      if (ks > 0) {
        // A hairline separates the tally from the total it adds up to.
        ctx.fillStyle = U.rgba(COL.textDim, 0.22 * ks);
        ctx.fillRect(ROW_X0, SUM_SCORE_Y - 8, ROW_X1 - ROW_X0, 1);

        var shown = Math.round((data.score || 0) * U.easeOutCubic(ks));
        var settled = ks >= 1;
        var pulse = 0.6 + 0.4 * Math.sin(t * 5);
        Font.draw(ctx, 'SCORE ' + shown, C.W / 2, SUM_SCORE_Y,
                  { scale: 2, align: 'center', color: (settled && isScoreRecord) ? COL.warn : COL.text,
                    shadow: COL.ink, alpha: (settled && isScoreRecord) ? pulse : 1 });
        if (settled) {
          Font.draw(ctx, (isScoreRecord ? 'NEW BEST SCORE' : 'BEST ' + bestScore), C.W / 2, SUM_SCORE_Y + 21,
                    { scale: 1, align: 'center', color: COL.textDim, shadow: COL.ink });
        }
      }
    }

    drawFooter(ctx, 'ENTER  CLIMB AGAIN', 'ESC  TITLE');
  }

  // ---- summit vista -------------------------------------------------------
  // The backdrop is the mountain that was actually climbed: the same aurora
  // sky and peak silhouette gameplay draws at the top of the route, with the
  // real last rows of the generated route standing over the fog on the left,
  // and the climber on the summit ledge beside the flags.

  var farPeaks = null, nearPeaks = null, fogBands = null, stars = null;
  // The gameplay peak silhouette, slid so its tallest summit lands under the
  // route's last ledge: the climber ends up standing on the actual peak.
  // Its highest summit sits at (375, 156) in the source art.
  var NEAR_PEAKS_X = 64 - 375, NEAR_PEAKS_Y = 168 - 156;

  // How the route is framed on this screen: the same rows, ledges and lane
  // order as gameplay, just held to the left of the text at a tighter lane
  // spacing so the whole path fits beside the panels.
  var VIS_ROWS = 6;
  var VIS_LANE_X = [12, 64, 116];
  var VIS_ROW_H = 30;
  var VIS_SUMMIT_Y = 168;
  var VIS_FOG_Y = 232;      // below here the route sinks into the fog

  // One seamless band of fog, scrolled twice side by side at draw time. The
  // harmonics have whole-number periods across the width, so it wraps.
  function fogStrip(seed, h, fill, edge) {
    var cv = U.makeCanvas(C.W, h);
    var cx = cv.getContext('2d');
    var rnd = U.mulberry32(seed);
    var k = [2, 3, 5, 8];
    var ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
    var w = [0.42, 0.28, 0.19, 0.11];
    for (var x = 0; x < C.W; x++) {
      var v = 0;
      for (var i = 0; i < 4; i++) v += Math.sin(2 * Math.PI * k[i] * x / C.W + ph[i]) * w[i];
      var top = Math.round(h * 0.5 - v * h * 0.42);
      top = Math.max(0, Math.min(h - 1, top));
      cx.fillStyle = fill;
      cx.fillRect(x, top, 1, h - top);
      cx.fillStyle = edge;
      cx.fillRect(x, top, 1, 1);
    }
    return cv;
  }

  // The band of a silhouette's own top edge, `thickness` pixels deep: the
  // shape with a copy of itself shifted down punched out of it. Done with
  // compositing rather than pixel reads, which would taint the canvas when
  // the game is opened straight off disk.
  function topBand(src, thickness, color) {
    var cv = U.makeCanvas(src.width, src.height);
    var cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);
    cx.globalCompositeOperation = 'destination-out';
    cx.drawImage(src, 0, thickness);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = color;
    cx.fillRect(0, 0, src.width, src.height);
    return cv;
  }

  // The gameplay peak art, pushed back into the night and given the snow crest
  // and aurora sheen the flat silhouette has no room for.
  function bakePeaks(src, nightA, sheenA, crestA) {
    var cv = U.makeCanvas(src.width, src.height);
    var cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);

    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = U.rgba(COL.night, nightA);
    cx.fillRect(0, 0, src.width, src.height);
    var sg = cx.createLinearGradient(0, 120, 0, 300);
    sg.addColorStop(0, U.rgba(COL.accent, sheenA));
    sg.addColorStop(1, U.rgba(COL.accent, 0));
    cx.fillStyle = sg;
    cx.fillRect(0, 0, src.width, src.height);
    cx.globalCompositeOperation = 'source-over';

    cx.globalAlpha = crestA;
    cx.drawImage(topBand(src, 3, U.rgba(COL.snow, 0.85)), 0, 0);
    cx.globalAlpha = crestA * 0.8;
    cx.drawImage(topBand(src, 1, U.rgba(COL.accent, 0.9)), 0, 0);
    return cv;
  }

  function buildVista() {
    if (fogBands) return;

    // A hazed, offset copy of the gameplay peak silhouette, sitting further
    // back. Same artwork, so the skyline stays the mountain of the game.
    var peaks = SITF.Assets.img.peaks6;
    if (peaks) {
      farPeaks = bakePeaks(peaks, 0.62, 0.06, 0.22);
      nearPeaks = bakePeaks(peaks, 0.20, 0.20, 0.62);
    }

    // Fog in the colours the game uses for fog at this altitude.
    var f0 = U.mixHex(COL.fogNight, COL.night, 0.45);
    var f1 = U.mixHex(COL.fogNight, COL.night, 0.62);
    var f2 = U.mixHex(COL.fogNight, COL.night, 0.74);
    fogBands = [
      { img: fogStrip(7301, 48, f0, U.mixHex(COL.fogNight, COL.text, 0.25)), y: 214, a: 0.34, sp: 3.0 },
      { img: fogStrip(7302, 54, f1, U.mixHex(COL.fogNight, COL.text, 0.12)), y: 238, a: 0.5, sp: 6.5 },
      { img: fogStrip(7303, 62, f2, COL.fogNight), y: 266, a: 0.7, sp: 11.0 }
    ];

    var rnd = U.mulberry32(4242);
    stars = [];
    for (var i = 0; i < 34; i++) {
      stars.push({
        x: Math.floor(rnd() * C.W), y: Math.floor(rnd() * 132),
        a: 0.35 + rnd() * 0.5, sp: 0.8 + rnd() * 2.2, ph: rnd() * 6.283,
        big: rnd() < 0.18
      });
    }
  }

  function drawFarPeaks(ctx) {
    if (!farPeaks) return;
    ctx.save();
    ctx.globalAlpha = 0.8;
    var x = NEAR_PEAKS_X + 214, y = NEAR_PEAKS_Y + 24;
    ctx.drawImage(farPeaks, x, y);
    ctx.drawImage(farPeaks, x - farPeaks.width, y);
    ctx.drawImage(farPeaks, x + farPeaks.width, y);
    ctx.restore();
  }

  function drawNearPeaks(ctx) {
    if (!nearPeaks) { Par.drawNightPeaks(ctx, C.ROWS * C.ROW_H, 1); return; }
    ctx.drawImage(nearPeaks, NEAR_PEAKS_X, NEAR_PEAKS_Y);
    ctx.drawImage(nearPeaks, NEAR_PEAKS_X + nearPeaks.width, NEAR_PEAKS_Y);
  }

  // The last rows of the real route, drawn with the gameplay ledge art.
  function drawRoute(ctx) {
    var top = M.row(C.ROWS);
    if (!top) return;
    var frame = Math.floor(SITF.time * 3) % 2;
    for (var i = VIS_ROWS - 1; i >= 0; i--) {
      var r = C.ROWS - i;
      var row = M.row(r);
      if (!row) continue;
      var y = VIS_SUMMIT_Y + i * VIS_ROW_H;
      if (y > C.H + 8) continue;
      // Lower rows sink into the fog bank, the way they did on the climb.
      var fade = U.clamp(1 - (y - VIS_FOG_Y) / 74, 0.12, 1);

      ctx.save();
      ctx.globalAlpha = fade;
      for (var j = 0; j < row.footholds.length; j++) {
        var f = row.footholds[j];
        var x = VIS_LANE_X[U.clamp(f.lane, 0, 2)];
        var type = (f.type === 'summit' || f.type === 'start') ? 'rock' : f.type;
        S.drawLedge(ctx, x, y, type, 0, 0.18, row.zone, (r + j) % 2);
      }
      if (row.cairn) {
        var cx = VIS_LANE_X[U.clamp(row.footholds[0].lane, 0, 2)] + 13;
        S.drawGlow(ctx, S.img.glow_cairn, cx, y - 10, 0.5 * fade, 1.1);
        S.drawCairn(ctx, cx, y, true, 1, Math.floor(SITF.time * 6) % 2);
      }
      if (row.summit) {
        S.drawSummit(ctx, VIS_LANE_X[U.clamp(row.footholds[0].lane, 0, 2)] + 14, y, frame);
      }
      ctx.restore();
    }

    // You, on the summit ledge, lantern still lit.
    var sx = VIS_LANE_X[U.clamp(top.footholds[0].lane, 0, 2)];
    var sy = VIS_SUMMIT_Y;
    var flick = 0.55 + 0.12 * Math.sin(SITF.time * 6.1) + 0.06 * Math.sin(SITF.time * 11.3);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(S.img.pool_lantern,
                  Math.round(sx - S.img.pool_lantern.width / 2),
                  Math.round(sy - S.img.pool_lantern.height / 2));
    ctx.restore();
    S.drawClimber(ctx, sx, sy, 'summit', 0, 1);
    var lo = S.lanternOffset('summit');
    S.drawGlow(ctx, S.img.glow_lantern, sx + lo.x, sy + lo.y, flick, 0.75);
  }

  function drawStars(ctx) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = s.a * (0.55 + 0.45 * Math.sin(SITF.time * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big) {
        ctx.globalAlpha = a * 0.45;
        ctx.fillRect(s.x - 1, s.y, 1, 1);
        ctx.fillRect(s.x + 1, s.y, 1, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 1);
        ctx.fillRect(s.x, s.y + 1, 1, 1);
      }
    }
    ctx.restore();
  }

  function drawShoot(ctx) {
    if (!shoot) return;
    var k = shoot.age / shoot.life;
    var fade = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 12; i++) {
      var f = i / 12;
      ctx.globalAlpha = fade * (1 - f) * 0.75;
      ctx.fillStyle = i < 3 ? '#ffffff' : COL.text;
      ctx.fillRect(Math.round(shoot.x - shoot.vx * f * 0.055),
                   Math.round(shoot.y - shoot.vy * f * 0.055), 1, 1);
    }
    ctx.restore();
  }

  // `from` selects which bands to draw, so the route can sit between them.
  function drawFogBands(ctx, tt, from, to) {
    ctx.save();
    for (var i = from; i < to; i++) {
      var b = fogBands[i];
      var off = -((tt * b.sp) % C.W);
      ctx.globalAlpha = b.a;
      ctx.drawImage(b.img, Math.round(off), b.y);
      ctx.drawImage(b.img, Math.round(off) + C.W, b.y);
    }
    ctx.restore();
  }

  function drawWhiteout(ctx) {
    // The mountain where the run ended, seen as ghost shapes through the
    // whiteout: the daytime stack under a heavy white wash.
    Par.drawDay(ctx, (data.row || 0) * C.ROW_H, SITF.time, 1);
    var g = ctx.createLinearGradient(0, 0, 0, C.H);
    g.addColorStop(0, U.rgba(COL.whiteout, 0.9));
    g.addColorStop(0.55, U.rgba(COL.whiteout, 0.82));
    g.addColorStop(1, U.rgba(COL.whiteoutEdge, 0.94));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.W, C.H);

    // Wind-blown snow bands.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < 12; i++) {
      var yy = (i * 31 + SITF.time * 9) % C.H;
      var xx = (i * 97 + SITF.time * 40 * (1 + (i % 3) * 0.4)) % (C.W + 200) - 100;
      ctx.fillRect(Math.round(xx), Math.round(yy), 120 + (i % 4) * 30, 2);
    }
    ctx.restore();
    Part.draw(ctx, 'screen');

    var k1 = reveal(T_TITLE, 0.35);
    if (k1 > 0) {
      ctx.save();
      ctx.globalAlpha = k1;
      var dy1 = Math.round((1 - k1) * -8);
      U.softPanel(ctx, PX, 22 + dy1, PW, 86, 0.62);
      Font.draw(ctx, 'LOST IN THE', C.W / 2, 30 + dy1,
                { scale: 2, align: 'center', color: COL.text, shadow: COL.ink });
      Font.draw(ctx, 'WHITEOUT', C.W / 2, 52 + dy1,
                { scale: 2, align: 'center', color: COL.text, shadow: COL.ink });
      var k2 = reveal(T_ALT, 0.3);
      if (k2 > 0) {
        Font.draw(ctx, 'YOU REACHED ' + M.altitudeOf(data.row || 0) + ' M', C.W / 2, 78 + dy1,
                  { scale: 1, align: 'center', color: COL.warn, shadow: COL.ink, alpha: k2 });
        // Progress toward the summit, marked at every cairn.
        var bw = ROW_X1 - ROW_X0, bx = ROW_X0, by = 95 + dy1;
        var frac = U.clamp((data.row || 0) / C.ROWS, 0, 1) * k2;
        ctx.fillStyle = U.rgba(COL.textDim, 0.3);
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = COL.warn;
        ctx.fillRect(bx, by, Math.round(bw * frac), 3);
        ctx.fillStyle = U.rgba(COL.ink, 0.8);
        for (var r = C.CAIRN_EVERY; r < C.ROWS; r += C.CAIRN_EVERY) {
          ctx.fillRect(bx + Math.round(bw * r / C.ROWS), by, 1, 3);
        }
        ctx.fillStyle = COL.text;
        ctx.fillRect(bx + bw - 1, by - 1, 2, 5);
      }
      ctx.restore();
    }

    var k3 = reveal(T_ROWS - 0.1, 0.3);
    if (k3 > 0) {
      U.softPanel(ctx, PX, 116, PW, 132, 0.62 * k3);
      drawResults(ctx, 127);
      var kh = reveal(T_SCORE, 0.3);
      if (kh > 0) {
        ctx.fillStyle = U.rgba(COL.textDim, 0.22 * kh);
        ctx.fillRect(ROW_X0, 224, ROW_X1 - ROW_X0, 1);
        Font.draw(ctx, 'LIGHT CAIRNS TO PUSH THE WHITEOUT BACK.', C.W / 2, 231,
                  { scale: 1, align: 'center', color: COL.textDim, alpha: kh });
      }
    }

    drawFooter(ctx, 'ENTER  TRY AGAIN', 'ESC  TITLE', 0.62);
  }

  function drawResults(ctx, y) {
    for (var i = 0; i < rows.length; i++) {
      var k = U.clamp((t - (T_ROWS + i * T_ROW_STEP)) / T_ROW_LEN, 0, 1);
      if (k <= 0) continue;
      var e = U.easeOutCubic(k);
      var slide = Math.round((1 - e) * 6);
      var yy = y + i * ROW_STEP;
      Font.draw(ctx, rows[i][0], ROW_X0 - slide, yy, { scale: 1, color: COL.textDim, alpha: e });
      Font.draw(ctx, rows[i][1], ROW_X1 + slide, yy, { scale: 1, color: rows[i][2], align: 'right', alpha: e });
    }
  }

  function drawFooter(ctx, a, b, alpha) {
    var k = reveal(T_FOOT, 0.3);
    if (k <= 0) return;
    U.softPanel(ctx, PX, FOOT_Y, PW, FOOT_H, (alpha == null ? PANEL_A : alpha) * k);
    var blink = (t % 1.4) < 0.95;
    if (blink) {
      Font.draw(ctx, a, C.W / 2, FOOT_Y + 8, { scale: 1, align: 'center', color: COL.accent, shadow: COL.ink, alpha: k });
    }
    Font.draw(ctx, b, C.W / 2, FOOT_Y + 23, { scale: 1, align: 'center', color: COL.textDim, shadow: COL.ink, alpha: k });
  }

  SITF.registerState('end', End);
})();
