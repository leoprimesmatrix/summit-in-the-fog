(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Font = SITF.Font;
  var S = SITF.Sprites;
  var M = SITF.Mountain;
  var F = SITF.Fog;
  var Part = SITF.Particles;
  var Par = SITF.Parallax;
  var Aud = SITF.Audio;
  var COL = C.COLORS;

  var climber, run, camera, shake, banner, toast, snowAcc, wispAcc, endSeq, floats, milestone, echo;

  var Play = {};

  function rowY(r) { return M.rowY(r); }
  function laneX(l) { return M.laneX(l); }

  function toScreenY(worldY) {
    return worldY - camera.y + C.CLIMBER_SCREEN_Y;
  }

  // The climber's current world position, interpolated through a hop/fall.
  function climberPos() {
    var x, y;
    if (climber.state === 'hop') {
      var t = U.clamp(climber.t, 0, 1);
      x = U.lerp(climber.fromX, climber.toX, t);
      y = U.lerp(climber.fromY, climber.toY, t) - Math.sin(Math.PI * t) * C.HOP_ARC;
    } else if (climber.state === 'slip') {
      var ts = U.clamp(climber.t, 0, 1);
      x = U.lerp(climber.fromX, climber.toX, ts);
      y = U.lerp(climber.fromY, climber.toY, ts) - Math.sin(Math.PI * ts) * 6;
    } else if (climber.state === 'fall') {
      var tf = U.clamp(climber.t, 0, 1);
      x = U.lerp(climber.fromX, climber.toX, U.easeOutQuad(tf));
      y = U.lerp(climber.fromY, climber.toY, U.easeInQuad(tf));
    } else {
      x = laneX(climber.lane);
      y = rowY(climber.row);
    }
    return { x: x, y: y };
  }

  // Fractional row used for fog, zones and the whiteout test.
  function climberRowFloat() {
    var p = climberPos();
    return -p.y / C.ROW_H;
  }

  function currentZone() {
    return U.zoneOf(U.clamp(Math.floor(climberRowFloat()), 0, C.ROWS));
  }

  // --- lifecycle -----------------------------------------------------------

  Play.enter = function () {
    M.reset();
    if (C.DEBUG) M.validate(false);
    F.reset();
    Part.clear();

    climber = {
      row: 0, lane: 1, state: 'idle', t: 0,
      fromX: laneX(1), fromY: rowY(0), toX: laneX(1), toY: rowY(0),
      targetRow: 0, targetLane: 1,
      facing: 1, frame: 0, idleTime: 0, blink: 0
    };
    run = {
      time: 0, slips: 0, combo: 0, bestCombo: 0, lastLandTime: -99,
      checkpointRow: 0, started: false, paused: false, over: false, zone: 0,
      settings: false,
      score: 0, crystals: 0, blind: 0, timeBonus: 0, clarity: 0
    };
    echo = { t: 99, x: 0, y: 0, rows: 0 };
    floats = [];
    milestone = C.ALT_BASE_M + C.MILESTONE_M;
    camera = { y: rowY(0) };
    shake = { t: 0, mag: 0 };
    banner = { text: C.ZONES[0].name, t: 2.4 };
    toast = { text: '', t: 0 };
    snowAcc = 0; wispAcc = 0;
    endSeq = { active: false, kind: '', t: 0 };

    SITF.Input.clearHop();
    Aud.ambient(1, 2.0);
  };

  Play.exit = function () {
    Aud.ambient(0, 0.8);
  };

  Play.isPaused = function () { return run && run.paused; };

  // Read-only snapshot of the run, used by the HUD-free automated checks.
  Play.snapshot = function () {
    if (!climber) return null;
    return {
      row: climber.row, lane: climber.lane, mode: climber.state,
      rowFloat: climberRowFloat(), time: run.time, slips: run.slips,
      combo: run.combo, bestCombo: run.bestCombo, checkpoint: run.checkpointRow,
      over: run.over, paused: run.paused, zone: run.zone, frontRow: F.frontRow,
      score: run.score, crystals: run.crystals, blind: run.blind, clarity: run.clarity
    };
  };

  // Development only: skip ahead to inspect a later part of the mountain.
  // Guarded so it can never fire in a shipped build (Config.DEBUG is false).
  Play.debugJump = function (rows) {
    if (!C.DEBUG || run.over) return false;
    var r = U.clamp(climber.row + rows, 0, C.ROWS);
    climber.row = r;
    climber.lane = M.rows[r].footholds[0].lane;
    climber.state = 'idle';
    climber.t = 0;
    camera.y = rowY(r);
    run.zone = U.zoneIndexOf(r);
    return true;
  };

  Play.forcePause = function () {
    if (run && !run.paused && !run.over) {
      run.paused = true;
      SITF.Input.clearHop();
    }
  };

  // --- feedback ----------------------------------------------------------

  function addFloat(text, x, worldY, color) {
    floats.push({ text: text, x: x, y: worldY, t: 0, color: color || COL.text });
  }

  function addScore(n, label, color) {
    run.score += n;
    var p = climberPos();
    addFloat((label ? label + ' ' : '') + '+' + n, p.x, p.y - 22, color);
  }

  // How many rows the landing ripple opens: momentum sees further.
  function echoRows() {
    var n = C.ECHO_ROWS_BASE;
    if (run.combo >= C.ECHO_COMBO_2) n++;
    if (run.combo >= C.ECHO_COMBO_3) n++;
    if (run.clarity > 0) n++;
    return n;
  }

  // 0..1 strength of the current echo reveal.
  function echoAlpha() {
    if (echo.t < C.ECHO_HOLD) return 1;
    var f = (echo.t - C.ECHO_HOLD) / C.ECHO_FADE;
    return f >= 1 ? 0 : 1 - f;
  }

  // --- movement ------------------------------------------------------------

  function attemptHop(dir) {
    var targetRow = climber.row + 1;
    var targetLane = climber.lane + dir;
    if (dir !== 0) climber.facing = dir;

    var pos = climberPos();
    climber.fromX = pos.x;
    climber.fromY = pos.y;
    climber.targetRow = targetRow;
    climber.t = 0;
    climber.idleTime = 0;
    F.resetLantern();

    var inRange = (targetLane >= 0 && targetLane <= 2);
    var fh = inRange ? M.footholdAt(targetRow, targetLane) : null;

    if (fh) {
      // A blind hop: the target ledge was hidden when the player committed.
      climber.blindHop = targetRow > 1 && revealAlpha(targetRow, laneX(fh.lane)) < 0.15;
      climber.targetLane = (fh.type === 'start') ? targetLane : fh.lane;
      climber.toX = laneX(climber.targetLane);
      climber.toY = rowY(targetRow);
      climber.state = 'hop';
      if (!run.started) run.started = true;
      Aud.play('sfx_hop', { volume: 0.7, rate: 0.95 + Math.random() * 0.1 });
    } else {
      // A hop into empty fog: lunge out, then fall back down the mountain.
      climber.targetLane = U.clamp(targetLane, 0, 2);
      climber.toX = laneX(U.clamp(targetLane, 0, 2)) + (inRange ? 0 : dir * 34);
      climber.toY = rowY(targetRow) + 6;
      climber.state = 'slip';
      if (!run.started) run.started = true;
      run.slips++;
      run.combo = 0;
    }
  }

  function fallTargetRow() {
    var fr = climber.row - 2;
    if (fr < run.checkpointRow) fr = run.checkpointRow;
    if (fr < 0) fr = 0;
    return fr;
  }

  function beginFall(fromPos) {
    var fr = fallTargetRow();
    var row = M.row(fr);
    var lane = climber.lane;
    if (row) {
      // Land on whichever foothold of that row is closest to the current lane.
      var best = null, bestD = 99;
      for (var i = 0; i < row.footholds.length; i++) {
        var f = row.footholds[i];
        var fl = (f.type === 'start') ? U.clamp(lane, 0, 2) : f.lane;
        var d = Math.abs(fl - lane);
        if (d < bestD) { bestD = d; best = fl; }
      }
      if (best != null) lane = best;
    }
    climber.fromX = fromPos.x;
    climber.fromY = fromPos.y;
    climber.toX = laneX(lane);
    climber.toY = rowY(fr);
    climber.targetRow = fr;
    climber.targetLane = lane;
    climber.state = 'fall';
    climber.t = 0;
    Aud.play('sfx_slip', { volume: 0.85 });
  }

  function land() {
    climber.row = climber.targetRow;
    climber.lane = climber.targetLane;
    climber.state = 'idle';
    climber.t = 0;
    climber.idleTime = 0;

    if (run.time - run.lastLandTime <= C.COMBO_WINDOW) run.combo++;
    else run.combo = 1;
    run.lastLandTime = run.time;
    if (run.combo > run.bestCombo) run.bestCombo = run.combo;

    var p = climberPos();
    var sy = toScreenY(p.y);
    Aud.play('sfx_land', {
      volume: 0.7,
      rate: run.combo >= C.COMBO_FAST_AT ? 1.1 : (0.97 + Math.random() * 0.06)
    });
    for (var d = 0; d < 3; d++) {
      Part.spawn('dust', p.x - 4 + Math.random() * 8, sy, {
        vx: (Math.random() - 0.5) * 40, vy: -12 - Math.random() * 12,
        life: 0.35, w: 1, h: 1, color: COL.snow, alpha: 0.8, layer: 'screen'
      });
    }

    // The landing ripples the fog: the next ledge (or more, with momentum)
    // shows for a moment. This is what keeps a chain alive.
    var lp = climberPos();
    echo = { t: 0, x: lp.x, y: lp.y, rows: echoRows() };
    if (run.clarity > 0) run.clarity--;
    if (echo.rows >= 2) Aud.play('sfx_echo', { volume: 0.5 + 0.15 * echo.rows });

    // Score: every ledge pays, combos multiply, hidden ledges pay extra.
    run.score += C.SCORE_HOP * Math.min(5, Math.max(1, run.combo));
    if (climber.blindHop) {
      run.blind++;
      addScore(C.SCORE_BLIND, 'BLIND', COL.accent);
    }
    climber.blindHop = false;

    // Altitude milestones.
    var altNow = M.altitudeOf(climber.row);
    if (altNow >= milestone) {
      toast = { text: milestone + ' M', t: 1.3 };
      milestone += C.MILESTONE_M;
    }

    var row = M.row(climber.row);
    if (row) {
      var fh = M.footholdAt(climber.row, climber.lane);
      if (fh && fh.crystal) {
        fh.crystal = false;
        run.crystals++;
        run.clarity = C.CLARITY_HOPS;
        addScore(C.SCORE_CRYSTAL, 'CLEAR SIGHT', COL.accent);
        Aud.play('sfx_crystal', { volume: 0.8 });
        var cp = climberPos(), csy = toScreenY(cp.y);
        for (var ci = 0; ci < 10; ci++) {
          Part.spawn('sparkle', cp.x - 6 + Math.random() * 12, csy - 8 - Math.random() * 8, {
            vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 30,
            life: 0.5 + Math.random() * 0.4, w: 1, h: 1, color: COL.accent, alpha: 1, layer: 'screen'
          });
        }
      }
      if (fh && fh.type === 'crumble' && fh.state === 'ok') {
        M.arm(fh);
        Aud.play('sfx_crumble', { volume: 0.6 });
      }
      if (row.cairn && !row.cairn.lit) lightCairn(row);
      if (row.summit) reachSummit();
    }

    // Zone banner on crossing into a new band of the mountain.
    var zi = U.zoneIndexOf(climber.row);
    if (zi !== run.zone) {
      run.zone = zi;
      banner = { text: C.ZONES[zi].name, t: 2.4 };
    }
  }

  function lightCairn(row) {
    row.cairn.lit = true;
    row.cairn.pop = 0.3;
    run.checkpointRow = row.index;
    F.addClearing(row.index, climber.lane);
    F.pushWhiteout();
    Aud.play('sfx_cairn', { volume: 0.9 });
    run.score += C.SCORE_CAIRN;
    toast = { text: 'CHECKPOINT', t: 1.4 };

    var p = climberPos();
    var sy = toScreenY(p.y);
    for (var i = 0; i < 14; i++) {
      Part.spawn('sparkle', p.x - 8 + Math.random() * 16, sy - Math.random() * 14, {
        vx: (Math.random() - 0.5) * 24, vy: -22 - Math.random() * 26,
        life: 0.7 + Math.random() * 0.5, w: 1, h: 1,
        color: Math.random() < 0.5 ? COL.accent : COL.lantern,
        alpha: 1, layer: 'screen'
      });
    }
  }

  function reachSummit() {
    if (endSeq.active) return;
    endSeq = { active: true, kind: 'summit', t: 0 };
    climber.state = 'summit';
    run.over = true;
    run.score += C.SCORE_SUMMIT;
    run.timeBonus = Math.max(0, Math.round((C.SCORE_TIME_PAR - run.time) * C.SCORE_TIME_BONUS_PER_SEC));
    run.score += run.timeBonus;
    F.blowAway();
    Aud.ambient(0, 2.0);
    Aud.play('sfx_summit', { volume: 1 });

    var p = climberPos();
    var sy = toScreenY(p.y);
    for (var i = 0; i < 60; i++) {
      Part.spawn('sparkle', p.x - 30 + Math.random() * 60, sy - Math.random() * 50, {
        vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 50,
        life: 1.0 + Math.random() * 1.2, w: 1, h: 1,
        color: [COL.accent, COL.lantern, COL.text][Math.floor(Math.random() * 3)],
        alpha: 1, layer: 'screen'
      });
    }
  }

  function endWhiteout() {
    if (endSeq.active) return;
    endSeq = { active: true, kind: 'whiteout', t: 0 };
    run.over = true;
    Aud.play('sfx_whiteout', { volume: 1 });
    Aud.ambient(0, 1.0);
    shake.t = 0.5; shake.mag = 3;
  }

  function addShake(mag, dur) {
    shake.mag = Math.max(shake.mag, mag);
    shake.t = Math.max(shake.t, dur);
  }

  // --- update --------------------------------------------------------------

  Play.update = function (dt) {
    handleActions();

    if (run.paused) return;

    if (endSeq.active) {
      endSeq.t += dt;
      Part.update(dt);
      if (shake.t > 0) shake.t -= dt;
      if (endSeq.kind === 'summit') {
        F.updateGust(dt, currentZone(), null);
        if (endSeq.t > 2.6) {
          SITF.setState('end', {
            result: 'summit', time: run.time, slips: run.slips,
            bestCombo: run.bestCombo, row: climber.row,
            score: run.score, timeBonus: run.timeBonus, blind: run.blind, crystals: run.crystals
          });
          endSeq.active = false;
        }
      } else {
        F.updateSurge(dt);
        if (endSeq.t > 1.5) {
          SITF.setState('end', {
            result: 'whiteout', time: run.time, slips: run.slips,
            bestCombo: run.bestCombo, row: climber.row,
            score: run.score, blind: run.blind, crystals: run.crystals
          });
          endSeq.active = false;
        }
      }
      return;
    }

    if (run.started) run.time += dt;

    M.update(dt);
    for (var e = 0; e < M.events.length; e++) {
      var ev = M.events[e];
      if (ev.type === 'crumbleCollapse' &&
          climber.state === 'idle' && climber.row === ev.row && climber.lane === ev.lane) {
        run.slips++;
        run.combo = 0;
        addShake(2, 0.2);
        beginFall(climberPos());
      }
    }

    updateClimber(dt);

    var zone = currentZone();
    F.updateGust(dt, zone, onGust);
    F.updateWhiteout(dt, climberRowFloat(), zone);
    F.updateLantern(dt, climber.state === 'idle' ? climber.idleTime : 0);

    if (F.frontRow >= climberRowFloat() + 0.15) {
      endWhiteout();
      return;
    }

    // Camera follows the climber with a little lag.
    var p = climberPos();
    camera.y += (p.y - camera.y) * C.CAMERA_LERP;
    if (camera.y > rowY(0)) camera.y = rowY(0);

    updateAmbientParticles(dt, zone);
    Part.update(dt);

    if (shake.t > 0) shake.t -= dt;
    if (banner.t > 0) banner.t -= dt;
    if (toast.t > 0) toast.t -= dt;
    echo.t += dt;
    for (var fi = floats.length - 1; fi >= 0; fi--) {
      floats[fi].t += dt;
      floats[fi].y -= 22 * dt;
      if (floats[fi].t > 1.1) floats.splice(fi, 1);
    }

    var rowsData = M.rows;
    for (var r = 0; r < rowsData.length; r++) {
      if (rowsData[r].cairn && rowsData[r].cairn.pop > 0) {
        rowsData[r].cairn.pop = Math.max(0, rowsData[r].cairn.pop - dt);
      }
    }
  };

  function updateClimber(dt) {
    switch (climber.state) {
      case 'idle':
        climber.idleTime += dt;
        climber.frame = Math.floor(SITF.time * 2) % 2;
        var dir = SITF.Input.takeHop();
        if (dir !== null) attemptHop(dir);
        break;

      case 'hop':
        var hopTime = (run.combo >= C.COMBO_FAST_AT) ? C.COMBO_HOP_TIME : C.HOP_TIME;
        climber.t += dt / hopTime;
        if (climber.t >= 1) { climber.t = 1; land(); }
        break;

      case 'slip':
        climber.t += dt / C.SLIP_LUNGE_TIME;
        if (climber.t >= 1) beginFall(climberPos());
        break;

      case 'fall':
        climber.t += dt / C.FALL_TIME;
        if (climber.t >= 1) {
          climber.row = climber.targetRow;
          climber.lane = climber.targetLane;
          climber.state = 'recover';
          climber.t = 0;
          climber.idleTime = 0;
          addShake(3, 0.2);
          Aud.play('sfx_land', { volume: 0.9, rate: 0.85 });
          var p = climberPos();
          var sy = toScreenY(p.y);
          for (var i = 0; i < 6; i++) {
            Part.spawn('dust', p.x - 6 + Math.random() * 12, sy, {
              vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 20,
              life: 0.45, w: 1, h: 1, color: COL.snow, alpha: 0.9, layer: 'screen'
            });
          }
        }
        break;

      case 'recover':
        climber.t += dt / C.RECOVER_TIME;
        if (climber.t >= 1) { climber.state = 'idle'; climber.t = 0; SITF.Input.clearHop(); }
        break;
    }
  }

  function onGust(zone) {
    Aud.play('sfx_gust', { volume: 0.85 });
    Part.gustBoost = C.GUST_DURATION;
    var topY = toScreenY(rowY(climberRowFloat() + F.gustReveal));
    var botY = toScreenY(climberPos().y);
    for (var i = 0; i < 40; i++) {
      var y = topY + Math.random() * Math.max(10, botY - topY);
      Part.spawn('streak', -30 - Math.random() * 60, y, {
        vx: 300 + Math.random() * 120, vy: 0,
        life: 0.6 + Math.random() * 0.3,
        w: 12 + Math.floor(Math.random() * 18), h: 1,
        color: COL.text, alpha: 0.35 + Math.random() * 0.3, layer: 'screen'
      });
    }
  }

  function updateAmbientParticles(dt, zone) {
    var zi = U.zoneIndexOf(U.clamp(climber.row, 0, C.ROWS));
    var rate = [0, 6, 14][zi];
    if (rate > 0) {
      snowAcc += dt * rate;
      while (snowAcc >= 1) {
        snowAcc -= 1;
        Part.spawn('snow', Math.random() * C.W, -4, {
          vx: -10 + Math.random() * 20, vy: 25 + Math.random() * 20,
          life: 9, w: 1, h: 1, color: COL.snow,
          alpha: 0.5 + Math.random() * 0.4, layer: 'screen'
        });
      }
    }
    wispAcc += dt;
    if (wispAcc > 2) {
      wispAcc = 0;
      Part.spawn('wisp', -30, 60 + Math.random() * (C.H - 80), {
        vx: 22 + Math.random() * 18, vy: 0, life: 12,
        w: 24 + Math.floor(Math.random() * 20), h: 2 + Math.floor(Math.random() * 4),
        color: COL.fog, alpha: 0.22, layer: 'screen'
      });
    }
  }

  function handleActions() {
    var acts = SITF.Input.takeActions();
    if (run.paused && run.settings) {
      SITF.Input.clearHop();
      if (SITF.SettingsPanel.update(1 / 60, acts)) run.settings = false;
      return;
    }
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a === 'mute') { Aud.toggleMuted(); continue; }
      if (run.over) continue;
      if (a === 'settings' && run.paused) {
        Aud.ui();
        run.settings = true;
        SITF.SettingsPanel.open();
        continue;
      }
      if (a === 'pause') {
        run.paused = !run.paused;
        SITF.Input.clearHop();
        Aud.ui();
      } else if (a === 'restart' && run.paused) {
        Aud.ui();
        SITF.setState('play');
      } else if (a === 'quit' && run.paused) {
        Aud.ui();
        SITF.setState('title');
      }
    }
  }

  // --- draw ----------------------------------------------------------------

  Play.draw = function (ctx) {
    var rf = climberRowFloat();
    var climbPx = -camera.y;
    var p = climberPos();

    var sx = 0, sy = 0;
    if (shake.t > 0) {
      sx = (Math.random() - 0.5) * 2 * shake.mag;
      sy = (Math.random() - 0.5) * 2 * shake.mag;
    }

    var fogLineY = toScreenY(p.y) - C.ROW_H * 0.5;
    var topRow = Math.min(C.ROWS, Math.floor(rf + (C.H / C.ROW_H) + 2));
    var botRow = Math.max(0, Math.floor(rf - (C.H / C.ROW_H) - 2));

    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));

    Par.draw(ctx, rf, climbPx, SITF.time);
    // Only the part of the mountain the fog does not cover.
    drawRows(ctx, botRow, topRow, fogLineY, false);

    ctx.restore();

    // Fog covers everything above the climber.
    var lanternTargets = [];
    if (F.lanternAlpha > 0 && climber.state === 'idle') {
      var nr = M.row(climber.row + 1);
      if (nr) {
        for (var i = 0; i < nr.footholds.length; i++) {
          var f = nr.footholds[i];
          var fl = (f.type === 'start') ? climber.lane : f.lane;
          if (f.state === 'gone') continue;
          lanternTargets.push({ x: laneX(fl), y: toScreenY(rowY(climber.row + 1)) });
        }
      }
    }

    var clearingPoints = [];
    for (var c = 0; c < F.clearings.length; c++) {
      var cl = F.clearings[c];
      var cy = toScreenY(rowY(cl.row));
      if (cy > -120 && cy < C.H + 120) {
        clearingPoints.push({ x: laneX(cl.lane), y: cy });
      }
    }

    F.draw(ctx, {
      toScreenY: toScreenY,
      climberRowFloat: rf,
      fogLineY: fogLineY,
      density: U.zoneField(U.clamp(rf, 0, C.ROWS), 'fogDensity', 8),
      color: Par.fogColorAt(rf),
      lanternTargets: lanternTargets,
      clearingPoints: clearingPoints,
      echo: { x: echo.x, y: toScreenY(echo.y) - 8, r: 26 + Math.min(1, echo.t / 0.5) * 70, alpha: echoAlpha() }
    });

    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));

    // The lantern glows *in* the fog, so it is lit after the fog is laid down.
    var glowA = (climber.state === 'idle' || climber.state === 'recover')
      ? 0.22 + 0.30 * F.lanternAlpha : 0.16;
    S.drawGlow(ctx, S.img.glow_lantern, p.x + 6, toScreenY(p.y) - 10, glowA, 1);

    // Ledges the wind, the lantern or a cairn has found emerge from the fog.
    drawRows(ctx, botRow, topRow, fogLineY, true);

    // The climber always stays legible, never lost inside the fog.
    drawClimberLayer(ctx, p);

    ctx.restore();

    Part.draw(ctx, 'screen');
    F.drawWhiteout(ctx, toScreenY(rowY(F.frontRow)) + 6);

    // Floating score text.
    for (var fl = 0; fl < floats.length; fl++) {
      var ft = floats[fl];
      var fa = ft.t < 0.8 ? 1 : 1 - (ft.t - 0.8) / 0.3;
      Font.draw(ctx, ft.text, ft.x, toScreenY(ft.y), { scale: 1, align: 'center', color: ft.color, shadow: COL.ink, alpha: fa });
    }

    // Danger: the whiteout is close. The bottom of the screen pulses cold white.
    var gapRows = rf - F.frontRow;
    if (gapRows < C.DANGER_ROWS && !run.over) {
      var danger = U.clamp(1 - gapRows / C.DANGER_ROWS, 0, 1);
      var pulse = 0.5 + 0.5 * Math.sin(SITF.time * (6 + danger * 8));
      ctx.save();
      var dg = ctx.createLinearGradient(0, C.H, 0, C.H * 0.45);
      dg.addColorStop(0, U.rgba(COL.whiteout, 0.55 * danger * (0.6 + 0.4 * pulse)));
      dg.addColorStop(1, U.rgba(COL.whiteout, 0));
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.restore();
    }

    drawHUD(ctx, rf);

    if (run.paused) {
      if (run.settings) {
        ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = COL.ink; ctx.fillRect(0, 0, C.W, C.H); ctx.restore();
        SITF.SettingsPanel.draw(ctx);
      } else {
        drawPause(ctx);
      }
    }
  };

  // How strongly a row above the fog line is currently revealed.
  // The three sources are the wind gust, the lantern, and lit cairns.
  function revealAlpha(r, x) {
    var a = 0;

    // Gust: a band of rows swept clear from the left.
    if (F.gustProgress >= 0) {
      var top = Math.floor(climberRowFloat()) + 1;
      if (r >= top && r <= top + F.gustReveal - 1) {
        var wipeX = F.gustWipeX();
        var w = 0;
        if (x < wipeX - 20) w = 1;
        else if (x < wipeX + 20) w = (wipeX + 20 - x) / 40;
        a = Math.max(a, F.gustAlpha() * w);
      }
    }

    // Echo step: the rows just above the last landing, briefly.
    var ea = echoAlpha();
    if (ea > 0 && r > climber.row && r <= climber.row + echo.rows) a = Math.max(a, ea);

    // Lantern: the single next row, while standing still.
    if (F.lanternAlpha > 0 && climber.state === 'idle' && r === climber.row + 1) {
      a = Math.max(a, F.lanternAlpha);
    }

    // Lit cairns keep their surroundings visible for the rest of the run.
    for (var i = 0; i < F.clearings.length; i++) {
      var cl = F.clearings[i];
      var dy = Math.abs(rowY(r) - rowY(cl.row));
      var dx = Math.abs(x - laneX(cl.lane));
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < C.CAIRN_CLEAR_RADIUS) {
        a = Math.max(a, U.clamp(1 - d / C.CAIRN_CLEAR_RADIUS, 0, 1) * 1.6);
      }
    }

    if (F.globalReveal > 0) a = Math.max(a, F.globalReveal);
    return U.clamp(a, 0, 1);
  }

  // Rows the fog does not cover are drawn with the world; rows above the fog
  // line are drawn again on top of the fog, only as far as they are revealed.
  function drawRows(ctx, fromRow, toRow, fogLineY, above) {
    for (var r = fromRow; r <= toRow; r++) {
      var row = M.row(r);
      if (!row) continue;
      var y = toScreenY(rowY(r));
      if (y < -40 || y > C.H + 40) continue;
      var isAbove = y < fogLineY - 2;
      if (isAbove !== above) continue;
      drawRow(ctx, row, r, y, above);
    }
  }

  function drawRow(ctx, row, r, y, above) {
    var alpha = 1;
    if (above) {
      var probe = laneX(row.footholds[0].lane);
      alpha = revealAlpha(r, probe);
      if (alpha <= 0.02) return;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    {
      for (var i = 0; i < row.footholds.length; i++) {
        var f = row.footholds[i];
        var x = (f.type === 'start') ? C.LANE_X[1] : laneX(f.lane);

        if (f.state === 'gone') {
          if (f.debris > 0) {
            var k = 1 - (f.debris / 0.4);
            ctx.save();
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = COL.rockDark;
            for (var d = 0; d < 4; d++) {
              var dx = x - 14 + d * 9;
              ctx.fillRect(Math.round(dx), Math.round(y + k * 40 + d * 3), 2, 2);
            }
            ctx.restore();
          }
          continue;
        }

        var jitter = 0, darken = 0;
        if (f.state === 'armed') {
          jitter = (Math.floor(SITF.time * 30) % 2 === 0) ? 1 : -1;
          darken = 0.18;
        }
        if (f.type === 'summit') {
          S.drawLedge(ctx, x, y, 'rock', 0, 0);
        } else {
          S.drawLedge(ctx, x, y, f.type, jitter, darken);
        }
        if (f.crystal) {
          var bobC = Math.round(Math.sin(SITF.time * 3 + r) * 1.5);
          S.drawGlow(ctx, S.img.glow_cairn, x, y - 6 + bobC, 0.35, 0.6);
          ctx.drawImage(S.img.crystal, Math.round(x - 2), Math.round(y - 9 + bobC));
        }
      }

      if (row.cairn) {
        var cx = laneX(row.footholds[0].lane) + 13;
        var pop = row.cairn.pop > 0 ? 1 + U.easeOutBack(1 - row.cairn.pop / 0.3) * 0.12 : 1;
        if (row.cairn.lit) {
          S.drawGlow(ctx, S.img.glow_cairn, cx, y - 12, 0.55 + 0.12 * Math.sin(SITF.time * 3), 1);
        }
        S.drawCairn(ctx, cx, y, row.cairn.lit, pop);
      }

      if (row.summit) {
        // Offset so the climber does not stand in front of the flag.
        S.drawSummit(ctx, laneX(row.footholds[0].lane) + 14, y, Math.floor(SITF.time * 3) % 2);
      }
    }

    ctx.restore();
  }

  function drawClimberLayer(ctx, p) {
    var psy = toScreenY(p.y);

    var pose = climber.state;
    if (pose === 'recover' || pose === 'summit') pose = 'idle';

    var visible = true;
    if (climber.state === 'recover') {
      visible = (Math.floor(climber.t * C.RECOVER_TIME / 0.08) % 2) === 0;
    }
    if (visible) {
      S.drawClimber(ctx, p.x, psy, pose, climber.frame, climber.facing);
    }

    // Beside the climber, not above: the row above is where the next ledge is.
    if (run.combo >= 2 && climber.state !== 'summit') {
      var tagX = (climber.lane === 2) ? p.x - 16 : p.x + 16;
      Font.draw(ctx, 'X' + run.combo, tagX, psy - S.CLIMBER_H + 2, {
        scale: 1, align: (climber.lane === 2) ? 'right' : 'left',
        color: run.combo >= 8 ? COL.warn : COL.accent,
        shadow: COL.ink
      });
    }

    Part.draw(ctx, 'world');
  }

  function drawHUD(ctx, rf) {
    var alt = M.altitudeOf(U.clamp(rf, 0, C.ROWS));
    Font.draw(ctx, 'ALT ' + alt + ' M', 8, 8, { scale: 1, color: COL.text, shadow: COL.ink });
    Font.draw(ctx, U.formatTime(run.time), C.W - 44, 8,
              { scale: 1, color: COL.text, shadow: COL.ink, align: 'right' });
    Font.draw(ctx, String(run.score), C.W - 44, 20,
              { scale: 1, color: COL.accent, shadow: COL.ink, align: 'right' });

    // Clear sight buff from a crystal.
    if (run.clarity > 0) {
      ctx.drawImage(S.img.crystal, 8, 20);
      Font.draw(ctx, 'CLEAR SIGHT ' + run.clarity, 16, 20, { scale: 1, color: COL.accent, shadow: COL.ink });
    }

    // Gust anticipation: three lines that pulse just before the wind arrives.
    var tg = F.timeToGust();
    var gusting = F.isGusting();
    var showWind = gusting || tg < 0.5;
    if (showWind) {
      var a = gusting ? 1 : (0.35 + 0.65 * (1 - tg / 0.5));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = gusting ? COL.accent : COL.text;
      var wx = C.W / 2 - 12, wy = 10;
      ctx.fillRect(wx, wy, 20, 1);
      ctx.fillRect(wx + 4, wy + 3, 20, 1);
      ctx.fillRect(wx, wy + 6, 14, 1);
      ctx.restore();
    }

    // Zone banner.
    if (banner.t > 0) {
      var ba = Math.min(1, banner.t / 0.5);
      Font.draw(ctx, banner.text, C.W / 2, 40,
                { scale: 2, align: 'center', color: COL.text, shadow: COL.ink, alpha: ba });
    }
    if (toast.t > 0) {
      var ta = Math.min(1, toast.t / 0.4);
      Font.draw(ctx, toast.text, C.W / 2, 62,
                { scale: 1, align: 'center', color: COL.accent, shadow: COL.ink, alpha: ta });
    }

    drawAltBar(ctx, rf);
  }

  function drawAltBar(ctx, rf) {
    var bx = 561, top = 20, bot = 304;
    var h = bot - top;

    function mapRow(r) {
      return bot - (U.clamp(r, 0, C.ROWS) / C.ROWS) * h;
    }

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = COL.ink;
    ctx.fillRect(bx, top, 4, h);
    ctx.globalAlpha = 1;

    // Whiteout fill from the bottom.
    var fy = mapRow(F.frontRow);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = COL.whiteout;
    if (fy < bot) ctx.fillRect(bx, Math.round(fy), 4, Math.round(bot - fy));
    ctx.globalAlpha = 1;

    // Cairn ticks.
    for (var r = C.CAIRN_EVERY; r < C.ROWS; r += C.CAIRN_EVERY) {
      var row = M.row(r);
      var lit = row && row.cairn && row.cairn.lit;
      ctx.fillStyle = lit ? COL.accent : COL.textDim;
      ctx.globalAlpha = lit ? 1 : 0.5;
      ctx.fillRect(bx - 2, Math.round(mapRow(r)), 8, 1);
    }
    ctx.globalAlpha = 1;

    // Summit tick.
    ctx.fillStyle = COL.text;
    ctx.fillRect(bx - 3, top - 2, 10, 2);

    // Climber marker.
    ctx.fillStyle = COL.parka;
    ctx.fillRect(bx - 1, Math.round(mapRow(rf)) - 1, 6, 3);
    ctx.restore();
  }

  function drawPause(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = COL.ink;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.restore();

    Font.draw(ctx, 'PAUSED', C.W / 2, 110, { scale: 3, align: 'center', color: COL.text, shadow: '#000' });
    Font.draw(ctx, 'ESC  RESUME', C.W / 2, 170, { scale: 1, align: 'center', color: COL.textDim });
    Font.draw(ctx, 'R  RESTART', C.W / 2, 186, { scale: 1, align: 'center', color: COL.textDim });
    Font.draw(ctx, 'Q  TITLE', C.W / 2, 202, { scale: 1, align: 'center', color: COL.textDim });
    Font.draw(ctx, 'S  SETTINGS', C.W / 2, 218, { scale: 1, align: 'center', color: COL.textDim });
    Font.draw(ctx, 'M  ' + (Aud.muted ? 'UNMUTE' : 'MUTE'), C.W / 2, 234,
              { scale: 1, align: 'center', color: Aud.muted ? COL.warn : COL.textDim });
  }

  SITF.registerState('play', Play);
})();
