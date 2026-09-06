(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  var M = {
    rows: [],
    events: []   // {type:'crumbleCollapse', row, lane}
  };

  function makeFoothold(lane, type) {
    return { lane: lane, type: type, state: 'ok', timer: 0, debris: 0, crystal: false, fogAlpha: 0 };
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

    // Row 0: wide starting ledge under the middle lanes.
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
    var streak = 0;
    var lastWasCrumble = false;
    var lastStep = 0;

    for (var r = 1; r <= C.ROWS; r++) {
      var zi = U.zoneIndexOf(r);
      var zone = C.ZONES[zi];
      var reach = reachable(prevLanes);

      // Force a change of lane after a long straight run so the path zig-zags.
      if (streak >= 3) {
        var alt = reach.filter(function (l) { return l !== lastLane; });
        if (alt.length > 0) reach = alt;
      }

      // Weighted pick. Two-lane steps are the interesting ones, so their
      // share rises with the stage; drifting back over the same lane twice
      // running is the least interesting, so it is damped.
      var weights = reach.map(function (l) {
        var step = Math.abs(l - lastLane);
        var w = (step === 0) ? 0.16 : (step === 1 ? 0.55 : zone.leapChance + 0.10);
        if (step !== 0 && (l - lastLane) * lastStep < 0) w *= 0.7;   // no zig-zag jitter
        // Keep the route off the walls: edge lanes are half as likely.
        if (l === 0 || l === laneCount() - 1) w *= 0.55;
        return w;
      });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var pick = rng() * total;
      var lane = reach[reach.length - 1];
      for (var w2 = 0; w2 < reach.length; w2++) {
        pick -= weights[w2];
        if (pick <= 0) { lane = reach[w2]; break; }
      }

      streak = (lane === lastLane) ? streak + 1 : 1;
      lastStep = lane - lastLane;
      lastLane = lane;

      var isSummit = (r === C.ROWS);
      var hasCairn = (!isSummit && r % C.CAIRN_EVERY === 0);
      var footholds = [makeFoothold(lane, isSummit ? 'summit' : 'rock')];

      if (!isSummit && !hasCairn) {
        // A fork: a second foothold on the same row, reachable from at least
        // one foothold below. It opens a parallel line up the face — usually
        // the greedier one, since the spare ledge carries the crystal.
        var forkOdds = zone.forkChance + zone.mercyChance * 0.5;
        if (rng() < forkOdds) {
          var any = reachableAny(prevLanes);
          var cands = any.filter(function (l) {
            var d = Math.abs(l - lane);
            return d >= 1 && d <= maxHop();
          });
          if (cands.length > 0) {
            var extra = cands[Math.floor(rng() * cands.length) % cands.length];
            var fork = makeFoothold(extra, 'rock');
            if (rng() < 0.6) fork.crystal = true;
            footholds.push(fork);
          }
        }
        if (!footholds[0].crystal && footholds.length === 1 && rng() < zone.crystalChance) {
          footholds[0].crystal = true;
        }

        // Crumbling ledge: never two rows running, never the only way up.
        if (footholds.length === 1 && !lastWasCrumble && rng() < zone.crumbleChance) {
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
    if (f.type !== 'crumble' || f.state !== 'ok') return;
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
