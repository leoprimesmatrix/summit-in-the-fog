(function () {
  'use strict';

  // Automated playtesting harness. Not shipped: index.html does not load this.
  // Inject it into a running page (the dev server serves the repo root):
  //
  //   var s=document.createElement('script'); s.src='/tools/bots/bots.js';
  //   document.head.appendChild(s);
  //
  // then, from the console:
  //
  //   SITF.Bots.suite()            // the standard battery, returns a table
  //   SITF.Bots.run({cadence:0.6}) // one run
  //   SITF.Bots.edgeScan()         // full-width ruled-line detector
  //   SITF.Bots.sheet([10,60,120]) // contact sheet at those rows
  //
  // Everything drives the real input layer and the real fixed step
  // (SITF.advance), so a bot run is the same code path a player takes.

  var B = {};

  function C() { return SITF.Config; }
  function play() { return SITF.states.play; }

  // --- helpers -------------------------------------------------------------

  function freshRun() {
    SITF.setState('title');
    for (var i = 0; i < 40; i++) SITF.advance(1 / 60, false);
    SITF.setState('play');
    for (var j = 0; j < 40; j++) SITF.advance(1 / 60, false);
  }

  // Every foothold on `row` reachable from `lane`, with what the player could
  // actually know about it right now.
  function options(row, lane, memory) {
    var M = SITF.Mountain;
    var r = M.row(row);
    var out = [];
    if (!r) return out;
    var reach = C().MAX_HOP != null ? C().MAX_HOP : 1;
    for (var i = 0; i < r.footholds.length; i++) {
      var f = r.footholds[i];
      if (f.state === 'gone') continue;
      var fl = (f.type === 'start') ? lane : f.lane;
      var d = fl - lane;
      if (Math.abs(d) > reach) continue;
      var key = row + ':' + fl;
      out.push({
        d: d, lane: fl, type: f.type, crystal: !!f.crystal,
        visible: f.fogAlpha >= 0.6,
        remembered: memory[key] != null && (SITF.time - memory[key]) < 8
      });
    }
    return out;
  }

  function lanesOf(row) {
    var r = SITF.Mountain.row(row);
    if (!r) return [];
    var out = [];
    for (var i = 0; i < r.footholds.length; i++) out.push(r.footholds[i].lane);
    return out;
  }

  // --- the bot -------------------------------------------------------------

  // opts:
  //   cadence      seconds between hop attempts (a player's hands)
  //   maxSec       give up after this much game time
  //   useMemory    hop to ledges seen recently but hidden now
  //   guess        when nothing is known: 'never' | 'wait' | 'always'
  //   restEvery    hop count between deliberate pauses (0 = never rest)
  //   restFor      seconds of each pause
  //   greedy       detour for crystals when there is a choice
  //   axe          throw the axe when nothing above is known
  //   flare        fire a flare when nothing is known and the axe is spent
  B.run = function (opts) {
    opts = opts || {};
    var cadence = opts.cadence != null ? opts.cadence : 0.5;
    var maxSec = opts.maxSec || 400;
    var useMemory = opts.useMemory !== false;
    var guess = opts.guess || 'wait';
    var restEvery = opts.restEvery || 0;
    var restFor = opts.restFor || 0;
    var greedy = !!opts.greedy;
    var useAxe = !!opts.axe;
    var useFlare = !!opts.flare;
    var shelter = !!opts.shelter;   // wait out storms on a lit cairn

    var P = play(), I = SITF.Input, F = SITF.Fog;
    freshRun();

    var mem = {};
    var st = {
      opts: { cadence: cadence, guess: guess, memory: useMemory, rest: restEvery ? restEvery + 'x' + restFor : 'none' },
      hops: 0, seen: 0, remembered: 0, guesses: 0, waits: 0,
      axes: 0, flares: 0, stormFrames: 0, shelterFrames: 0, minBreath: 1,
      idleSeconds: 0, minGapRows: 99, deaths: [], frames: 0
    };
    var lastHop = -99, sinceRest = 0, pauseUntil = -1, idleStart = null;

    for (var fr = 0; fr < maxSec * 60; fr++) {
      st.frames = fr;
      var s = P.snapshot();
      if (!s || s.over) break;

      var gap = s.rowFloat - s.frontRow;
      if (gap < st.minGapRows) st.minGapRows = gap;

      // Remember anything currently legible, the way a player would.
      for (var r = s.row; r <= s.row + 12 && r <= C().ROWS; r++) {
        var row = SITF.Mountain.row(r);
        if (!row) continue;
        for (var i = 0; i < row.footholds.length; i++) {
          var f = row.footholds[i];
          if (f.fogAlpha >= 0.6) mem[r + ':' + f.lane] = SITF.time;
        }
      }

      if (s.storm === 'storm') st.stormFrames++;
      if (s.sheltered) st.shelterFrames++;
      if (s.breath < st.minBreath) st.minBreath = s.breath;

      if (s.mode === 'idle') {
        if (idleStart === null) idleStart = SITF.time;
        st.idleSeconds += 1 / 60;
        // Sit out the storm where it cannot reach you.
        if (shelter && s.sheltered) { SITF.advance(1 / 60, false); continue; }
        var ready = (SITF.time - lastHop) >= cadence && SITF.time >= pauseUntil;
        if (ready) {
          var opt = options(s.row + 1, s.lane, mem);
          var vis = opt.filter(function (o) { return o.visible; });
          var rem = opt.filter(function (o) { return !o.visible && o.remembered; });
          var pick = null, how = null;

          if (vis.length) {
            pick = vis[0]; how = 'seen';
            if (greedy) { var cr = vis.filter(function (o) { return o.crystal; }); if (cr.length) pick = cr[0]; }
          } else if (useMemory && rem.length) {
            pick = rem[0]; how = 'remembered';
          } else if (useAxe && SITF.Tools && SITF.Tools.axeReady() &&
                     (SITF.time - idleStart) > 0.5) {
            // Nothing known above: probe a lane rather than guess at one.
            var probe = [0, -1, 1][st.axes % 3];
            SITF.Input.tool = { kind: 'axe', dir: probe, t: SITF.time };
            st.axes++;
            lastHop = SITF.time - cadence * 0.4;
          } else if (useFlare && SITF.Tools && SITF.Tools.flares > 0 &&
                     (SITF.time - idleStart) > 1.6) {
            SITF.Input.tool = { kind: 'flare', dir: 0, t: SITF.time };
            st.flares++;
            lastHop = SITF.time;
          } else if (guess === 'always' || (guess === 'wait' && (SITF.time - idleStart) > 1.4)) {
            var reach = C().MAX_HOP != null ? C().MAX_HOP : 1;
            var dirs = [];
            for (var d = -reach; d <= reach; d++) {
              if (s.lane + d >= 0 && s.lane + d < C().LANE_X.length) dirs.push(d);
            }
            pick = { d: dirs[Math.floor(Math.random() * dirs.length)] };
            how = 'guess';
          } else {
            st.waits += 1 / 60;
          }

          if (pick) {
            I.queueHop(pick.d);
            lastHop = SITF.time;
            st.hops++;
            st[how === 'seen' ? 'seen' : how === 'remembered' ? 'remembered' : 'guesses']++;
            idleStart = null;
            if (restEvery && ++sinceRest >= restEvery) { sinceRest = 0; pauseUntil = SITF.time + restFor; }
          }
        }
      } else {
        idleStart = null;
      }

      SITF.advance(1 / 60, false);
    }

    var fin = P.snapshot();
    st.result = fin.over ? (fin.row >= C().ROWS ? 'SUMMIT' : 'WHITEOUT') : 'TIMEOUT';
    st.row = fin.row;
    st.time = +fin.time.toFixed(1);
    st.slips = fin.slips;
    st.blind = fin.blind;
    st.score = fin.score;
    st.crystals = fin.crystals;
    st.bestCombo = fin.bestCombo;
    st.minGapRows = +st.minGapRows.toFixed(1);
    st.guessRate = st.hops ? +(st.guesses / st.hops).toFixed(3) : 0;
    st.stormSec = +(st.stormFrames / 60).toFixed(1);
    st.shelterSec = +(st.shelterFrames / 60).toFixed(1);
    st.minBreath = +st.minBreath.toFixed(2);
    st.waits = +st.waits.toFixed(1);
    st.idleSeconds = +st.idleSeconds.toFixed(1);
    return st;
  };

  // The standard battery. Any change to the reveal economy or the storm
  // should move these numbers in a direction we can argue for.
  B.PROFILES = [
    { name: 'expert',    cadence: 0.35, guess: 'wait', axe: true, flare: true, shelter: true },
    { name: 'competent', cadence: 0.5,  guess: 'wait', axe: true, flare: true, shelter: true },
    { name: 'steady',    cadence: 0.8,  guess: 'wait', axe: true, shelter: true },
    { name: 'cautious',  cadence: 1.3,  guess: 'never', axe: true, shelter: true },
    { name: 'hesitant',  cadence: 0.5,  guess: 'wait', axe: true, shelter: true, restEvery: 6, restFor: 2 },
    { name: 'no-tools',  cadence: 0.5,  guess: 'wait', shelter: true },
    { name: 'no-shelter',cadence: 0.5,  guess: 'wait', axe: true, flare: true },
    { name: 'no-memory', cadence: 0.5,  guess: 'wait', useMemory: false, axe: true, shelter: true },
    { name: 'reckless',  cadence: 0.3,  guess: 'always' }
  ];

  B.suite = function (profiles) {
    var list = profiles || B.PROFILES;
    var rows = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var r = B.run(p);
      rows.push({
        profile: p.name, result: r.result, row: r.row, time: r.time,
        hops: r.hops, seen: r.seen, mem: r.remembered, guesses: r.guesses,
        guessRate: r.guessRate, axes: r.axes, flares: r.flares,
        slips: r.slips, blind: r.blind, stormSec: r.stormSec,
        shelterSec: r.shelterSec, minBreath: r.minBreath,
        score: r.score, minGap: r.minGapRows, waited: r.waits
      });
    }
    return rows;
  };

  // --- instrumentation -----------------------------------------------------

  B.perf = function (frames) {
    frames = frames || 300;
    var t0 = performance.now();
    for (var i = 0; i < frames; i++) SITF.advance(1 / 60, true);
    return +((performance.now() - t0) / frames).toFixed(2);
  };

  function pixels() {
    var src = document.querySelector('canvas');
    var t = document.createElement('canvas');
    t.width = C().W; t.height = C().H;
    var c = t.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(src, 0, 0, src.width, src.height, 0, 0, C().W, C().H);
    return c.getImageData(0, 0, C().W, C().H).data;
  }

  // Rows where nearly every column steps at once: a ruled line across the
  // frame, which is the artefact the cloud deck and the fog skirt both had.
  B.edgeScan = function (minPercent) {
    var W = C().W, H = C().H;
    var d = pixels();
    var hits = [];
    var thr = minPercent || 80;
    for (var y = 1; y < H; y++) {
      var n = 0, mag = 0;
      for (var x = 0; x < W; x++) {
        var i = (y * W + x) * 4, j = ((y - 1) * W + x) * 4;
        var df = Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]);
        if (df > 14) { n++; mag += df; }
      }
      var pct = Math.round(n / W * 100);
      if (pct >= thr) hits.push({ y: y, percent: pct, avgStep: Math.round(mag / Math.max(1, n)) });
    }
    return hits;
  };

  // Contact sheet of the given rows, pinned over the page for a screenshot.
  B.sheet = function (rows, settle) {
    if (!C().DEBUG) return 'set SITF.Config.DEBUG = true first';
    settle = settle || 120;
    var P = play();
    var old = document.getElementById('botsheet');
    if (old) old.remove();
    var cols = 2, n = rows.length, r0 = Math.ceil(n / cols);
    var g = document.createElement('canvas');
    g.width = C().W * cols; g.height = C().H * r0;
    var gc = g.getContext('2d');
    gc.imageSmoothingEnabled = false;
    var src = document.querySelector('canvas');
    var cur = P.snapshot().row;
    for (var i = 0; i < n; i++) {
      P.debugJump(rows[i] - cur); cur = rows[i];
      for (var f = 0; f < settle; f++) SITF.advance(1 / 60, true);
      var dx = (i % cols) * C().W, dy = Math.floor(i / cols) * C().H;
      gc.drawImage(src, 0, 0, src.width, src.height, dx, dy, C().W, C().H);
      gc.fillStyle = '#fff'; gc.font = '16px monospace';
      gc.fillText('row ' + rows[i], dx + 8, dy + 20);
    }
    g.id = 'botsheet';
    g.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:' +
      Math.min(790, g.width) + 'px;height:auto;image-rendering:pixelated';
    document.body.appendChild(g);
    return 'sheet: ' + rows.join(', ');
  };

  B.clearSheet = function () {
    var el = document.getElementById('botsheet');
    if (el) el.remove();
    return 'cleared';
  };

  // Where runs end, over many seeds' worth of attempts at one profile.
  B.deathMap = function (profile, times) {
    times = times || 8;
    var buckets = {};
    for (var i = 0; i < times; i++) {
      var r = B.run(profile);
      var key = r.result === 'SUMMIT' ? 'SUMMIT' : ('row ' + (Math.floor(r.row / 20) * 20));
      buckets[key] = (buckets[key] || 0) + 1;
    }
    return buckets;
  };

  B.validateSeeds = function (n) {
    var M = SITF.Mountain, bad = [];
    var realSeed = C().SEED;
    for (var s = 0; s < (n || 200); s++) {
      M.generate(1000 + s);
      if (!M.validate(false)) bad.push(1000 + s);
    }
    M.generate(realSeed);
    return bad.length ? { failed: bad } : { ok: (n || 200) + ' seeds' };
  };

  SITF.Bots = B;
  console.log('[bots] ready: SITF.Bots.suite(), .run(), .edgeScan(), .sheet([rows]), .perf(), .validateSeeds()');
})();
