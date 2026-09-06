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

  // Results card. One focal number, a quiet stat table, key-cap prompts.
  // Everything sits on a fixed grid so edges line up: labels share a left
  // margin, values share a right margin, rows sit on a 13px rhythm.
  var CARD_W = 316;
  var CARD_X = Math.round((C.W - CARD_W) / 2);
  var PAD = 14;
  var ROW_H = 13;
  var HEADER_H = 34;
  var FOOTER_H = 20;

  // Palette derived from the ink so the card belongs to the night sky.
  var CARD_FILL = U.mixHex(COL.ink, '#000000', 0.25);
  var CARD_HEAD = U.mixHex(COL.ink, COL.text, 0.08);
  var CARD_FOOT = U.mixHex(COL.ink, '#000000', 0.45);
  var CARD_EDGE = U.mixHex(COL.ink, COL.text, 0.28);
  var CARD_EDGE_HI = U.mixHex(COL.ink, COL.text, 0.45);
  var KEY_FILL = U.mixHex(COL.ink, COL.text, 0.16);
  var KEY_EDGE = U.mixHex(COL.ink, COL.text, 0.42);
  var LEADER = U.rgba(COL.textDim, 0.28);
  var RULE = U.rgba(COL.textDim, 0.22);

  // Reveal timeline (seconds after enter).
  var T_CARD = 0.0, T_CARD_LEN = 0.28;
  var T_HERO = 0.30, T_HERO_LEN = 0.95;   // count-up window
  var T_ROWS = 0.55, T_ROW_STEP = 0.09, T_ROW_LEN = 0.16;
  var T_FOOT = 1.30;

  var data, t, best, isRecord, inputDelay, snowAcc, bestScore, isScoreRecord;
  var rowsShown, heroDone, layout;

  var End = {};

  End.enter = function (params) {
    data = params || {};
    t = 0;
    inputDelay = 0.6;
    snowAcc = 0;
    rowsShown = 0;
    heroDone = false;
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

    layout = buildLayout();
  };

  End.exit = function () {};
  End.isPaused = function () { return false; };

  // Decide the card's contents once so update() and draw() agree.
  function buildLayout() {
    var summit = data.result === 'summit';
    var rows;
    if (summit) {
      rows = [
        { label: 'TIME', value: U.formatTime(data.time), badge: isRecord ? 'NEW BEST' : null },
        { label: 'TIME BONUS', value: '+' + (data.timeBonus || 0), color: COL.accent },
        { label: 'BLIND HOPS', value: String(data.blind || 0) },
        { label: 'CRYSTALS', value: String(data.crystals || 0) },
        { label: 'SLIPS', value: String(data.slips || 0) },
        { label: 'BEST COMBO', value: 'X' + (data.bestCombo || 0) }
      ];
    } else {
      rows = [
        { label: 'SCORE', value: String(data.score || 0), badge: isScoreRecord ? 'NEW BEST' : null,
          color: isScoreRecord ? COL.warn : COL.text },
        { label: 'TIME', value: U.formatTime(data.time) },
        { label: 'BLIND HOPS', value: String(data.blind || 0) },
        { label: 'CRYSTALS', value: String(data.crystals || 0) },
        { label: 'SLIPS', value: String(data.slips || 0) },
        { label: 'BEST COMBO', value: 'X' + (data.bestCombo || 0) }
      ];
    }
    var heroH = summit ? 52 : 64;
    var bodyH = 8 + heroH + 10 + rows.length * ROW_H + 8;
    var h = HEADER_H + bodyH + FOOTER_H;
    var y = Math.round((C.H - h) / 2);
    return {
      summit: summit, rows: rows, h: h, y: y,
      heroY: y + HEADER_H + 8, heroH: heroH,
      ruleY: y + HEADER_H + 8 + heroH + 4,
      rowsY: y + HEADER_H + 8 + heroH + 10,
      footY: y + h - FOOTER_H
    };
  }

  End.update = function (dt) {
    t += dt;
    if (inputDelay > 0) inputDelay -= dt;

    if (layout.summit) {
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

    // Quiet ticks as each row lands; one brighter note when the hero settles.
    var want = Math.min(layout.rows.length, Math.floor(Math.max(0, t - T_ROWS) / T_ROW_STEP) + (t >= T_ROWS ? 1 : 0));
    while (rowsShown < want) {
      rowsShown++;
      Aud.play('sfx_ui', { volume: 0.2, rate: 1 + rowsShown * 0.03 });
    }
    if (!heroDone && t >= T_HERO + T_HERO_LEN) {
      heroDone = true;
      var record = layout.summit ? isScoreRecord : false;
      if (record) {
        Aud.play('sfx_crystal', { volume: 0.55 });
        var hx = C.W / 2, hy = layout.heroY + 24;
        for (var i = 0; i < 18; i++) {
          Part.spawn('sparkle', hx - 50 + Math.random() * 100, hy - 6 + Math.random() * 12, {
            vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40,
            life: 0.5 + Math.random() * 0.5, w: 1, h: 1, color: COL.warn, alpha: 1, layer: 'front'
          });
        }
      } else {
        Aud.play('sfx_ui', { volume: 0.3, rate: 0.9 });
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
    if (layout.summit) drawSummitBackdrop(ctx);
    else drawWhiteoutBackdrop(ctx);

    // Card fades in and settles upward over the first quarter second.
    var ca = U.clamp((t - T_CARD) / T_CARD_LEN, 0, 1);
    var lift = Math.round((1 - U.easeOutCubic(ca)) * 6);
    ctx.save();
    ctx.globalAlpha = ca;
    ctx.translate(0, lift);
    drawCard(ctx);
    ctx.restore();

    Part.draw(ctx, 'front');
  };

  // --- backdrops -----------------------------------------------------------

  function drawSummitBackdrop(ctx) {
    Par.drawNight(ctx, 150 * C.ROW_H, SITF.time, 1);
    Part.draw(ctx, 'screen');

    // Darken toward the edges so the card is the brightest thing on screen.
    ctx.save();
    var g = ctx.createLinearGradient(0, 0, 0, C.H);
    g.addColorStop(0, U.rgba(COL.night, 0.6));
    g.addColorStop(0.5, U.rgba(COL.night, 0.3));
    g.addColorStop(1, U.rgba(COL.night, 0.75));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.W, C.H);
    var r = ctx.createRadialGradient(C.W / 2, C.H / 2, 60, C.W / 2, C.H / 2, 330);
    r.addColorStop(0, U.rgba(COL.night, 0));
    r.addColorStop(1, U.rgba('#000000', 0.55));
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.restore();
  }

  function drawWhiteoutBackdrop(ctx) {
    // The mountain where the run ended, seen as ghost shapes through the
    // whiteout: the daytime stack under a heavy white wash.
    Par.drawDay(ctx, (data.row || 0) * C.ROW_H, SITF.time, 1);
    var g = ctx.createLinearGradient(0, 0, 0, C.H);
    g.addColorStop(0, U.rgba(COL.whiteout, 0.9));
    g.addColorStop(0.55, U.rgba(COL.whiteout, 0.8));
    g.addColorStop(1, U.rgba(COL.whiteoutEdge, 0.92));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.W, C.H);

    // Slow horizontal drift bands, like wind-blown snow.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < 12; i++) {
      var yy = (i * 31 + SITF.time * 9) % C.H;
      var xx = (i * 97 + SITF.time * 40 * (1 + (i % 3) * 0.4)) % (C.W + 200) - 100;
      ctx.fillRect(Math.round(xx), Math.round(yy), 120 + (i % 4) * 30, 2);
    }
    ctx.restore();

    // Cold vignette so the dark card has soft edges to sit against.
    ctx.save();
    var r = ctx.createRadialGradient(C.W / 2, C.H / 2, 80, C.W / 2, C.H / 2, 340);
    r.addColorStop(0, U.rgba(COL.fogDark, 0));
    r.addColorStop(1, U.rgba(COL.fogDark, 0.5));
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.restore();
  }

  // --- card ----------------------------------------------------------------

  function drawCard(ctx) {
    var x = CARD_X, y = layout.y, w = CARD_W, h = layout.h;

    // Drop shadow, body, header and footer bands.
    U.panel(ctx, x + 3, y + 4, w, h, '#000000', 0.45);
    U.panel(ctx, x, y, w, h, CARD_FILL, 0.96);
    ctx.fillStyle = CARD_HEAD;
    ctx.fillRect(x + 1, y + 1, w - 2, HEADER_H - 1);
    ctx.fillStyle = CARD_FOOT;
    ctx.fillRect(x + 1, layout.footY, w - 2, FOOTER_H - 1);

    // Accent rule under the header, a hairline above the footer.
    ctx.fillStyle = layout.summit ? COL.accent : COL.warn;
    ctx.fillRect(x + 1, y + HEADER_H - 1, w - 2, 1);
    ctx.fillStyle = RULE;
    ctx.fillRect(x + 1, layout.footY, w - 2, 1);

    frame(ctx, x, y, w, h, CARD_EDGE);
    // Inner top highlight gives the card a lit edge.
    ctx.fillStyle = U.rgba(CARD_EDGE_HI, 0.8);
    ctx.fillRect(x + 2, y + 1, w - 4, 1);

    drawHeader(ctx);
    if (layout.summit) drawScoreHero(ctx); else drawAltitudeHero(ctx);

    // Rule between hero and table, fading out toward both ends.
    var rg = ctx.createLinearGradient(x + PAD, 0, x + w - PAD, 0);
    rg.addColorStop(0, U.rgba(COL.textDim, 0));
    rg.addColorStop(0.5, U.rgba(COL.textDim, 0.45));
    rg.addColorStop(1, U.rgba(COL.textDim, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(x + PAD, layout.ruleY, w - PAD * 2, 1);

    drawRows(ctx);
    drawFooter(ctx);
  }

  function frame(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y, w - 2, 1);
    ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
    ctx.fillRect(x, y + 1, 1, h - 2);
    ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  }

  function drawHeader(ctx) {
    var x = CARD_X, y = layout.y;
    var emblem = SITF.Logo && SITF.Logo.emblem;
    var tx = x + PAD;
    if (emblem) {
      ctx.drawImage(emblem, x + PAD - 2, y + Math.round((HEADER_H - emblem.height) / 2));
      tx = x + PAD + emblem.width + 8;
    }
    var title = layout.summit ? 'SUMMIT REACHED' : 'LOST IN THE WHITEOUT';
    Font.draw(ctx, title, tx, y + Math.round((HEADER_H - 14) / 2),
              { scale: 2, color: layout.summit ? COL.accent : COL.warn, shadow: COL.ink });

    // Right side of the header: the route, small and quiet. Skipped when the
    // title leaves no room for it.
    var tag = layout.summit ? M.altitudeOf(C.ROWS) + ' M' : 'ROUTE 064';
    var titleEnd = tx + Font.width(title, 2);
    if (titleEnd + 12 + Font.width(tag, 1) <= x + CARD_W - PAD) {
      Font.draw(ctx, tag, x + CARD_W - PAD, y + Math.round((HEADER_H - 7) / 2),
                { scale: 1, color: COL.textDim, align: 'right' });
    }
  }

  // Summit: the score is the single focal element, counted up.
  function drawScoreHero(ctx) {
    var y = layout.heroY;
    var final = data.score || 0;
    var p = U.clamp((t - T_HERO) / T_HERO_LEN, 0, 1);
    var shown = Math.round(final * U.easeOutCubic(p));
    var record = isScoreRecord && p >= 1;

    Font.draw(ctx, 'SCORE', C.W / 2, y, { scale: 1, color: COL.textDim, align: 'center' });
    Font.draw(ctx, String(shown), C.W / 2, y + 11,
              { scale: 3, color: record ? COL.warn : COL.text, shadow: COL.ink, align: 'center' });

    if (p >= 1) {
      if (isScoreRecord) {
        var pulse = 0.75 + 0.25 * Math.sin(t * 6);
        badge(ctx, 'NEW BEST', C.W / 2, y + 38, COL.warn, 'center', pulse);
      } else {
        Font.draw(ctx, 'BEST ' + bestScore, C.W / 2, y + 40,
                  { scale: 1, color: COL.textDim, align: 'center' });
      }
    }
  }

  // Whiteout: how high you got, with a progress bar toward the summit.
  function drawAltitudeHero(ctx) {
    var y = layout.heroY;
    var row = data.row || 0;
    var finalAlt = M.altitudeOf(row);
    var p = U.clamp((t - T_HERO) / T_HERO_LEN, 0, 1);
    var e = U.easeOutCubic(p);
    var shownAlt = C.ALT_BASE_M + Math.round((finalAlt - C.ALT_BASE_M) * e / C.ALT_PER_ROW_M) * C.ALT_PER_ROW_M;

    Font.draw(ctx, 'YOU REACHED', C.W / 2, y, { scale: 1, color: COL.textDim, align: 'center' });
    Font.draw(ctx, shownAlt + ' M', C.W / 2, y + 11,
              { scale: 3, color: COL.text, shadow: COL.ink, align: 'center' });

    // Progress track with cairn ticks; fill grows with the count-up.
    var bw = 220, bx = Math.round(C.W / 2 - bw / 2), by = y + 40;
    ctx.fillStyle = U.rgba(COL.textDim, 0.25);
    ctx.fillRect(bx, by, bw, 4);
    var frac = U.clamp(row / C.ROWS, 0, 1) * e;
    ctx.fillStyle = COL.warn;
    ctx.fillRect(bx, by, Math.round(bw * frac), 4);
    ctx.fillStyle = U.rgba(COL.ink, 0.7);
    for (var r = C.CAIRN_EVERY; r < C.ROWS; r += C.CAIRN_EVERY) {
      ctx.fillRect(bx + Math.round(bw * r / C.ROWS), by, 1, 4);
    }
    ctx.fillStyle = COL.text;
    ctx.fillRect(bx + bw - 1, by - 1, 2, 6);
    var pct = Math.round(frac * 100);
    Font.draw(ctx, pct + '% OF THE ROUTE', bx, by + 8, { scale: 1, color: COL.textDim });
    Font.draw(ctx, M.altitudeOf(C.ROWS) + ' M', bx + bw, by + 8, { scale: 1, color: COL.textDim, align: 'right' });
  }

  function drawRows(ctx) {
    var lx = CARD_X + PAD, rx = CARD_X + CARD_W - PAD;
    for (var i = 0; i < layout.rows.length; i++) {
      var start = T_ROWS + i * T_ROW_STEP;
      var a = U.clamp((t - start) / T_ROW_LEN, 0, 1);
      if (a <= 0) continue;
      var slide = Math.round((1 - U.easeOutCubic(a)) * 6);
      var row = layout.rows[i];
      var yy = layout.rowsY + i * ROW_H;

      ctx.save();
      ctx.globalAlpha = a;
      Font.draw(ctx, row.label, lx - slide, yy, { scale: 1, color: COL.textDim });
      var vw = Font.width(row.value, 1);
      Font.draw(ctx, row.value, rx + slide, yy, { scale: 1, color: row.color || COL.text, align: 'right' });

      // Dotted leader from label to value so the eye tracks across.
      var lw = Font.width(row.label, 1);
      var from = lx + lw + 8, to = rx - vw - 8;
      if (row.badge) to -= Font.width(row.badge, 1) + 12;
      ctx.fillStyle = LEADER;
      for (var dx = from + ((to - from) % 3); dx < to; dx += 3) ctx.fillRect(dx, yy + 6, 1, 1);

      if (row.badge) badge(ctx, row.badge, rx - vw - 8, yy - 2, COL.warn, 'right', 1);
      ctx.restore();
    }
  }

  // A small pill tag. align 'center' centres on x, 'right' ends at x.
  function badge(ctx, text, x, y, color, align, alpha) {
    var tw = Font.width(text, 1);
    var w = tw + 6, h = 11;
    var bx = align === 'center' ? Math.round(x - w / 2) : (align === 'right' ? x - w : x);
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * (alpha == null ? 1 : alpha);
    ctx.fillStyle = color;
    ctx.fillRect(bx + 1, y, w - 2, h);
    ctx.fillRect(bx, y + 1, w, h - 2);
    Font.draw(ctx, text, bx + 3, y + 2, { scale: 1, color: COL.ink });
    ctx.restore();
  }

  // Key-cap prompts in the footer band. Primary on the left, secondary right.
  function drawFooter(ctx) {
    var fa = U.clamp((t - T_FOOT) / 0.25, 0, 1);
    if (fa <= 0) return;
    var y = layout.footY + Math.round((FOOTER_H - 11) / 2);
    ctx.save();
    ctx.globalAlpha = fa;

    var blink = (t % 1.6) < 1.15;
    var kw = keycap(ctx, 'ENTER', CARD_X + PAD, y, blink ? COL.accent : COL.textDim);
    Font.draw(ctx, layout.summit ? 'CLIMB AGAIN' : 'TRY AGAIN', CARD_X + PAD + kw + 6, y + 2,
              { scale: 1, color: blink ? COL.text : COL.textDim });

    var label = 'TITLE';
    var lw = Font.width(label, 1);
    var ew = Font.width('ESC', 1) + 6;
    var rx = CARD_X + CARD_W - PAD;
    Font.draw(ctx, label, rx, y + 2, { scale: 1, color: COL.textDim, align: 'right' });
    keycap(ctx, 'ESC', rx - lw - 6 - ew, y, COL.textDim);
    ctx.restore();
  }

  function keycap(ctx, label, x, y, textColor) {
    var w = Font.width(label, 1) + 6, h = 11;
    ctx.fillStyle = U.rgba(COL.ink, 0.9);
    ctx.fillRect(x + 1, y + 1, w, h);          // shadow
    ctx.fillStyle = KEY_FILL;
    ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillRect(x, y + 1, w, h - 2);
    ctx.fillStyle = KEY_EDGE;
    ctx.fillRect(x + 1, y, w - 2, 1);           // top highlight
    Font.draw(ctx, label, x + 3, y + 2, { scale: 1, color: textColor });
    return w;
  }

  SITF.registerState('end', End);
})();
