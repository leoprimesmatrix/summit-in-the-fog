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

  var climber, run, camera, shake, banner, toast, snowAcc, wispAcc, leafAcc, moteAcc,
      dustAcc, breathAcc,
      endSeq, milestone, echo, flash, cairnCount;

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

  function nightAmount() { return Par.nightAt(climberRowFloat()); }
  function duskAmount() { return Par.duskAt(climberRowFloat()); }

  // --- lifecycle -----------------------------------------------------------

  Play.enter = function () {
    M.reset();
    if (C.DEBUG) M.validate(false);
    F.reset();
    Part.clear();
    SITF.Sky.reset();

    climber = {
      row: 0, lane: 1, state: 'idle', t: 0,
      fromX: laneX(1), fromY: rowY(0), toX: laneX(1), toY: rowY(0),
      targetRow: 0, targetLane: 1,
      facing: 1, frame: 0, idleTime: 0, blink: 0, landT: 0, trailAcc: 0
    };
    run = {
      time: 0, slips: 0, combo: 0, bestCombo: 0, lastLandTime: -99,
      checkpointRow: 0, started: false, paused: false, over: false, zone: 0,
      settings: false,
      score: 0, crystals: 0, blind: 0, timeBonus: 0, clarity: 0
    };
    echo = { t: 99, x: 0, y: 0, rows: 0 };
    flash = { t: 0, dur: 1, color: '#ffffff', peak: 0 };
    milestone = C.ALT_BASE_M + C.MILESTONE_M;
    camera = { y: rowY(0) };
    shake = { t: 0, mag: 0 };
    banner = { text: C.ZONES[0].name, t: 2.4, dur: 2.4 };
    toast = { text: '', t: 0, dur: 1 };
    snowAcc = 0; wispAcc = 0; leafAcc = 0; moteAcc = 0; dustAcc = 0; breathAcc = 0;
    endSeq = { active: false, kind: '', t: 0 };
    cairnCount = 0;
    for (var r = 0; r < M.rows.length; r++) if (M.rows[r].cairn) cairnCount++;

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

  function addFlash(color, peak, dur) {
    flash = { t: dur, dur: dur, color: color, peak: peak };
  }

  function setToast(text, dur) {
    toast = { text: text, t: dur, dur: dur };
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

  // Snow kicked up from a ledge: a low cloud that spreads and fades.
  function landingPuff(x, sy, strength) {
    var n = 4 + Math.round(strength * 4);
    for (var i = 0; i < n; i++) {
      var side = (i % 2 === 0) ? -1 : 1;
      Part.spawn('puff', x + side * (2 + Math.random() * 6), sy - 1 - Math.random() * 2, {
        vx: side * (18 + Math.random() * 30) * strength, vy: -6 - Math.random() * 10,
        life: 0.35 + Math.random() * 0.2, w: 2, h: 1, grow: 2 + Math.round(strength * 2),
        color: COL.snow, alpha: 0.7, layer: 'screen'
      });
    }
    for (var d = 0; d < 3; d++) {
      Part.spawn('dust', x - 4 + Math.random() * 8, sy, {
        vx: (Math.random() - 0.5) * 50 * strength, vy: -14 - Math.random() * 16,
        life: 0.35, w: 1, h: 1, color: COL.snow, alpha: 0.85, layer: 'screen'
      });
    }
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
    climber.landT = 0;
    F.resetLantern();

    var inRange = (targetLane >= 0 && targetLane <= 2);
    var fh = inRange ? M.footholdAt(targetRow, targetLane) : null;

    // Push-off dust behind the feet.
    var sy = toScreenY(pos.y);
    for (var i = 0; i < 2; i++) {
      Part.spawn('dust', pos.x - dir * 3 + (Math.random() - 0.5) * 4, sy - 1, {
        vx: -dir * (20 + Math.random() * 20) - (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 10,
        life: 0.3, w: 1, h: 1, color: COL.snow, alpha: 0.7, layer: 'screen'
      });
    }

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
    climber.landT = C.LAND_SQUASH;

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
    landingPuff(p.x, sy, 0.7 + Math.min(0.6, run.combo * 0.06));

    // The landing ripples the fog: the next ledge (or more, with momentum)
    // shows for a moment. This is what keeps a chain alive. A visible ring
    // spreads from the feet so the mechanic can be read, not just inferred.
    var lp = climberPos();
    echo = { t: 0, x: lp.x, y: lp.y, rows: echoRows() };
    if (run.clarity > 0) run.clarity--;
    if (echo.rows >= 2) Aud.play('sfx_echo', { volume: 0.5 + 0.15 * echo.rows });
    Part.spawn('ring', p.x, sy - 1, {
      life: 0.45 + 0.08 * echo.rows, r: 22 + 10 * echo.rows, w: 1, grow: 0.42,
      color: echo.rows >= 3 ? COL.warn : COL.accent, alpha: 0.55 + 0.1 * echo.rows, layer: 'screen'
    });

    // Score: every ledge pays, combos multiply, hidden ledges pay extra.
    run.score += C.SCORE_HOP * Math.min(5, Math.max(1, run.combo));
    if (climber.blindHop) {
      run.blind++;
      run.score += C.SCORE_BLIND;
    }
    climber.blindHop = false;

    // Altitude milestones.
    var altNow = M.altitudeOf(climber.row);
    if (altNow >= milestone) {
      setToast(milestone + ' M', 1.3);
      milestone += C.MILESTONE_M;
    }

    var row = M.row(climber.row);
    if (row) {
      var fh = M.footholdAt(climber.row, climber.lane);
      if (fh && fh.crystal) {
        fh.crystal = false;
        run.crystals++;
        run.clarity = C.CLARITY_HOPS;
        run.score += C.SCORE_CRYSTAL;
        Aud.play('sfx_crystal', { volume: 0.8 });
        addFlash(COL.accent, 0.10, 0.25);
        var cp = climberPos(), csy = toScreenY(cp.y);
        for (var ci = 0; ci < 14; ci++) {
          Part.spawn('sparkle', cp.x - 6 + Math.random() * 12, csy - 8 - Math.random() * 8, {
            vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 40,
            life: 0.5 + Math.random() * 0.5, w: 1, h: 1,
            color: ci % 3 === 0 ? '#ffffff' : COL.accent, alpha: 1, layer: 'screen'
          });
        }
        Part.spawn('ring', cp.x, csy - 8, {
          life: 0.5, r: 30, w: 1, grow: 1, color: COL.accent, alpha: 0.7, layer: 'screen'
        });
      }
      if (fh && fh.type === 'crumble' && fh.state === 'ok') {
        M.arm(fh);
        Aud.play('sfx_crumble', { volume: 0.6 });
        addShake(1, 0.15);
      }
      if (row.cairn && !row.cairn.lit) lightCairn(row);
      if (row.summit) reachSummit();
    }

    // Zone banner on crossing into a new band of the mountain.
    var zi = U.zoneIndexOf(climber.row);
    if (zi !== run.zone) {
      run.zone = zi;
      banner = { text: C.ZONES[zi].name, t: 2.6, dur: 2.6 };
    }
  }

  function lightCairn(row) {
    row.cairn.lit = true;
    row.cairn.pop = 0.35;
    run.checkpointRow = row.index;
    F.addClearing(row.index, climber.lane);
    F.pushWhiteout();
    Aud.play('sfx_cairn', { volume: 0.9 });
    run.score += C.SCORE_CAIRN;
    var n = Math.round(row.index / C.CAIRN_EVERY);
    setToast('CHECKPOINT ' + n + ' / ' + cairnCount, 1.6);
    addFlash(COL.lantern, 0.18, 0.4);
    addShake(1, 0.12);

    var cx = laneX(row.footholds[0].lane) + 13;
    var sy = toScreenY(rowY(row.index));
    // Light bursts out of the niche and a ring of warmth rolls outward.
    Part.spawn('ring', cx, sy - 9, {
      life: 0.7, r: 54, w: 2, grow: 0.8, color: COL.lantern, alpha: 0.8, layer: 'screen'
    });
    Part.spawn('ring', cx, sy - 9, {
      life: 1.0, r: 80, w: 1, grow: 0.8, color: COL.lantern, alpha: 0.45, layer: 'screen'
    });
    for (var i = 0; i < 18; i++) {
      Part.spawn('ember', cx - 3 + Math.random() * 6, sy - 8 - Math.random() * 6, {
        vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 50,
        life: 0.8 + Math.random() * 0.8, w: 1, h: 1,
        color: Math.random() < 0.5 ? COL.lantern : '#fff1b8',
        alpha: 1, layer: 'screen'
      });
    }
    for (var j = 0; j < 8; j++) {
      Part.spawn('sparkle', cx - 8 + Math.random() * 16, sy - Math.random() * 14, {
        vx: (Math.random() - 0.5) * 24, vy: -22 - Math.random() * 26,
        life: 0.7 + Math.random() * 0.5, w: 1, h: 1, color: COL.accent, alpha: 1, layer: 'screen'
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
    addFlash('#ffffff', 0.55, 0.9);

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
    for (var k = 0; k < 3; k++) {
      Part.spawn('ring', p.x, sy - 10, {
        life: 1.0 + k * 0.25, r: 70 + k * 40, w: 2 - (k > 0 ? 1 : 0), grow: 0.8,
        color: k === 1 ? COL.accent : '#ffffff', alpha: 0.7 - k * 0.15, layer: 'screen'
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

    if (flash.t > 0) flash.t -= dt;

    if (endSeq.active) {
      endSeq.t += dt;
      Part.update(dt);
      F.tick(dt);
      updateFogAlphas(dt);
      if (shake.t > 0) shake.t -= dt;
      if (endSeq.kind === 'summit') {
        F.updateGust(dt, currentZone(), null);
        // Light drifts up from below as the sky clears.
        moteAcc += dt * 18;
        while (moteAcc >= 1) {
          moteAcc -= 1;
          Part.spawn('mote', Math.random() * C.W, C.H + 4, {
            vx: (Math.random() - 0.5) * 10, vy: -40 - Math.random() * 50,
            life: 2.5 + Math.random() * 2, w: 1, h: 1,
            color: Math.random() < 0.5 ? COL.accent : '#ffffff', alpha: 0.9, layer: 'screen'
          });
        }
        // Camera eases upward to frame the summit and the sky.
        var p0 = climberPos();
        camera.y += ((p0.y + 26 * U.clamp(endSeq.t / 2, 0, 1)) - camera.y) * 0.05;
        if (endSeq.t > 2.8) {
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
      if (ev.type === 'crumbleCollapse') {
        // Rock chips fly whether or not anyone was standing there.
        var esy = toScreenY(rowY(ev.row));
        var ex = laneX(ev.lane);
        for (var di = 0; di < 8; di++) {
          Part.spawn('debris', ex - 16 + Math.random() * 32, esy + 2 + Math.random() * 5, {
            vx: (Math.random() - 0.5) * 60, vy: 10 + Math.random() * 40,
            life: 0.6 + Math.random() * 0.4, w: 1 + Math.floor(Math.random() * 2), h: 1,
            color: Math.random() < 0.5 ? COL.rockDark : COL.rock, alpha: 1, layer: 'screen'
          });
        }
        if (climber.state === 'idle' && climber.row === ev.row && climber.lane === ev.lane) {
          run.slips++;
          run.combo = 0;
          addShake(2, 0.2);
          beginFall(climberPos());
        }
      }
    }

    updateClimber(dt);

    var zone = currentZone();
    F.updateGust(dt, zone, onGust);
    F.updateWhiteout(dt, climberRowFloat(), zone);
    F.updateLantern(dt, climber.state === 'idle' ? climber.idleTime : 0);
    F.tick(dt);
    updateFogAlphas(dt);

    if (F.frontRow >= climberRowFloat() + 0.15) {
      endWhiteout();
      return;
    }

    // Camera follows the climber with a little lag.
    var p = climberPos();
    camera.y += (p.y - camera.y) * C.CAMERA_LERP;
    if (camera.y > rowY(0)) camera.y = rowY(0);

    updateAmbientParticles(dt, zone);
    updateCairnEmbers(dt);
    Part.update(dt);

    if (shake.t > 0) shake.t -= dt;
    if (banner.t > 0) banner.t -= dt;
    if (toast.t > 0) toast.t -= dt;
    if (climber.landT > 0) climber.landT -= dt;
    echo.t += dt;

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

      case 'hop': {
        var hopTime = (run.combo >= C.COMBO_FAST_AT) ? C.COMBO_HOP_TIME : C.HOP_TIME;
        climber.t += dt / hopTime;
        // A faint trail behind a fast climber shows the momentum.
        if (run.combo >= 3) {
          climber.trailAcc += dt * 90;
          while (climber.trailAcc >= 1) {
            climber.trailAcc -= 1;
            var tp = climberPos();
            Part.spawn('trail', tp.x - 1 + Math.random() * 2, toScreenY(tp.y) - 6 - Math.random() * 8, {
              life: 0.22, w: 1, h: 1, color: run.combo >= 8 ? COL.warn : COL.accent, alpha: 0.6, layer: 'screen'
            });
          }
        }
        if (climber.t >= 1) { climber.t = 1; land(); }
        break;
      }

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
          climber.landT = C.LAND_SQUASH * 1.5;
          addShake(3, 0.2);
          Aud.play('sfx_land', { volume: 0.9, rate: 0.85 });
          var p = climberPos();
          landingPuff(p.x, toScreenY(p.y), 1.4);
        }
        break;

      case 'recover':
        climber.t += dt / C.RECOVER_TIME;
        if (climber.t >= 1) { climber.state = 'idle'; climber.t = 0; SITF.Input.clearHop(); }
        break;
    }
  }

  function onGust(zone) {
    Aud.play('sfx_gust', { volume: 0.24 });
    Part.gustBoost = C.GUST_DURATION;
    var topY = toScreenY(rowY(climberRowFloat() + F.gustReveal));
    var botY = toScreenY(climberPos().y);
    for (var i = 0; i < 44; i++) {
      var y = topY + Math.random() * Math.max(10, botY - topY);
      Part.spawn('streak', -30 - Math.random() * 60, y, {
        vx: 300 + Math.random() * 120, vy: 0,
        life: 0.6 + Math.random() * 0.3,
        w: 12 + Math.floor(Math.random() * 18), h: 1,
        color: COL.text, alpha: 0.35 + Math.random() * 0.3, layer: 'screen'
      });
    }
    // A few loose flakes ride the wind across the whole screen.
    for (var k = 0; k < 16; k++) {
      Part.spawn('flake', -10 - Math.random() * 40, Math.random() * C.H, {
        vx: 120 + Math.random() * 80, vy: 10 + Math.random() * 20,
        life: 2.2, w: 2, h: 2, color: '#ffffff', alpha: 0.6, layer: 'screen'
      });
    }
  }

  function updateAmbientParticles(dt, zone) {
    var zi = U.zoneIndexOf(U.clamp(climber.row, 0, C.ROWS));
    var night = nightAmount();

    // Snow: none in the treeline, steady on the ridge, thick near the summit.
    var rate = [0, 7, 15][zi];
    if (rate > 0) {
      snowAcc += dt * rate;
      while (snowAcc >= 1) {
        snowAcc -= 1;
        var near = Math.random() < 0.22;
        Part.spawn(near ? 'flake' : 'snow', Math.random() * C.W, -4, {
          vx: -10 + Math.random() * 20, vy: near ? 46 + Math.random() * 24 : 25 + Math.random() * 20,
          life: 9, w: near ? 2 : 1, h: near ? 2 : 1, color: near ? '#ffffff' : COL.snow,
          alpha: near ? 0.75 + Math.random() * 0.25 : 0.45 + Math.random() * 0.4, layer: 'screen'
        });
      }
    }

    // Treeline: the odd pine needle or leaf drifting down through the pines.
    if (zi === 0) {
      leafAcc += dt * 1.4;
      while (leafAcc >= 1) {
        leafAcc -= 1;
        Part.spawn('leaf', Math.random() * C.W, -4, {
          vx: 6 + Math.random() * 10, vy: 28 + Math.random() * 14,
          life: 12, w: 2, h: 1,
          color: Math.random() < 0.6 ? '#5f8a3a' : '#a07a3c', alpha: 0.85, layer: 'screen'
        });
      }
    }

    // Daylight: fine dust drifts through the sunlight, catching the eye
    // without competing with the fog above.
    if (night <= 0) {
      dustAcc += dt * 2.2;
      while (dustAcc >= 1) {
        dustAcc -= 1;
        Part.spawn('mote', Math.random() * C.W, C.H * 0.35 + Math.random() * C.H * 0.5, {
          vx: 6 + Math.random() * 10, vy: -3 - Math.random() * 5,
          life: 5 + Math.random() * 3, w: 1, h: 1,
          color: '#fff6d8', alpha: 0.30, layer: 'screen'
        });
      }
    }

    // Under the aurora, motes of light drift up past the climber.
    if (night > 0) {
      moteAcc += dt * 2.5 * night;
      while (moteAcc >= 1) {
        moteAcc -= 1;
        Part.spawn('mote', Math.random() * C.W, C.H + 4, {
          vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 16,
          life: 6 + Math.random() * 4, w: 1, h: 1,
          color: Math.random() < 0.7 ? COL.accent : '#ffffff', alpha: 0.55, layer: 'screen'
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

    // Above the treeline, the air is cold enough to see your own breath
    // while you catch it standing still.
    if (zi >= 1 && climber.state === 'idle' && climber.idleTime > 0.4) {
      breathAcc += dt;
      if (breathAcc > 1.1) {
        breathAcc = 0;
        var bp = climberPos(), bsy = toScreenY(bp.y);
        var bx = bp.x + 4 * climber.facing;
        for (var k = 0; k < 3; k++) {
          Part.spawn('puff', bx + (Math.random() - 0.5) * 2, bsy - 12 - Math.random() * 2, {
            vx: climber.facing * (4 + Math.random() * 6), vy: -6 - Math.random() * 6,
            life: 0.6 + Math.random() * 0.3, w: 1, h: 1, grow: 2,
            color: '#eef6fb', alpha: 0.4, layer: 'screen'
          });
        }
      }
    } else {
      breathAcc = 0;
    }
  }

  // Lit cairns on screen breathe embers.
  function updateCairnEmbers(dt) {
    for (var i = 0; i < F.clearings.length; i++) {
      var cl = F.clearings[i];
      var row = M.row(cl.row);
      if (!row || !row.cairn) continue;
      var sy = toScreenY(rowY(cl.row));
      if (sy < -20 || sy > C.H + 20) continue;
      if (Math.random() < dt * 4.5) {
        var cx = laneX(row.footholds[0].lane) + 13;
        Part.spawn('ember', cx - 2 + Math.random() * 4, sy - 9, {
          vx: (Math.random() - 0.5) * 14, vy: -14 - Math.random() * 18,
          life: 0.9 + Math.random() * 0.7, w: 1, h: 1,
          color: Math.random() < 0.6 ? COL.lantern : '#fff1b8', alpha: 0.9, layer: 'screen'
        });
      }
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
    var night = nightAmount();

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
        clearingPoints.push({ x: laneX(cl.lane), y: cy, r: F.clearingRadius(cl) });
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

    // The wind's leading edge catches the light as it sweeps across.
    if (F.gustProgress >= 0) {
      var wipeX = F.gustWipeX();
      var ga = F.gustAlpha();
      if (wipeX > -60 && wipeX < C.W + 60) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var gg = ctx.createLinearGradient(wipeX - 70, 0, wipeX + 10, 0);
        gg.addColorStop(0, 'rgba(255,255,255,0)');
        gg.addColorStop(0.8, 'rgba(255,255,255,' + (0.16 * ga) + ')');
        gg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gg;
        var gTop = toScreenY(rowY(rf + F.gustReveal)) - C.ROW_H;
        ctx.fillRect(wipeX - 70, Math.max(0, gTop), 80, Math.max(0, fogLineY + 20 - Math.max(0, gTop)));
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));

    // Unlit cairns ahead show as a cold shimmer through the fog: a guide.
    drawCairnGuides(ctx);

    // The lantern glows *in* the fog, so it is lit after the fog is laid down.
    var flick = 0.92 + 0.08 * Math.sin(SITF.time * 23) * Math.sin(SITF.time * 7.3);
    var glowA = ((climber.state === 'idle' || climber.state === 'recover')
      ? 0.22 + 0.30 * F.lanternAlpha : 0.16) * flick * (1 + 0.6 * night);
    var lo = S.lanternOffset(poseName());
    var lx = p.x + lo.x * climber.facing, ly = toScreenY(p.y) + lo.y;
    S.drawGlow(ctx, S.img.glow_lantern, lx, ly, glowA, 1 + 0.35 * night);
    if (climber.state === 'idle' || climber.state === 'recover') {
      S.drawGlow(ctx, S.img.pool_lantern, p.x + 2 * climber.facing, toScreenY(p.y) + 1, glowA * 0.9, 1);
    }

    // Every visible ledge is drawn here, on top of the fog, at its own eased
    // alpha: ones the climber has passed sit at full strength, ones still
    // ahead fade in only as far as they're revealed.
    drawRows(ctx, botRow, topRow);

    // The climber always stays legible, never lost inside the fog.
    drawClimberLayer(ctx, p);

    ctx.restore();

    Part.draw(ctx, 'screen');
    F.drawWhiteout(ctx, toScreenY(rowY(F.frontRow)) + 6);

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

    // Soft vignette, deeper at night, so the eye stays on the route.
    ctx.save();
    ctx.globalAlpha = 0.30 + 0.25 * night;
    ctx.drawImage(S.img.vignette, 0, 0);
    ctx.restore();

    // Event flash: a wash of colour that decays quickly.
    if (flash.t > 0) {
      var k = flash.t / flash.dur;
      ctx.save();
      ctx.globalAlpha = flash.peak * k * k;
      ctx.fillStyle = flash.color;
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

  function poseName() {
    var pose = climber.state;
    if (pose === 'recover') pose = 'idle';
    if (pose === 'idle' && climber.landT > 0) pose = 'land';
    return pose;
  }

  // How strongly a row above the fog line is currently revealed.
  // The sources are the wind gust, the echo step, the lantern and lit cairns.
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
      var cr = F.clearingRadius(cl);
      if (d < cr) {
        a = Math.max(a, U.clamp(1 - d / cr, 0, 1) * 1.6);
      }
    }

    if (F.globalReveal > 0) a = Math.max(a, F.globalReveal);
    return U.clamp(a, 0, 1);
  }

  // Each foothold's displayed fog alpha eases toward its instantaneous target
  // (1 once the climber has passed it, revealAlpha() while still ahead of the
  // fog line) instead of snapping, so nothing pops into or out of view. Rise
  // and fall use different time constants: quick to catch a reveal, slower to
  // settle back into the murk, so it reads as weather rather than a toggle.
  function updateFogAlphas(dt) {
    var rf = climberRowFloat();
    var p = climberPos();
    var topRow = Math.min(C.ROWS, Math.floor(rf + (C.H / C.ROW_H) + 2));
    var botRow = Math.max(0, Math.floor(rf - (C.H / C.ROW_H) - 2));
    // World-space equivalent of the screen-space "above the fog line" test:
    // toScreenY adds the same camera/screen offset to both sides, so it
    // cancels out of the comparison.
    var fogLineWorldY = p.y - C.ROW_H * 0.5 - 2;

    for (var r = botRow; r <= topRow; r++) {
      var row = M.row(r);
      if (!row) continue;
      var covered = rowY(r) < fogLineWorldY;
      for (var i = 0; i < row.footholds.length; i++) {
        var f = row.footholds[i];
        var x = (f.type === 'start') ? C.LANE_X[1] : laneX(f.lane);
        var target = covered ? revealAlpha(r, x) : 1;
        var tau = (target > f.fogAlpha) ? C.FOG_REVEAL_RISE_TAU : C.FOG_REVEAL_FALL_TAU;
        var k = 1 - Math.exp(-dt / tau);
        f.fogAlpha += (target - f.fogAlpha) * k;
        if (Math.abs(target - f.fogAlpha) < 0.003) f.fogAlpha = target;
      }
    }
  }

  // Every visible row is drawn once, on top of the fog raster (the fog canvas
  // is fully transparent below the fog line anyway, so this is safe for rows
  // already passed). Each foothold uses its own smoothed fogAlpha rather than
  // one alpha per row, so a gust or reveal never mis-represents a second
  // foothold on a mercy row, and nothing pops at the fog-line boundary.
  function drawRows(ctx, fromRow, toRow) {
    for (var r = fromRow; r <= toRow; r++) {
      var row = M.row(r);
      if (!row) continue;
      var y = toScreenY(rowY(r));
      if (y < -40 || y > C.H + 40) continue;
      drawRow(ctx, row, r, y);
    }
  }

  function drawRow(ctx, row, r, y) {
    var night = nightAmount();
    var dusk = duskAmount();

    for (var i = 0; i < row.footholds.length; i++) {
      var f = row.footholds[i];
      var alpha = f.fogAlpha;
      if (alpha <= 0.02) continue;
      var x = (f.type === 'start') ? C.LANE_X[1] : laneX(f.lane);

      ctx.save();
      ctx.globalAlpha = alpha;

      if (f.state === 'gone') {
        if (f.debris > 0) {
          var k = 1 - (f.debris / 0.4);
          ctx.save();
          ctx.globalAlpha = alpha * (1 - k);
          ctx.fillStyle = COL.rockDark;
          for (var d = 0; d < 4; d++) {
            var dx = x - 14 + d * 9;
            ctx.fillRect(Math.round(dx), Math.round(y + k * 40 + d * 3), 2, 2);
          }
          ctx.restore();
        }
        ctx.restore();
        continue;
      }

      var jitter = 0, darken = 0.10 * dusk + 0.18 * night;
      if (f.state === 'armed') {
        jitter = (Math.floor(SITF.time * 30) % 2 === 0) ? 1 : -1;
        darken += 0.18;
      }
      if (f.type === 'summit') {
        S.drawLedge(ctx, x, y, 'rock', 0, darken, 2, 0);
      } else {
        S.drawLedge(ctx, x, y, f.type, jitter, darken, row.zone, (r + i) % 2);
      }
      if (f.crystal) {
        var bobC = Math.round(Math.sin(SITF.time * 3 + r) * 1.5);
        var pulseC = 0.30 + 0.12 * Math.sin(SITF.time * 5 + r);
        S.drawGlow(ctx, S.img.glow_accent, x, y - 6 + bobC, pulseC * alpha, 0.9);
        ctx.drawImage(S.img.crystal, Math.round(x - 2), Math.round(y - 10 + bobC));
        // Now and then a glint lifts off the crystal, once it's clearly visible.
        if (alpha > 0.5 && Math.random() < 0.02) {
          Part.spawn('sparkle', x - 2 + Math.random() * 5, y - 8 + bobC, {
            vx: (Math.random() - 0.5) * 8, vy: -10 - Math.random() * 10,
            life: 0.6, w: 1, h: 1, color: '#ffffff', alpha: 0.9, layer: 'screen'
          });
        }
      }

      ctx.restore();
    }

    if (row.cairn || row.summit) {
      var alpha0 = row.footholds[0].fogAlpha;
      if (alpha0 > 0.02) {
        ctx.save();
        ctx.globalAlpha = alpha0;

        if (row.cairn) {
          var cx = laneX(row.footholds[0].lane) + 13;
          var pop = row.cairn.pop > 0 ? 1 + U.easeOutBack(1 - row.cairn.pop / 0.35) * 0.14 : 1;
          if (row.cairn.lit) {
            var cf = 0.9 + 0.1 * Math.sin(SITF.time * 17) * Math.sin(SITF.time * 5.1);
            S.drawGlow(ctx, S.img.glow_cairn, cx, y - 10, (0.5 + 0.1 * Math.sin(SITF.time * 3)) * cf * (1 + 0.4 * night), 1.1);
            S.drawGlow(ctx, S.img.pool_cairn, cx, y + 1, 0.55 * cf, 1);

            // A thin beacon rises off the checkpoint, a landmark you can
            // spot from well below before the fog even starts to thin.
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            var beamTop = y - 260, beamW = 4 + Math.sin(SITF.time * 4) * 0.6;
            var bg = ctx.createLinearGradient(0, beamTop, 0, y - 14);
            bg.addColorStop(0, U.rgba(COL.lantern, 0));
            bg.addColorStop(1, U.rgba(COL.lantern, 0.16 * cf));
            ctx.fillStyle = bg;
            ctx.fillRect(cx - beamW / 2, beamTop, beamW, y - 14 - beamTop);
            ctx.restore();
          }
          S.drawCairn(ctx, cx, y, row.cairn.lit, pop, Math.floor(SITF.time * 6) % 2);
        }

        if (row.summit) {
          // Offset so the climber does not stand in front of the flag.
          S.drawSummit(ctx, laneX(row.footholds[0].lane) + 14, y, Math.floor(SITF.time * 3) % 2);
        }

        ctx.restore();
      }
    }
  }

  // Cold shimmer where an unlit cairn waits above, so the checkpoint can be
  // aimed for even when its ledge is hidden.
  function drawCairnGuides(ctx) {
    for (var r = climber.row + 1; r <= climber.row + 6; r++) {
      var row = M.row(r);
      if (!row || !row.cairn || row.cairn.lit) continue;
      var y = toScreenY(rowY(r));
      if (y < -20 || y > C.H) continue;
      var cx = laneX(row.footholds[0].lane) + 13;
      var dist = r - climber.row;
      var a = (0.10 + 0.05 * Math.sin(SITF.time * 2.2 + r)) * (1 - dist / 7);
      S.drawGlow(ctx, S.img.glow_white, cx, y - 10, a, 0.45);
    }
  }

  function drawClimberLayer(ctx, p) {
    var psy = toScreenY(p.y);
    var pose = poseName();

    var visible = true;
    if (climber.state === 'recover') {
      visible = (Math.floor(climber.t * C.RECOVER_TIME / 0.08) % 2) === 0;
    }
    if (visible) {
      // Contact shadow under the feet while standing.
      if (climber.state === 'idle' || climber.state === 'recover' || climber.state === 'summit') {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = COL.ink;
        ctx.fillRect(Math.round(p.x - 5), Math.round(psy), 10, 1);
        ctx.restore();
      }
      S.drawClimber(ctx, p.x, psy, pose, climber.frame, climber.facing);
      // Bright core of the lantern, always on top of the sprite.
      var lo = S.lanternOffset(pose);
      var lx = Math.round(p.x + lo.x * climber.facing), ly = Math.round(psy + lo.y);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.abs(Math.sin(SITF.time * 9));
      ctx.fillStyle = '#fff6d0';
      ctx.fillRect(lx, ly, 1, 1);
      ctx.restore();
    }

    // Beside the climber, not above: the row above is where the next ledge is.
    if (run.combo >= 2 && climber.state !== 'summit') {
      var right = climber.lane !== 2;
      var tagX = right ? p.x + 16 : p.x - 16;
      var hot = run.combo >= 8;
      Font.draw(ctx, 'X' + run.combo, tagX, psy - S.CLIMBER_H + 2, {
        scale: 1, align: right ? 'left' : 'right',
        color: hot ? COL.warn : COL.accent,
        shadow: COL.ink
      });
      // Combo window bar: how long before the chain drops.
      if (climber.state === 'idle') {
        var left = U.clamp(1 - (run.time - run.lastLandTime) / C.COMBO_WINDOW, 0, 1);
        var bw = 14;
        var bx = right ? tagX : tagX - bw;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = COL.ink;
        ctx.fillRect(Math.round(bx), Math.round(psy - S.CLIMBER_H + 11), bw, 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = hot ? COL.warn : COL.accent;
        ctx.fillRect(Math.round(bx), Math.round(psy - S.CLIMBER_H + 11), Math.round(bw * left), 2);
        ctx.restore();
      }
    }

    Part.draw(ctx, 'world');
  }

  function drawHUD(ctx, rf) {
    // Altitude readout, top-left.
    var alt = M.altitudeOf(U.clamp(rf, 0, C.ROWS));
    var altText = alt + ' M';
    var altW = Font.width(altText, 1);
    U.softPanel(ctx, 5, 5, altW + 24, 15, 0.45);
    ctx.drawImage(S.img.peak_icon, 9, 9);
    Font.draw(ctx, altText, 21, 9, { scale: 1, color: COL.text, shadow: COL.ink });

    // Timer and score, top-right (clear of the altitude bar).
    var timeText = U.formatTime(run.time);
    var scoreText = String(run.score);
    var rw = Math.max(Font.width(timeText, 1), Font.width(scoreText, 1)) + 12;
    U.softPanel(ctx, C.W - 22 - rw, 5, rw, 26, 0.45);
    Font.draw(ctx, timeText, C.W - 28, 9, { scale: 1, color: COL.text, shadow: COL.ink, align: 'right' });
    Font.draw(ctx, scoreText, C.W - 28, 20, { scale: 1, color: COL.accent, shadow: COL.ink, align: 'right' });

    // Clear sight buff from a crystal.
    if (run.clarity > 0) {
      var ct = 'CLEAR SIGHT ' + run.clarity;
      U.softPanel(ctx, 5, 23, Font.width(ct, 1) + 20, 14, 0.45);
      ctx.drawImage(S.img.crystal, 9, 26);
      Font.draw(ctx, ct, 18, 27, { scale: 1, color: COL.accent, shadow: COL.ink });
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
      var wo = gusting ? Math.floor(SITF.time * 40) % 4 : 0;
      ctx.fillRect(wx + wo, wy, 20, 1);
      ctx.fillRect(wx + 4 + wo, wy + 3, 20, 1);
      ctx.fillRect(wx + wo, wy + 6, 14, 1);
      ctx.restore();
    }

    // Zone banner: slides down and settles, then fades.
    if (banner.t > 0) {
      var life = banner.dur - banner.t;
      var ba = Math.min(1, banner.t / 0.5) * Math.min(1, life / 0.25);
      var slide = Math.round((1 - U.easeOutCubic(Math.min(1, life / 0.35))) * -8);
      var bw = Font.width(banner.text, 2);
      var by = 36 + slide;
      U.softPanel(ctx, C.W / 2 - bw / 2 - 16, by - 6, bw + 32, 28, 0.45 * ba);
      ctx.save();
      ctx.globalAlpha = ba;
      ctx.fillStyle = COL.accent;
      ctx.fillRect(Math.round(C.W / 2 - bw / 2 - 8), by + 19, bw + 16, 1);
      ctx.restore();
      Font.draw(ctx, banner.text, C.W / 2, by,
                { scale: 2, align: 'center', color: COL.text, shadow: COL.ink, alpha: ba });
    }
    if (toast.t > 0) {
      var ta = Math.min(1, toast.t / 0.4) * Math.min(1, (toast.dur - toast.t) / 0.15);
      var tw = Font.width(toast.text, 1);
      var ty = banner.t > 0 ? 70 : 44;
      U.softPanel(ctx, C.W / 2 - tw / 2 - 8, ty - 4, tw + 16, 15, 0.45 * ta);
      Font.draw(ctx, toast.text, C.W / 2, ty,
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
    ctx.fillRect(bx - 1, top - 1, 6, h + 2);
    ctx.globalAlpha = 1;

    // Whiteout fill from the bottom.
    var fy = mapRow(F.frontRow);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = COL.whiteout;
    if (fy < bot) ctx.fillRect(bx, Math.round(fy), 4, Math.round(bot - fy));
    ctx.globalAlpha = 1;

    // Cairn ticks; lit ones carry a small glow.
    for (var r = C.CAIRN_EVERY; r < C.ROWS; r += C.CAIRN_EVERY) {
      var row = M.row(r);
      var lit = row && row.cairn && row.cairn.lit;
      var ty = Math.round(mapRow(r));
      if (lit) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = COL.lantern;
        ctx.fillRect(bx - 3, ty - 1, 10, 3);
      }
      ctx.fillStyle = lit ? COL.lantern : COL.textDim;
      ctx.globalAlpha = lit ? 1 : 0.5;
      ctx.fillRect(bx - 2, ty, 8, 1);
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
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = COL.ink;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.restore();

    U.softPanel(ctx, C.W / 2 - 110, 92, 220, 40, 0.5);
    Font.draw(ctx, 'PAUSED', C.W / 2, 102, { scale: 3, align: 'center', color: COL.text, shadow: '#000' });

    var items = [
      ['ESC', 'RESUME'], ['R', 'RESTART'], ['Q', 'TITLE'], ['S', 'SETTINGS'],
      ['M', Aud.muted ? 'UNMUTE' : 'MUTE']
    ];
    U.softPanel(ctx, C.W / 2 - 70, 150, 140, items.length * 16 + 14, 0.5);
    for (var i = 0; i < items.length; i++) {
      var yy = 158 + i * 16;
      var isMute = items[i][0] === 'M';
      Font.draw(ctx, items[i][0], C.W / 2 - 10, yy, { scale: 1, align: 'right', color: COL.accent });
      Font.draw(ctx, items[i][1], C.W / 2 + 4, yy,
                { scale: 1, color: (isMute && Aud.muted) ? COL.warn : COL.text });
    }
  }

  SITF.registerState('play', Play);
})();
