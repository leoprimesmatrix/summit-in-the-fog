(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  var M = {
    rows: [],
    events: []   // {type:'crumbleCollapse', row, lane}
  };

  function makeFoothold(lane, type) {
    return {
      lane: lane, type: type, state: 'ok', timer: 0, debris: 0,
      crystal: false, fogAlpha: 0, memory: 0
    };
  }

  function laneCount() { return C.LANE_X.length; }
  function maxHop() { return C.MAX_HOP; }

  // Lanes reachable from EVERY lane in `prev`. A foothold here guarantees no
  // one below is stranded, whichever branch of the route they took.
  function reachable(prev) {
    var out = [];
    for (var L = 0; L < laneCount(); L++) {
      var ok = true;
      for (var i = 0; i < prev.length; i++) {
        if (Math.abs(L - prev[i]) > maxHop()) { ok = false; break; }
      }
      if (ok) out.push(L);
    }
    return out;
  }

  // Lanes reachable from AT LEAST ONE lane in `prev`: where a fork may sit.
  function reachableAny(prev) {
    var out = [];
    for (var L = 0; L < laneCount(); L++) {
      for (var i = 0; i < prev.length; i++) {
        if (Math.abs(L - prev[i]) <= maxHop()) { out.push(L); break; }
      }
    }
    return out;
  }

  M.generate = function (seed) {
    var rng = U.mulberry32(seed);
    var rows = [];

    // Row 0: the camp terrace, wide enough to stand under every lane.
    var mid = Math.floor(laneCount() / 2);
    rows.push({
      index: 0,
      footholds: [makeFoothold(mid, 'start')],
      cairn: null,
      summit: false,
      zone: 0
    });

    var prevLanes = [mid - 1, mid, mid + 1];
    var lastLane = mid;
    var streak = 0;        // rows running in the same lane
    var leapRun = 0;       // two-lane moves in a row
    var sinceLeap = 0;     // rows since the last two-lane move
    var edgeRun = 0;       // rows running against an outside wall
    var lastWasCrumble = false;
    var lastStep = 0;

    for (var r = 1; r <= C.ROWS; r++) {
      var zi = U.zoneIndexOf(r);
      var zone = C.ZONES[zi];
      // Every lane reachable from every foothold below: whichever branch the
      // player took, this is a move they can actually make.
      var open = reachable(prevLanes);
      var reach = open;

      // The route has to keep moving. Two rows in one lane is a pause; three
      // is a ladder, and a ladder is not a climb.
      if (streak >= 2) reach = prefer(reach, function (l) { return l !== lastLane; });

      // Two big reaches back to back is a flourish. Three is a slog.
      if (leapRun >= 2) reach = prefer(reach, function (l) { return Math.abs(l - lastLane) < 2; });

      // A stage that goes too long without one is a straight line up the
      // middle, which is the most boring thing this generator can produce.
      // Not in the thin air, though: up there a big reach costs breath the
      // climber may not have, and the tension is already coming from that.
      var gap = zone.breath ? 99 : (zone.leapChance >= 0.26 ? 6 : 9);
      if (sinceLeap >= gap) reach = prefer(reach, function (l) { return Math.abs(l - lastLane) === 2; });

      // Never lean on the same wall twice running.
      if (edgeRun >= 1) reach = prefer(reach, function (l) { return l !== 0 && l !== laneCount() - 1; });

      // Weighted pick over what is left. Two-lane steps are the interesting
      // ones, so their share rises with the stage; drifting back over the
      // same lane twice running is the least interesting, so it is damped.
      var weights = reach.map(function (l) {
        var step = Math.abs(l - lastLane);
        var w = (step === 0) ? 0.22 : (step === 1 ? 0.55 : zone.leapChance + 0.02);
        if (step !== 0 && (l - lastLane) * lastStep < 0) w *= 0.7;   // no zig-zag jitter
        if (l === 0 || l === laneCount() - 1) w *= 0.6;
        return w;
      });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var pick = rng() * total;
      var lane = reach[reach.length - 1];
      for (var w2 = 0; w2 < reach.length; w2++) {
        pick -= weights[w2];
        if (pick <= 0) { lane = reach[w2]; break; }
      }

      var step2 = Math.abs(lane - lastLane);
      streak = (lane === lastLane) ? streak + 1 : 1;
      leapRun = (step2 === 2) ? leapRun + 1 : 0;
      sinceLeap = (step2 === 2) ? 0 : sinceLeap + 1;
      edgeRun = (lane === 0 || lane === laneCount() - 1) ? edgeRun + 1 : 0;
      lastStep = lane - lastLane;
      lastLane = lane;

      var isSummit = (r === C.ROWS);
      var hasCairn = (!isSummit && r % C.CAIRN_EVERY === 0);
      var footholds = [makeFoothold(lane, isSummit ? 'summit' : 'rock')];

      if (!isSummit && !hasCairn) {
        // A fork: a second foothold on the same row, and a real choice. It
        // is drawn from the same set of lanes the main line came from, so it
        // is reachable no matter which branch you are standing on, and it is
        // placed two lanes away where there is room - a ledge immediately
        // next to the obvious one is not a decision, it is decoration.
        var forkOdds = zone.forkChance + zone.mercyChance * 0.5;
        if (rng() < forkOdds) {
          var cands = open.filter(function (l) { return l !== lane; });
          var wide = cands.filter(function (l) { return Math.abs(l - lane) >= 2; });
          var pool = wide.length ? wide : cands;
          if (pool.length > 0) {
            var extra = pool[Math.floor(rng() * pool.length) % pool.length];
            var fork = makeFoothold(extra, 'rock');
            // The greedier line carries the reward.
            if (rng() < 0.6) fork.crystal = true;
            footholds.push(fork);
          }
        }
        if (footholds.length === 1 && rng() < zone.crystalChance) {
          footholds[0].crystal = true;
        }

        // Traps are never sprung on the approach to a checkpoint, never in
        // the first rows of a new stage, and never two rows running. A snow
        // bridge is a crumble wearing an honest face, so it is only ever set
        // on a row that offers a second way up.
        var nearCairn = ((r + 1) % C.CAIRN_EVERY === 0);
        var freshZone = (r - zone.from) < 2;
        var mayTrap = !nearCairn && !freshZone;
        if (mayTrap && footholds.length > 1 && rng() < (zone.bridgeChance || 0)) {
          footholds[rng() < 0.5 ? 0 : 1].type = 'bridge';
          lastWasCrumble = false;
        } else if (mayTrap && footholds.length === 1 && !lastWasCrumble && rng() < zone.crumbleChance) {
          footholds[0].type = 'crumble';
          lastWasCrumble = true;
        } else {
          lastWasCrumble = false;
        }
      } else {
        lastWasCrumble = false;
      }

      rows.push({
        index: r,
        footholds: footholds,
        cairn: hasCairn ? { lit: false, pop: 0 } : null,
        summit: isSummit,
        zone: zi
      });

      prevLanes = footholds.map(function (f) { return f.lane; });
    }

    M.rows = rows;
    return rows;
  };

  // Narrow a candidate list, but never to nothing: a shaping rule is a
  // preference, and the route staying legal always wins over the route
  // being interesting.
  function prefer(list, ok) {
    var kept = list.filter(ok);
    return kept.length > 0 ? kept : list;
  }

  // What the generator actually produced, for the playtest harness.
  M.stats = function () {
    var s = { rows: M.rows.length - 1, forks: 0, crystals: 0, crumble: 0, bridge: 0,
              steps: [0, 0, 0], maxStreak: 0, maxEdgeRun: 0, laneUse: [] };
    for (var i = 0; i < C.LANE_X.length; i++) s.laneUse.push(0);
    var streak = 0, edge = 0, prev = M.rows[0].footholds[0].lane;
    for (var r = 1; r < M.rows.length; r++) {
      var fs = M.rows[r].footholds;
      if (fs.length > 1) s.forks++;
      for (var i2 = 0; i2 < fs.length; i2++) {
        if (fs[i2].crystal) s.crystals++;
        if (fs[i2].type === 'crumble') s.crumble++;
        if (fs[i2].type === 'bridge') s.bridge++;
      }
      var lane = fs[0].lane;
      s.laneUse[lane]++;
      s.steps[Math.abs(lane - prev)]++;
      streak = (lane === prev) ? streak + 1 : 1;
      edge = (lane === 0 || lane === C.LANE_X.length - 1) ? edge + 1 : 0;
      s.maxStreak = Math.max(s.maxStreak, streak);
      s.maxEdgeRun = Math.max(s.maxEdgeRun, edge);
      prev = lane;
    }
    return s;
  };

  // Every row must be reachable from the one below, and every foothold below
  // must have somewhere to go. A failure here would make the run unwinnable.
  M.validate = function (log) {
    var bad = 0;
    for (var r = 1; r < M.rows.length; r++) {
      var cur = M.rows[r].footholds;
      var prev = M.rows[r - 1].footholds;
      var prevIsStart = (prev.length === 1 && prev[0].type === 'start');

      for (var i = 0; i < cur.length; i++) {
        var ok = prevIsStart;
        for (var j = 0; !ok && j < prev.length; j++) {
          if (Math.abs(cur[i].lane - prev[j].lane) <= C.MAX_HOP) ok = true;
        }
        if (!ok) {
          bad++;
          console.error('[mountain] row ' + r + ' lane ' + cur[i].lane + ' unreachable from row ' + (r - 1));
        }
      }
      for (var k = 0; k < prev.length; k++) {
        var can = prevIsStart;
        for (var q = 0; !can && q < cur.length; q++) {
          if (Math.abs(cur[q].lane - prev[k].lane) <= C.MAX_HOP) can = true;
        }
        if (!can) {
          bad++;
          console.error('[mountain] row ' + (r - 1) + ' lane ' + prev[k].lane + ' is a dead end');
        }
      }
    }
    if (log) {
      var seq = M.rows.map(function (row) {
        return row.footholds.map(function (f) { return f.lane; }).join('');
      }).join(' ');
      console.log('[mountain] lanes: ' + seq);
    }
    if (bad === 0) console.log('[mountain] validated ' + M.rows.length + ' rows, no unreachable footholds');
    return bad === 0;
  };

  M.reset = function () {
    M.generate(C.SEED);
    M.events.length = 0;
  };

  M.row = function (r) {
    return (r >= 0 && r < M.rows.length) ? M.rows[r] : null;
  };

  // A 'gone' foothold is not standable. 'start' matches any lane.
  M.footholdAt = function (r, lane) {
    var row = M.row(r);
    if (!row) return null;
    for (var i = 0; i < row.footholds.length; i++) {
      var f = row.footholds[i];
      if (f.state === 'gone') continue;
      if (f.type === 'start') return f;
      if (f.lane === lane) return f;
    }
    return null;
  };

  M.arm = function (f) {
    if (f.state !== 'ok') return;
    // A snow bridge looks like rock right up until it is under your weight,
    // and then it does not hold. It is the glacier's own lie.
    if (f.type === 'bridge') { f.state = 'armed'; f.timer = C.BRIDGE_DELAY; return; }
    if (f.type !== 'crumble') return;
    f.state = 'armed';
    f.timer = C.CRUMBLE_DELAY;
  };

  M.update = function (dt) {
    M.events.length = 0;
    for (var r = 0; r < M.rows.length; r++) {
      var fs = M.rows[r].footholds;
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i];
        if (f.debris > 0) f.debris = Math.max(0, f.debris - dt);
        if (f.state === 'armed') {
          f.timer -= dt;
          if (f.timer <= 0) {
            f.state = 'gone';
            f.timer = C.CRUMBLE_RESPAWN;
            f.debris = 0.4;
            M.events.push({ type: 'crumbleCollapse', row: r, lane: f.lane });
          }
        } else if (f.state === 'gone') {
          f.timer -= dt;
          if (f.timer <= 0) { f.state = 'ok'; f.timer = 0; }
        }
      }
    }
  };

  // World space: row 0 at y = 0, up is negative.
  M.rowY = function (r) { return -r * C.ROW_H; };

  M.laneX = function (lane) {
    return C.LANE_X[U.clamp(lane, 0, C.LANE_X.length - 1)];
  };

  M.altitudeOf = function (rowFloat) {
    return Math.round(C.ALT_BASE_M + rowFloat * C.ALT_PER_ROW_M);
  };

  SITF.Mountain = M;
})();
