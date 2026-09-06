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
    Par.drawNightSky(ctx, SITF.time, 1);
    drawStars(ctx);
    drawShoot(ctx);
    ctx.drawImage(vistaFar, 0, 0);
    drawCloudSea(ctx, SITF.time);
    ctx.drawImage(vistaNear, 0, 0);
    drawSummitFigure(ctx);
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

  // ---- summit vista -------------------------------------------------------
  // The backdrop for the summit screen: three ranges of peaks receding into
  // the aurora, the sea of cloud you climbed out of, and the crag you are
  // standing on. Everything static is baked once into two canvases so the
  // per-frame cost is three drawImage calls plus the drifting cloud strips.

  var vistaFar = null, vistaNear = null, clouds = null, stars = null;

  // A seamless height profile across the screen, built from harmonics whose
  // periods divide the width exactly so the left and right edges agree.
  function profile(seed, baseY, amp) {
    var rnd = U.mulberry32(seed);
    var k = [1 + Math.floor(rnd() * 2), 3 + Math.floor(rnd() * 2),
             6 + Math.floor(rnd() * 3), 13 + Math.floor(rnd() * 6)];
    var ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
    var w = [0.50, 0.27, 0.15, 0.08];
    var out = [];
    for (var x = 0; x < C.W; x++) {
      var v = 0;
      for (var i = 0; i < 4; i++) v += Math.sin(2 * Math.PI * k[i] * x / C.W + ph[i]) * w[i];
      out.push(Math.round(baseY - v * amp));
    }
    return out;
  }

  // Fill below the profile, then lay snow on the shoulders: deepest where the
  // slope is shallow and the peak is high, which is where snow actually sits.
  function paintRange(cx, prof, fill, snowCol, depth, snowLine) {
    for (var x = 0; x < C.W; x++) {
      var top = prof[x];
      cx.fillStyle = fill;
      cx.fillRect(x, top, 1, C.H - top);
      if (depth <= 0 || top >= snowLine) continue;
      var l = prof[x > 0 ? x - 1 : 0], r = prof[x < C.W - 1 ? x + 1 : C.W - 1];
      var slope = Math.abs(r - l) / 2;
      var d = Math.round(depth * U.clamp(1.3 - slope * 0.45, 0, 1) *
                         U.clamp((snowLine - top) / 16, 0, 1));
      if (d > 0) { cx.fillStyle = snowCol; cx.fillRect(x, top, 1, d); }
    }
  }

  // Near crag: two gaussian humps in the bottom corners, roughened so the
  // silhouette reads as rock rather than a curve.
  function cragTop(x) {
    var a = C.H + 10 - 80 * Math.exp(-Math.pow((x - 66) / 62, 2))
                    - 22 * Math.exp(-Math.pow((x - 168) / 80, 2));
    var b = C.H + 12 - 54 * Math.exp(-Math.pow((x - 540) / 56, 2))
                    - 16 * Math.exp(-Math.pow((x - 448) / 66, 2));
    var top = Math.min(a, b);
    top += Math.sin(x * 0.71) * 1.1 + Math.sin(x * 0.23 + 1.7) * 2.0;
    return Math.round(top);
  }

  function paintCrag(cx) {
    var rnd = U.mulberry32(5150);
    var prof = [];
    for (var x = 0; x < C.W; x++) prof.push(cragTop(x));
    for (x = 0; x < C.W; x++) {
      var top = prof[x];
      if (top >= C.H) continue;
      cx.fillStyle = '#050e1c';
      cx.fillRect(x, top, 1, C.H - top);

      // Strata and grain, so the near rock is a face and not a black blob.
      var band = Math.round(6 + 5 * Math.sin(x * 0.06 + 1.1) + 3 * Math.sin(x * 0.19));
      cx.fillStyle = '#0d1e33';
      cx.fillRect(x, top + band, 1, 2);
      cx.fillRect(x, top + band + 9, 1, 1);
      if (rnd() < 0.22) {
        cx.fillStyle = '#16304a';
        cx.fillRect(x, top + 3 + Math.floor(rnd() * 22), 1, 1);
      }

      var l = prof[x > 0 ? x - 1 : 0], r = prof[x < C.W - 1 ? x + 1 : C.W - 1];
      var slope = Math.abs(r - l) / 2;
      // Snow only on the shoulders of the humps; the low run-off toward the
      // frame edges stays bare rock so the silhouette does not read as a wire.
      var lie = U.clamp(1.25 - slope * 0.85, 0, 1) * U.clamp((C.H - 8 - top) / 14, 0, 1);
      var d = Math.round((3 + rnd() * 2.2) * lie);
      if (d > 0) {
        // On a steep column the neighbour's surface sits several pixels lower;
        // reach down to meet it, otherwise the snow breaks into dashes.
        var gap = U.clamp(Math.max(l, r) - top, 0, 7);
        var lit = Math.max(1, d);
        cx.fillStyle = '#e2eef8';
        cx.fillRect(x, top + 1, 1, lit);
        cx.fillStyle = '#6d8ca8';
        cx.fillRect(x, top + 1 + lit, 1, 2 + gap);
        // Aurora rim on the very top pixel; it is the only light up here.
        cx.fillStyle = U.rgba(COL.accent, 0.45 + 0.35 * lie);
        cx.fillRect(x, top, 1, 1);
      } else {
        cx.fillStyle = U.rgba(COL.accent, 0.18);
        cx.fillRect(x, top, 1, 1);
      }
    }
  }

  // One seamless band of cloud, scrolled twice side by side at draw time.
  function cloudStrip(seed, h, fill, edge) {
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

  function buildVista() {
    if (vistaFar) return;

    vistaFar = U.makeCanvas(C.W, C.H);
    var fc = vistaFar.getContext('2d');
    paintRange(fc, profile(9101, 150, 22), '#122c47', '#2f5c80', 2, 148);
    paintRange(fc, profile(9102, 178, 30), '#0d2039', '#27496b', 3, 172);
    // Haze the ranges into the horizon: darker and flatter toward the base.
    fc.globalCompositeOperation = 'source-atop';
    var hg = fc.createLinearGradient(0, 120, 0, 240);
    hg.addColorStop(0, U.rgba(COL.night, 0));
    hg.addColorStop(1, U.rgba(COL.night, 0.75));
    fc.fillStyle = hg;
    fc.fillRect(0, 0, C.W, C.H);
    fc.globalCompositeOperation = 'source-over';

    vistaNear = U.makeCanvas(C.W, C.H);
    var nc = vistaNear.getContext('2d');
    paintRange(nc, profile(9103, 216, 26), '#071426', '#193d5b', 3, 212);
    paintCrag(nc);

    clouds = [
      { img: cloudStrip(7301, 46, '#2b4c6e', '#5c86a8'), y: 184, a: 0.30, sp: 3.0 },
      { img: cloudStrip(7302, 50, '#1d3a58', '#4a7396'), y: 200, a: 0.42, sp: 6.5 },
      { img: cloudStrip(7303, 56, '#12263f', '#3a5f80'), y: 220, a: 0.58, sp: 11.0 }
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

  function drawCloudSea(ctx, tt) {
    ctx.save();
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var off = -((tt * c.sp) % C.W);
      ctx.globalAlpha = c.a;
      ctx.drawImage(c.img, Math.round(off), c.y);
      ctx.drawImage(c.img, Math.round(off) + C.W, c.y);
    }
    ctx.restore();
  }

  // The payoff: you, on top, lantern still lit, flags planted beside you.
  function drawSummitFigure(ctx) {
    var fx = 66, fy = cragTop(66) + 1;
    var frame = Math.floor(SITF.time * 3) % 2;
    var flick = 0.55 + 0.12 * Math.sin(SITF.time * 6.1) + 0.06 * Math.sin(SITF.time * 11.3);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(S.img.pool_lantern,
                  Math.round(fx - S.img.pool_lantern.width / 2),
                  Math.round(fy - S.img.pool_lantern.height / 2));
    ctx.restore();

    S.drawSummit(ctx, 104, cragTop(104) + 1, frame);
    S.drawClimber(ctx, fx, fy, 'summit', 0, 1);

    var lo = S.lanternOffset('summit');
    S.drawGlow(ctx, S.img.glow_lantern, fx + lo.x, fy + lo.y, flick, 0.75);
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
