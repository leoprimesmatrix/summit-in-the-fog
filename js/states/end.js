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
  var rows, rowsShown, scoreDone;

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
    Part.clear();

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
          Part.spawn('sparkle', C.W / 2 - 60 + Math.random() * 120, 214 + Math.random() * 14, {
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

  function drawSummit(ctx) {
    Par.drawNight(ctx, 150 * C.ROW_H, SITF.time, 1);
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
      U.softPanel(ctx, C.W / 2 - 150, 34 + dy1, 300, 68, 0.45);
      Font.draw(ctx, 'SUMMIT REACHED', C.W / 2, 46 + dy1,
                { scale: 3, align: 'center', color: COL.accent, shadow: COL.ink });
      var k2 = reveal(T_ALT, 0.3);
      if (k2 > 0) {
        Font.draw(ctx, M.altitudeOf(C.ROWS) + ' M', C.W / 2, 82 + dy1,
                  { scale: 2, align: 'center', color: COL.text, shadow: COL.ink, alpha: k2 });
      }
      ctx.restore();
    }

    // Stats block with the score beneath.
    var k3 = reveal(T_ROWS - 0.1, 0.3);
    if (k3 > 0) {
      U.softPanel(ctx, C.W / 2 - 110, 104, 220, 144, 0.55 * k3);
      drawResults(ctx, 108);

      var ks = U.clamp((t - T_SCORE) / T_SCORE_LEN, 0, 1);
      if (ks > 0) {
        var shown = Math.round((data.score || 0) * U.easeOutCubic(ks));
        var settled = ks >= 1;
        var pulse = 0.6 + 0.4 * Math.sin(t * 5);
        Font.draw(ctx, 'SCORE ' + shown, C.W / 2, 212,
                  { scale: 2, align: 'center', color: (settled && isScoreRecord) ? COL.warn : COL.text,
                    shadow: COL.ink, alpha: (settled && isScoreRecord) ? pulse : 1 });
        if (settled) {
          Font.draw(ctx, (isScoreRecord ? 'NEW BEST SCORE' : 'BEST ' + bestScore), C.W / 2, 234,
                    { scale: 1, align: 'center', color: COL.textDim, shadow: COL.ink });
        }
      }
    }

    drawFooter(ctx, 'ENTER  CLIMB AGAIN', 'ESC  TITLE');
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
      U.softPanel(ctx, C.W / 2 - 150, 34 + dy1, 300, 90, 0.6);
      Font.draw(ctx, 'LOST IN THE', C.W / 2, 44 + dy1,
                { scale: 2, align: 'center', color: COL.text, shadow: COL.ink });
      Font.draw(ctx, 'WHITEOUT', C.W / 2, 64 + dy1,
                { scale: 2, align: 'center', color: COL.text, shadow: COL.ink });
      var k2 = reveal(T_ALT, 0.3);
      if (k2 > 0) {
        Font.draw(ctx, 'YOU REACHED ' + M.altitudeOf(data.row || 0) + ' M', C.W / 2, 92 + dy1,
                  { scale: 1, align: 'center', color: COL.warn, shadow: COL.ink, alpha: k2 });
        // Progress toward the summit, marked at every cairn.
        var bw = 200, bx = Math.round(C.W / 2 - bw / 2), by = 106 + dy1;
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
      U.softPanel(ctx, C.W / 2 - 150, 128, 300, 118, 0.6 * k3);
      drawResults(ctx, 134);
      var kh = reveal(T_SCORE, 0.3);
      if (kh > 0) {
        Font.draw(ctx, 'LIGHT CAIRNS TO PUSH THE WHITEOUT BACK.', C.W / 2, 232,
                  { scale: 1, align: 'center', color: COL.textDim, alpha: kh });
      }
    }

    drawFooter(ctx, 'ENTER  TRY AGAIN', 'ESC  TITLE');
  }

  function drawResults(ctx, y) {
    var lx = C.W / 2 - 82, rx = C.W / 2 + 82;
    for (var i = 0; i < rows.length; i++) {
      var k = U.clamp((t - (T_ROWS + i * T_ROW_STEP)) / T_ROW_LEN, 0, 1);
      if (k <= 0) continue;
      var e = U.easeOutCubic(k);
      var slide = Math.round((1 - e) * 6);
      var yy = y + i * 16;
      Font.draw(ctx, rows[i][0], lx - slide, yy, { scale: 1, color: COL.textDim, alpha: e });
      Font.draw(ctx, rows[i][1], rx + slide, yy, { scale: 1, color: rows[i][2], align: 'right', alpha: e });
    }
  }

  function drawFooter(ctx, a, b) {
    var k = reveal(T_FOOT, 0.3);
    if (k <= 0) return;
    U.softPanel(ctx, C.W / 2 - 90, 254, 180, 36, 0.4 * k);
    var blink = (t % 1.4) < 0.95;
    if (blink) {
      Font.draw(ctx, a, C.W / 2, 262, { scale: 1, align: 'center', color: COL.accent, shadow: COL.ink, alpha: k });
    }
    Font.draw(ctx, b, C.W / 2, 278, { scale: 1, align: 'center', color: COL.textDim, shadow: COL.ink, alpha: k });
  }

  SITF.registerState('end', End);
})();
