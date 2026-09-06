(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Font = SITF.Font;
  var M = SITF.Mountain;
  var Par = SITF.Parallax;
  var Part = SITF.Particles;
  var Aud = SITF.Audio;
  var COL = C.COLORS;

  var data, t, best, isRecord, inputDelay, snowAcc, bestScore, isScoreRecord;

  var End = {};

  End.enter = function (params) {
    data = params || {};
    t = 0;
    inputDelay = 0.6;
    snowAcc = 0;
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
    }
    Part.update(dt);

    var acts = SITF.Input.takeActions();
    SITF.Input.takeHop();
    var confirm = false, back = false;
    for (var i = 0; i < acts.length; i++) {
      if (acts[i] === 'mute') Aud.toggleMuted();
      else if (acts[i] === 'confirm' || acts[i] === 'restart') confirm = true;
      else if (acts[i] === 'pause' || acts[i] === 'quit') back = true;
    }
    if (inputDelay > 0) return;
    if (confirm) { Aud.ui(); SITF.setState('play'); }
    else if (back) { Aud.ui(); SITF.setState('title'); }
  };

  End.draw = function (ctx) {
    if (data.result === 'summit') drawSummit(ctx);
    else drawWhiteout(ctx);
  };

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
    ctx.restore();

    // Soft dark slabs behind the text blocks keep them clean over the aurora.
    softPanel(ctx, C.W / 2 - 150, 34, 300, 68, 0.45);
    softPanel(ctx, C.W / 2 - 110, 104, 220, 144, 0.55);
    softPanel(ctx, C.W / 2 - 90, 254, 180, 36, 0.4);

    Font.draw(ctx, 'SUMMIT REACHED', C.W / 2, 46,
              { scale: 3, align: 'center', color: COL.accent, shadow: COL.ink });
    Font.draw(ctx, M.altitudeOf(C.ROWS) + ' M', C.W / 2, 82,
              { scale: 2, align: 'center', color: COL.text, shadow: COL.ink });

    var rows = [
      ['TIME', U.formatTime(data.time) + (isRecord ? '  NEW BEST' : '')],
      ['TIME BONUS', '+' + (data.timeBonus || 0)],
      ['BLIND HOPS', String(data.blind || 0)],
      ['CRYSTALS', String(data.crystals || 0)],
      ['SLIPS', String(data.slips)],
      ['BEST COMBO', 'X' + data.bestCombo]
    ];
    drawResults(ctx, rows, 108);

    var pulse = 0.6 + 0.4 * Math.sin(t * 5);
    Font.draw(ctx, 'SCORE ' + (data.score || 0), C.W / 2, 212,
              { scale: 2, align: 'center', color: isScoreRecord ? COL.warn : COL.text, shadow: COL.ink,
                alpha: isScoreRecord ? pulse : 1 });
    Font.draw(ctx, (isScoreRecord ? 'NEW BEST SCORE' : 'BEST ' + bestScore), C.W / 2, 234,
              { scale: 1, align: 'center', color: COL.textDim, shadow: COL.ink });

    drawFooter(ctx, 'ENTER  CLIMB AGAIN', 'ESC  TITLE');
  }

  function drawWhiteout(ctx) {
    ctx.fillStyle = COL.whiteout;
    ctx.fillRect(0, 0, C.W, C.H);

    // Faint drifting snow over a flat whiteout.
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = COL.whiteoutEdge;
    for (var i = 0; i < 14; i++) {
      var yy = (i * 27 + SITF.time * 8) % C.H;
      ctx.fillRect(0, Math.round(yy), C.W, 3);
    }
    ctx.restore();

    U.panel(ctx, 78, 40, C.W - 156, 210, COL.ink, 0.88);

    Font.draw(ctx, 'LOST IN THE', C.W / 2, 62,
              { scale: 2, align: 'center', color: COL.text });
    Font.draw(ctx, 'WHITEOUT', C.W / 2, 82,
              { scale: 2, align: 'center', color: COL.text });
    Font.draw(ctx, 'YOU REACHED ' + M.altitudeOf(data.row || 0) + ' M', C.W / 2, 110,
              { scale: 1, align: 'center', color: COL.warn });

    var rows = [
      ['SCORE', String(data.score || 0) + (isScoreRecord ? '  NEW BEST' : '')],
      ['BLIND HOPS', String(data.blind || 0)],
      ['CRYSTALS', String(data.crystals || 0)],
      ['SLIPS', String(data.slips)],
      ['BEST COMBO', 'X' + data.bestCombo]
    ];
    drawResults(ctx, rows, 126);

    Font.draw(ctx, 'LIGHT CAIRNS TO PUSH THE WHITEOUT BACK.', C.W / 2, 216,
              { scale: 1, align: 'center', color: COL.textDim });

    drawFooter(ctx, 'ENTER  TRY AGAIN', 'ESC  TITLE');
  }

  // Slightly rounded near-black slab: 3px pixel corners, no hard outline.
  function softPanel(ctx, x, y, w, h, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#030a14';
    ctx.fillRect(x + 3, y, w - 6, h);
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillRect(x, y + 3, w, h - 6);
    ctx.restore();
  }

  function drawResults(ctx, rows, y) {
    var lx = C.W / 2 - 82, rx = C.W / 2 + 82;
    for (var i = 0; i < rows.length; i++) {
      var yy = y + i * 16;
      Font.draw(ctx, rows[i][0], lx, yy, { scale: 1, color: COL.textDim });
      Font.draw(ctx, rows[i][1], rx, yy, { scale: 1, color: COL.text, align: 'right' });
    }
  }

  function drawFooter(ctx, a, b) {
    var blink = (t % 1.4) < 0.95;
    if (blink || t < 1) {
      Font.draw(ctx, a, C.W / 2, 262, { scale: 1, align: 'center', color: COL.accent, shadow: COL.ink });
    }
    Font.draw(ctx, b, C.W / 2, 278, { scale: 1, align: 'center', color: COL.textDim, shadow: COL.ink });
  }

  SITF.registerState('end', End);
})();
