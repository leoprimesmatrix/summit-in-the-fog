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
  var Tools = SITF.Tools;
  var Storm = SITF.Storm;
  var COL = C.COLORS;

  var climber, run, camera, shake, banner, toast, snowAcc, wispAcc, driftAcc, leafAcc, moteAcc,
      dustAcc, breathAcc,
      endSeq, milestone, echo, flash, cairnCount, guideMode;

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
      var arc = (climber.hopDist >= 2) ? C.LEAP_ARC : C.HOP_ARC;
      x = U.lerp(climber.fromX, climber.toX, t);
      y = U.lerp(climber.fromY, climber.toY, t) - Math.sin(Math.PI * t) * arc;
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
    Tools.reset();
    Storm.reset();
    guideMode = SITF.Settings.guide();

    var startLane = Math.floor(C.LANE_X.length / 2);
    climber = {
      row: 0, lane: startLane, state: 'idle', t: 0,
      fromX: laneX(startLane), fromY: rowY(0), toX: laneX(startLane), toY: rowY(0),
      targetRow: 0, targetLane: startLane, hopDist: 0, toolT: 0,
      facing: 1, frame: 0, idleTime: 0, blink: 0, landT: 0, trailAcc: 0
    };
    run = {
      time: 0, slips: 0, combo: 0, bestCombo: 0, lastLandTime: -99,
      checkpointRow: 0, started: false, paused: false, over: false, zone: 0,
      settings: false,
      score: 0, crystals: 0, blind: 0, timeBonus: 0, clarity: 0,
      breath: 1, gasping: false, guide: SITF.Settings.guide()
    };
    echo = { t: 99, x: 0, y: 0 };
    flash = { t: 0, dur: 1, color: '#ffffff', peak: 0 };
    milestone = C.ALT_BASE_M + C.MILESTONE_M;
    camera = { y: rowY(0) };
    shake = { t: 0, mag: 0 };
    banner = { text: C.ZONES[0].name, t: 2.4, dur: 2.4 };
    toast = { text: '', t: 0, dur: 1 };
    snowAcc = 0; wispAcc = 0; driftAcc = 0; leafAcc = 0; moteAcc = 0; dustAcc = 0; breathAcc = 0;
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
      score: run.score, crystals: run.crystals, blind: run.blind, clarity: run.clarity,
      breath: run.breath, storm: Storm.phase, wind: Storm.windDir,
      sheltered: Storm.sheltered, flares: Tools.flares
    };
  };

  // Development only: skip ahead to inspect a later part of the mountain.
  // Guarded so it can never fire in a shipped build (Config.DEBUG is false).
  Play.debugJump = function (rows) {
    if (!C.DEBUG || run.over) return false;
    var r = U.clamp(climber.row + rows, 0, C.ROWS);
    climber.row = r;
    climber.lane = U.clamp(M.rows[r].footholds[0].lane, 0, laneMax());
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

  // 0..1 strength of the fog displaced around the climber's feet.
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

  function laneMax() { return C.LANE_X.length - 1; }

  // A move the mountain will not allow: the climber braces instead, and is
  // told why. Costs a moment, but never a fall.
  function refuseHop(why) {
    setToast(why, 1.1);
    climber.idleTime = 0;
    F.resetLantern();
    var rp = climberPos(), rsy = toScreenY(rp.y);
    for (var i = 0; i < 4; i++) {
      Part.spawn('puff', rp.x + (Math.random() - 0.5) * 8, rsy - 4 - Math.random() * 6, {
        vx: (Math.random() - 0.5) * 24, vy: -6 - Math.random() * 8,
        life: 0.35, w: 1, h: 1, grow: 2, color: COL.snow, alpha: 0.5, layer: 'screen'
      });
    }
  }

  // Somewhere the storm cannot push past. A lit cairn is the whole reason to
  // light one, and the reason to be near one when the sky turns.
  function atShelter() {
    if (climber.state !== 'idle' && climber.state !== 'recover') return false;
    var row = M.row(climber.row);
    return !!(row && row.cairn && row.cairn.lit);
  }

  function updateBreath(dt, zone) {
    if (!zone.breath) {
      // Below the death zone the air is thick enough to ignore.
      run.breath = Math.min(1, run.breath + dt * 0.5);
      return;
    }
    if (climber.state === 'idle' || climber.state === 'recover') {
      var rate = atShelter() ? C.BREATH_REST_CAIRN : C.BREATH_REST;
      // You only recover while you are genuinely standing, not mid-chain.
      if (climber.idleTime > 0.15) run.breath = Math.min(1, run.breath + rate * dt);
    }
    if (run.breath < C.BREATH_LOW && !run.gasping) {
      run.gasping = true;
      Aud.play('sfx_breath_low', { volume: 0.5 });
    } else if (run.breath > C.BREATH_LOW + 0.12) {
      run.gasping = false;
    }
  }

  function attemptHop(dir) {
    // The storm wind changes what a hop costs, never where it lands. Pushing
    // the climber sideways could strand them on a row whose only ledge sat
    // upwind, which is unfair rather than hard; instead, crossing into the
    // wind is slow and heavy, and a two-lane leap into it is refused.
    //
    // Refused, not quietly shortened: silently turning a leap into a hop
    // lands the player on air they never aimed at, which reads as the game
    // cheating. A move you cannot make simply does not happen, and says why.
    var wind = Storm.hopDrift();
    climber.intoWind = false;
    if (wind !== 0 && dir !== 0 && (dir > 0) !== (wind > 0)) {
      climber.intoWind = true;
      if (Math.abs(dir) > 1) { refuseHop('THE WIND IS TOO STRONG'); return; }
    }
    if (run.breath < C.BREATH_LOW && Math.abs(dir) > 1) {
      refuseHop('NO BREATH TO LEAP'); return;
    }

    var targetRow = climber.row + 1;

    // Reach: press a direction and go as far that way as there is rock.
    // Nearly one foothold in five on this mountain can only be left by a
    // two-lane move, starting at row 1, so a player using only the arrow
    // keys would fall off a route that looked perfectly reachable. Pressing
    // left or right now extends to two lanes when one lane holds nothing,
    // which is what the player meant; Q and E stay as the explicit choice
    // for when both distances have rock and you want the far one.
    if (Math.abs(dir) === 1 && !M.footholdAt(targetRow, climber.lane + dir)) {
      var far = climber.lane + dir * 2;
      if (far >= 0 && far <= laneMax() && M.footholdAt(targetRow, far)) dir *= 2;
    }

    var targetLane = climber.lane + dir;
    if (dir !== 0) climber.facing = dir > 0 ? 1 : -1;
    // A two-lane leap is slower and higher: committing to one is a real cost.
    climber.hopDist = Math.abs(dir);
    run.breath = Math.max(0, run.breath -
      (climber.hopDist >= 2 ? C.BREATH_LEAP : C.BREATH_HOP) *
      (currentZone().breath ? 1 : 0));

    var pos = climberPos();
    climber.fromX = pos.x;
    climber.fromY = pos.y;
    climber.targetRow = targetRow;
    climber.t = 0;
    climber.idleTime = 0;
    climber.landT = 0;

    var inRange = (targetLane >= 0 && targetLane <= laneMax());
    var fh = inRange ? M.footholdAt(targetRow, targetLane) : null;

    // Was this hop taken on knowledge or on nerve? Read the target before the
    // lantern is put out, or standing still would count as a blind hop.
    if (fh) {
      var known = fh.fogAlpha >= 0.15 || fh.memory > 0;
      climber.blindHop = targetRow > 1 && !known;
    }
    F.resetLantern();

    // Push-off dust behind the feet.
    var sy = toScreenY(pos.y);
    for (var i = 0; i < 2; i++) {
      Part.spawn('dust', pos.x - dir * 3 + (Math.random() - 0.5) * 4, sy - 1, {
        vx: -dir * (20 + Math.random() * 20) - (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 10,
        life: 0.3, w: 1, h: 1, color: COL.snow, alpha: 0.7, layer: 'screen'
      });
    }

    if (fh) {
      climber.targetLane = (fh.type === 'start') ? targetLane : fh.lane;
      climber.toX = laneX(climber.targetLane);
      climber.toY = rowY(targetRow);
      climber.state = 'hop';
      if (!run.started) run.started = true;
      Aud.play('sfx_hop', { volume: 0.7, rate: 0.95 + Math.random() * 0.1 });
    } else {
      // A hop into empty fog: lunge out, then fall back down the mountain.
      climber.targetLane = U.clamp(targetLane, 0, laneMax());
      climber.toX = laneX(U.clamp(targetLane, 0, laneMax())) + (inRange ? 0 : (dir > 0 ? 34 : -34));
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
        var fl = (f.type === 'start') ? U.clamp(lane, 0, laneMax()) : f.lane;
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

    // The landing displaces the fog around your feet. It is weight and
    // presence, not information: it never shows what is on the row above.
    var lp = climberPos();
    echo = { t: 0, x: lp.x, y: lp.y };
    if (run.clarity > 0) run.clarity--;
    Part.spawn('ring', p.x, sy - 1, {
      life: 0.42, r: 24, w: 1, grow: 0.42,
      color: COL.accent, alpha: 0.45, layer: 'screen'
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
      if (fh && (fh.type === 'crumble' || fh.type === 'bridge') && fh.state === 'ok') {
        M.arm(fh);
        if (fh.type === 'bridge') {
          // It gave under you: a crack, a lurch, and very little time.
          Aud.play('sfx_bridge_crack', { volume: 0.7 });
          addShake(2, 0.2);
          setToast('SNOW BRIDGE', 0.9);
          for (var bi = 0; bi < 10; bi++) {
            Part.spawn('debris', p.x - 16 + Math.random() * 32, sy + 4,
                       { vx: (Math.random() - 0.5) * 40, vy: 20 + Math.random() * 50,
                         life: 0.7, w: 1, h: 1, color: COL.snow, alpha: 0.9, layer: 'screen' });
          }
        } else {
          Aud.play('sfx_crumble', { volume: 0.6 });
          addShake(1, 0.15);
        }
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
    Tools.update(dt, toScreenY);

    var wasPhase = Storm.phase, wasShelter = Storm.sheltered;
    Storm.update(dt, zone, atShelter());
    if (Storm.phase !== wasPhase) {
      if (Storm.phase === 'building') {
        Aud.play('sfx_storm_warn', { volume: 0.5 });
        setToast('STORM COMING', 1.8);
      } else if (Storm.phase === 'storm') {
        Aud.play('sfx_storm', { volume: 0.55 });
        addShake(2, 0.5);
      } else if (wasPhase === 'storm') {
        setToast('THE SKY CLEARS', 1.4);
      }
    }
    if (Storm.sheltered && !wasShelter) setToast('SHELTERED', 1.2);
    // The storm keeps shaking the mountain for as long as it lasts.
    if (Storm.isStorm() && !Storm.sheltered) addShake(1, 0.12);
    updateBreath(dt, zone);
    // The wind stops parting the fog while it is busy driving it.
    F.updateGust(dt, zone, onGust, Storm.blocksGusts());
    F.updateWhiteout(dt, climberRowFloat(), zone, Storm.frontSpeed());
    // Clear Sight: the lantern comes up at once and reaches a row further.
    F.updateLantern(dt, climber.state === 'idle' ? climber.idleTime : 0, run.clarity > 0);
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
      case 'idle': {
        climber.idleTime += dt;
        climber.frame = Math.floor(SITF.time * 2) % 2;

        // A tool in the air is a commitment: you cannot hop until it lands.
        var tool = SITF.Input.takeTool();
        if (tool && !Tools.busy()) {
          var tp = climberPos();
          if (tool.kind === 'axe') {
            if (Tools.throwAxe(tool.dir, climber.row, climber.lane, tp.x, toScreenY(tp.y))) {
              climber.toolT = C.AXE_TIME;
              if (tool.dir !== 0) climber.facing = tool.dir > 0 ? 1 : -1;
            }
          } else if (tool.kind === 'flare') {
            if (Tools.useFlare(climber.row, tp.x, tp.y)) {
              climber.toolT = C.FLARE_RISE;
              addFlash(COL.lantern, 0.10, 0.25);
            } else {
              setToast('NO FLARES LEFT', 1.0);
            }
          }
        }
        if (climber.toolT > 0) { climber.toolT -= dt; SITF.Input.clearHop(); break; }

        var dir = SITF.Input.takeHop();
        if (dir !== null) attemptHop(dir);
        break;
      }

      case 'hop': {
        var hopTime = (climber.hopDist >= 2)
          ? C.LEAP_TIME
          : ((run.combo >= C.COMBO_FAST_AT) ? C.COMBO_HOP_TIME : C.HOP_TIME);
        // Into the wind is a fight; with it at your back, a shove along.
        if (climber.intoWind) hopTime *= C.WIND_UPWIND_MULT;
        else if (Storm.hopDrift() !== 0 && climber.hopDist > 0) hopTime *= C.WIND_DOWNWIND_MULT;
        if (run.breath < C.BREATH_LOW) hopTime *= C.BREATH_SLOW_MULT;
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

    // Snow: none in the forest, steady on the glacier, thick near the summit,
    // and driven sideways once a storm has the face.
    var storming = Storm.isStorm();
    var warn = Storm.warn(zone);
    var rate = [0, 4, 9, 13, 16][U.clamp(zi, 0, 4)] * (storming ? 2.6 : 1 + warn * 0.8);
    var blow = storming ? (Storm.windDir || 1) * 150 : 0;
    if (rate > 0) {
      snowAcc += dt * rate;
      while (snowAcc >= 1) {
        snowAcc -= 1;
        var near = Math.random() < 0.22;
        var sx = storming ? (blow > 0 ? -8 : C.W + 8) : Math.random() * C.W;
        Part.spawn(near ? 'flake' : 'snow', storming ? sx : Math.random() * C.W,
                   storming ? Math.random() * C.H : -4, {
          vx: -10 + Math.random() * 20 + blow,
          vy: near ? 46 + Math.random() * 24 : 25 + Math.random() * 20,
          life: 9, w: near ? 2 : 1, h: near ? 2 : 1, color: near ? '#ffffff' : COL.snow,
          alpha: near ? 0.75 + Math.random() * 0.25 : 0.45 + Math.random() * 0.4, layer: 'screen'
        });
      }
    }

    // Spindrift tearing across the face: the storm you can see.
    if (storming) {
      wispAcc += dt * 34;
      while (wispAcc >= 1) {
        wispAcc -= 1;
        Part.spawn('streak', blow > 0 ? -40 : C.W + 40, Math.random() * C.H, {
          vx: blow * (1.8 + Math.random() * 1.4), vy: (Math.random() - 0.5) * 14,
          life: 0.6 + Math.random() * 0.4,
          w: 14 + Math.floor(Math.random() * 30), h: 1 + (Math.random() < 0.3 ? 1 : 0),
          color: Math.random() < 0.5 ? '#ffffff' : COL.whiteout,
          alpha: 0.4 + Math.random() * 0.45, layer: 'screen'
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

    driftAcc += dt;
    if (driftAcc > 2 && !storming) {
      driftAcc = 0;
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

    // Air over the painted range, then the face itself in front of it and
    // behind the fog: the same weather reveals both.
    Par.distanceHaze(ctx, rf);
    SITF.RockFace.draw(ctx, toScreenY, rf);

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
      density: U.zoneField(U.clamp(rf, 0, C.ROWS), 'fogDensity', 8) + Storm.densityBonus(),
      color: Par.fogColorAt(rf),
      lanternTargets: lanternTargets,
      clearingPoints: clearingPoints,
      echo: { x: echo.x, y: toScreenY(echo.y) - 8, r: 18 + Math.min(1, echo.t / 0.5) * 14, alpha: echoAlpha() * 0.7 },
      flare: Tools.flareLight(toScreenY)
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
    drawTools(ctx);

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
  function revealAlpha(r, x, lane) {
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

    // Lantern: the row above, all lanes, while you stand still. Clear Sight
    // from a crystal lights it at once and carries it a row further.
    if (F.lanternAlpha > 0 && climber.state === 'idle') {
      var lanternRows = run.clarity > 0 ? 2 : 1;
      if (r > climber.row && r <= climber.row + lanternRows) {
        a = Math.max(a, F.lanternAlpha * (r === climber.row + 2 ? 0.8 : 1));
      }
    }

    // The axe reads up one lane; the flare reads everything for a moment.
    if (lane != null) a = Math.max(a, Tools.reveal(r, lane));

    // Guide mode: the route lights itself, for players who want the climb
    // without the route-finding. Scored at half, and sets no records.
    if (guideMode && r > climber.row && r <= climber.row + 2) a = Math.max(a, 1);

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
        var lane = (f.type === 'start') ? climber.lane : f.lane;
        var x = laneX(lane);
        var target = covered ? revealAlpha(r, x, lane) : 1;
        var tau = (target > f.fogAlpha) ? C.FOG_REVEAL_RISE_TAU : C.FOG_REVEAL_FALL_TAU;
        var k = 1 - Math.exp(-dt / tau);
        f.fogAlpha += (target - f.fogAlpha) * k;
        if (Math.abs(target - f.fogAlpha) < 0.003) f.fogAlpha = target;

        // Anything legible is committed to memory, and stays as a fading
        // outline once the fog takes it back. Remembering the gust is the
        // skill the whole reveal economy is built on, so the game holds the
        // shape of what you saw rather than asking you to hold it alone.
        if (f.fogAlpha >= 0.55) f.memory = C.MEMORY_HOLD;
        else if (f.memory > 0) f.memory = Math.max(0, f.memory - dt);
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

  // A ledge from memory: the silhouette only, dashed, thinning as it goes.
  // Drawn shadowed then lit, so it reads against bright fog by day and dark
  // fog at night without needing two colours.
  function drawMemory(ctx, x, y, k) {
    if (k <= 0.02) return;
    var w = S.LEDGE_W, h = S.LEDGE_H;
    var left = Math.round(x - w / 2), top = Math.round(y);
    var a = U.clamp(k, 0, 1) * C.MEMORY_ALPHA;

    ctx.save();
    for (var pass = 0; pass < 2; pass++) {
      var off = pass === 0 ? 1 : 0;
      ctx.globalAlpha = pass === 0 ? a * 0.7 : a;
      ctx.fillStyle = pass === 0 ? COL.ink : COL.text;
      for (var i = 0; i < w; i += 4) {
        var seg = Math.min(2, w - i);
        ctx.fillRect(left + i + off, top + off, seg, 1);
        ctx.fillRect(left + i + off, top + h - 1 + off, seg, 1);
      }
      for (var j = 1; j < h - 1; j += 4) {
        ctx.fillRect(left + off, top + j + off, 1, Math.min(2, h - 1 - j));
        ctx.fillRect(left + w - 1 + off, top + j + off, 1, Math.min(2, h - 1 - j));
      }
    }
    ctx.restore();
  }

  function drawRow(ctx, row, r, y) {
    var night = nightAmount();
    var dusk = duskAmount();

    for (var i = 0; i < row.footholds.length; i++) {
      var f = row.footholds[i];
      var alpha = f.fogAlpha;
      var x = (f.type === 'start') ? laneX(climber.lane) : laneX(f.lane);

      // What you saw a moment ago, held as an outline while it fades. This is
      // the difference between remembering a gust and being asked to.
      if (alpha < 0.55 && f.memory > 0 && f.state !== 'gone') {
        drawMemory(ctx, x, y, (f.memory / C.MEMORY_HOLD) * (1 - alpha / 0.55));
      }
      if (alpha <= 0.02) continue;

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
        S.drawLedge(ctx, x, y, 'rock', 0, darken, 2, r * 5 + i);
      } else {
        // Vary the rock by row AND lane: an alternating pattern down the
        // face is as obvious as no variation at all.
        S.drawLedge(ctx, x, y, f.type, jitter, darken, row.zone, r * 5 + f.lane * 3 + i);
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

    // Nothing is written on or beside the climber: the chain lives in the
    // HUD panel, and this space belongs to the mountain.

    Part.draw(ctx, 'world');
  }

  // The axe on its way up, the mark it leaves, and a burning flare.
  function drawTools(ctx) {
    var axe = Tools.axeState();
    if (axe) {
      var lx = laneX(axe.lane);
      if (axe.phase === 'fly') {
        var k = U.clamp(axe.t / C.AXE_TIME, 0, 1);
        var ax = U.lerp(axe.fromX, lx, k);
        var ay = U.lerp(axe.fromY - 8, toScreenY(rowY(axe.row + 1)) - 6, U.easeOutQuad(k));
        ctx.save();
        ctx.translate(Math.round(ax), Math.round(ay));
        ctx.rotate(axe.t * 34);
        ctx.fillStyle = '#6b5a44';
        ctx.fillRect(-1, -4, 2, 8);
        ctx.fillStyle = '#c8d2da';
        ctx.fillRect(-3, -4, 5, 2);
        ctx.restore();
        // A thin arc showing where it is going, so the throw reads as aimed.
        ctx.save();
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = COL.text;
        ctx.fillRect(Math.round(lx), Math.round(toScreenY(rowY(axe.row + 1))) - 2, 1, 4);
        ctx.restore();
      } else {
        // Stuck: it lights its lane, and the head glints.
        var k2 = axe.t < C.AXE_HOLD ? 1 : U.clamp(1 - (axe.t - C.AXE_HOLD) / C.AXE_FADE, 0, 1);
        var top = (axe.hit >= 0) ? axe.hit : axe.row + C.AXE_ROWS;
        var y0 = toScreenY(rowY(axe.row + 1)) + 6;
        var y1 = toScreenY(rowY(top));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, U.rgba(COL.lantern, 0.16 * k2));
        g.addColorStop(1, U.rgba(COL.lantern, 0.02 * k2));
        ctx.fillStyle = g;
        ctx.fillRect(Math.round(lx) - 12, Math.min(y0, y1), 24, Math.abs(y1 - y0));
        ctx.restore();
        if (axe.hit >= 0) {
          var hy = toScreenY(rowY(axe.hit));
          S.drawGlow(ctx, S.img.glow_accent, lx, hy - 2, 0.35 * k2, 0.8);
          ctx.save();
          ctx.globalAlpha = k2;
          ctx.fillStyle = '#c8d2da';
          ctx.fillRect(Math.round(lx) - 2, Math.round(hy) - 3, 4, 2);
          ctx.fillStyle = '#6b5a44';
          ctx.fillRect(Math.round(lx) - 1, Math.round(hy) - 1, 2, 5);
          ctx.restore();
        }
      }
    }

    var fl = Tools.flareLight(toScreenY);
    if (fl && fl.alpha > 0.01) {
      S.drawGlow(ctx, S.img.glow_lantern, fl.x, fl.y, fl.alpha * 0.9, 2.2);
      ctx.save();
      ctx.globalAlpha = fl.alpha;
      ctx.fillStyle = '#fff3d0';
      ctx.fillRect(Math.round(fl.x) - 1, Math.round(fl.y) - 1, 2, 2);
      ctx.restore();
    }
  }

  // What you are carrying, bottom-left, out of the route's way.
  function drawToolsHUD(ctx) {
    var y = C.H - 20;
    U.softPanel(ctx, 5, y - 4, 92, 18, 0.45);

    // Axe: lit when it is in your hand, dim while it is out there.
    var ready = Tools.axeReady();
    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.35;
    ctx.fillStyle = '#6b5a44';
    ctx.fillRect(12, y + 1, 2, 8);
    ctx.fillStyle = ready ? '#c8d2da' : '#7d8790';
    ctx.fillRect(10, y, 6, 2);
    ctx.restore();
    Font.draw(ctx, 'ZXC', 20, y + 1,
              { scale: 1, color: ready ? COL.text : COL.textDim, shadow: COL.ink });

    // Flares: one pip each, spent ones hollow.
    var fx = 52;
    for (var i = 0; i < C.FLARE_COUNT; i++) {
      var have = i < Tools.flares;
      ctx.save();
      ctx.globalAlpha = have ? 1 : 0.3;
      ctx.fillStyle = have ? COL.warn : COL.textDim;
      ctx.fillRect(fx + i * 6, y + 1, 3, 7);
      if (have) { ctx.fillStyle = '#fff3d0'; ctx.fillRect(fx + i * 6, y + 1, 3, 2); }
      ctx.restore();
    }
    Font.draw(ctx, 'F', 74, y + 1,
              { scale: 1, color: Tools.flares > 0 ? COL.text : COL.textDim, shadow: COL.ink });
  }

  // The weather, top-centre: six seconds of warning, then how much of the
  // storm is left, and which way it will throw you.
  function drawStormHUD(ctx) {
    var zone = currentZone();
    var warn = Storm.warn(zone);
    if (warn <= 0.001) return;
    var storm = Storm.isStorm();
    var pulse = 0.55 + 0.45 * Math.sin(SITF.time * (storm ? 7 : 4 + warn * 8));

    var w = 116, x = Math.round(C.W / 2 - w / 2), y = 5;
    U.softPanel(ctx, x, y, w, 24, 0.5);

    var label = storm ? 'STORM' : 'STORM INCOMING';
    Font.draw(ctx, label, C.W / 2, y + 3, {
      scale: 1, align: 'center', shadow: COL.ink,
      color: storm ? COL.warn : COL.text, alpha: storm ? 1 : 0.55 + 0.45 * pulse
    });

    // A bar that fills as the warning runs out, then drains with the storm.
    var bw = w - 16, bx = x + 8, by = y + 14;
    var fill = storm ? Storm.stormLeft(zone) : warn;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = COL.ink;
    ctx.fillRect(bx, by, bw, 3);
    ctx.globalAlpha = storm ? 1 : 0.6 + 0.4 * pulse;
    ctx.fillStyle = storm ? COL.warn : COL.text;
    ctx.fillRect(bx, by, Math.round(bw * fill), 3);
    ctx.restore();

    // Which way the wind will push a hop, if this stage has any.
    if (Storm.windDir !== 0) {
      var ax = C.W / 2 + (Storm.windDir > 0 ? w / 2 + 8 : -w / 2 - 8);
      var d = Storm.windDir;
      ctx.save();
      ctx.globalAlpha = storm ? 1 : 0.4 + 0.6 * pulse;
      ctx.fillStyle = storm ? COL.warn : COL.text;
      for (var i = 0; i < 3; i++) {
        ctx.fillRect(Math.round(ax + d * (i * 4 - 4)), y + 8 + i, 3, 1);
        ctx.fillRect(Math.round(ax + d * (i * 4 - 4)), y + 14 - i, 3, 1);
      }
      ctx.fillRect(Math.round(ax - 6), y + 11, 13, 1);
      ctx.restore();
    }
  }

  // Thin air, beside the altitude gauge.
  function drawBreath(ctx) {
    if (!currentZone().breath && run.breath > 0.999) return;
    var x = C.W - 12, top = 20, h = 88;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = COL.ink;
    ctx.fillRect(x, top, 3, h);
    var lit = Math.round(h * U.clamp(run.breath, 0, 1));
    ctx.globalAlpha = 1;
    var low = run.breath < C.BREATH_LOW;
    ctx.fillStyle = low ? COL.warn : COL.text;
    if (low) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(SITF.time * 8);
    ctx.fillRect(x, top + h - lit, 3, lit);
    ctx.restore();
    if (low) {
      Font.draw(ctx, 'REST', x + 1, top + h + 4,
                { scale: 1, align: 'right', color: COL.warn, shadow: COL.ink });
    }
  }

  // Base camp is where the mountain explains itself. Nothing here is
  // discoverable by pressing the keys you already know: the axe and the flare
  // have no analogue in a hop-and-climb game, and a player who never finds
  // them is playing a much worse one. So while the camp is under you, the
  // controls are simply written down.
  var LESSONS = [
    { from: 0,  text: 'ARROWS OR A W D   HOP UP TO THE NEXT LEDGE' },
    { from: 4,  text: 'THE FOG HIDES THE PATH.  STAND STILL: YOUR LANTERN FINDS IT' },
    { from: 8,  text: 'Z X C   THROW YOUR AXE UP A LANE. IT SPARKS ON ROCK' },
    { from: 13, text: 'F   LIGHT A FLARE. TEN ROWS, EVERY LANE. YOU CARRY THREE' },
    { from: 17, text: 'LIGHT EVERY CAIRN. IN A STORM THEY ARE THE ONLY SHELTER' }
  ];

  function drawLesson(ctx) {
    if (climber.row > C.ZONES[0].to + 2) return;
    var pick = null;
    for (var i = 0; i < LESSONS.length; i++) {
      if (climber.row >= LESSONS[i].from) pick = LESSONS[i];
    }
    if (!pick) return;
    var w = Font.width(pick.text, 1);
    var x = Math.round(C.W / 2 - w / 2), y = C.H - 42;
    U.softPanel(ctx, x - 10, y - 5, w + 20, 19, 0.5);
    Font.draw(ctx, pick.text, C.W / 2, y,
              { scale: 1, align: 'center', color: COL.text, shadow: COL.ink });
  }

  function drawHUD(ctx, rf) {
    drawBreath(ctx);
    drawLesson(ctx);
    // Altitude readout, top-left.
    var alt = M.altitudeOf(U.clamp(rf, 0, C.ROWS));
    var altText = alt + ' M';
    var altW = Font.width(altText, 1);
    U.softPanel(ctx, 5, 5, altW + 24, 15, 0.45);
    ctx.drawImage(S.img.peak_icon, 9, 9);
    Font.draw(ctx, altText, 21, 9, { scale: 1, color: COL.text, shadow: COL.ink });

    // Timer, score and the chain, top-right (clear of the altitude bar).
    var timeText = U.formatTime(run.time);
    var scoreText = String(run.score);
    var comboText = run.combo >= 2 ? 'X' + run.combo : '';
    var rw = Math.max(Font.width(timeText, 1), Font.width(scoreText, 1),
                      Font.width(comboText, 1)) + 12;
    var rh = comboText ? 37 : 26;
    U.softPanel(ctx, C.W - 22 - rw, 5, rw, rh, 0.45);
    Font.draw(ctx, timeText, C.W - 28, 9, { scale: 1, color: COL.text, shadow: COL.ink, align: 'right' });
    Font.draw(ctx, scoreText, C.W - 28, 20, { scale: 1, color: COL.accent, shadow: COL.ink, align: 'right' });
    if (comboText) {
      var hot = run.combo >= 8;
      Font.draw(ctx, comboText, C.W - 28, 31,
                { scale: 1, color: hot ? COL.warn : COL.textDim, shadow: COL.ink, align: 'right' });
      // How long the chain has left, as a bar under it.
      var left = U.clamp(1 - (run.time - run.lastLandTime) / C.COMBO_WINDOW, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = hot ? COL.warn : COL.accent;
      ctx.fillRect(C.W - 28 - Math.round(24 * left), 39, Math.round(24 * left), 1);
      ctx.restore();
    }

    drawToolsHUD(ctx);

    // Clear sight buff from a crystal.
    if (run.clarity > 0) {
      var ct = 'CLEAR SIGHT ' + run.clarity;
      U.softPanel(ctx, 5, 23, Font.width(ct, 1) + 20, 14, 0.45);
      ctx.drawImage(S.img.crystal, 9, 26);
      Font.draw(ctx, ct, 18, 27, { scale: 1, color: COL.accent, shadow: COL.ink });
    }

    drawStormHUD(ctx);

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

    // Zone banner: slides down and settles, then fades. Crossing into a new
    // stage briefly letterboxes the view, so arriving somewhere reads as an
    // event rather than a caption.
    if (banner.t > 0) {
      var life = banner.dur - banner.t;
      var ba = Math.min(1, banner.t / 0.5) * Math.min(1, life / 0.25);
      var slide = Math.round((1 - U.easeOutCubic(Math.min(1, life / 0.35))) * -8);
      var bw = Font.width(banner.text, 2);
      var by = 36 + slide;

      var barH = Math.round(16 * ba);
      if (barH > 0) {
        ctx.save();
        ctx.globalAlpha = 0.55 * ba;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, C.W, barH);
        ctx.fillRect(0, C.H - barH, C.W, barH);
        ctx.restore();
      }
      Font.draw(ctx, M.altitudeOf(climber.row) + ' M', C.W / 2, by + 24,
                { scale: 1, align: 'center', color: COL.textDim, shadow: COL.ink, alpha: ba * 0.9 });
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
      ['ESC', 'RESUME'], ['R', 'RESTART'], ['T', 'TITLE'], ['S', 'SETTINGS'],
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
