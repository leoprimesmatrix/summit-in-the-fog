// The run: score, clock, checkpoints and the reasons it ends.
//
// It owns nothing that moves. It watches the events the world and the hazards
// push out and turns them into numbers, a respawn point and, eventually, a
// results screen.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var R = {};

  var Player, Wp, Hz, Av, Dir, Cam, Aud, Pt;

  R.time = 0;
  R.score = 0;
  R.combo = 0;
  R.comboT = 0;
  R.best = 0;              // highest altitude reached, in metres
  R.highestY = 0;          // smallest world y touched
  R.over = false;
  R.won = false;
  R.cause = '';
  R.deaths = 0;
  R.crystals = 0;
  R.cairns = 0;
  R.dodges = 0;
  R.tookHit = false;
  R.startT = 0;

  var pops = [];           // floating score numbers
  var checkpoint = null;
  var respawnT = 0;
  var endT = 0;
  var bannerT = 0, bannerText = '', bannerSub = '';
  var lastZone = -1;

  R.reset = function () {
    Player = IF.Player; Wp = IF.WorldProps; Hz = IF.Hazards;
    Av = IF.Avalanche; Dir = IF.Director; Cam = IF.Camera;
    Aud = IF.Audio; Pt = IF.Particles;

    R.time = 0; R.score = 0; R.combo = 0; R.comboT = 0;
    R.over = false; R.won = false; R.cause = '';
    R.deaths = 0; R.crystals = 0; R.cairns = 0; R.dodges = 0;
    R.tookHit = false;
    R.highestY = IF.Terrain.startY();
    R.best = C.altitudeAt(R.highestY);
    pops.length = 0;
    checkpoint = { x: C.W / 2, y: IF.Terrain.startY() };
    respawnT = 0; endT = 0; bannerT = 0; lastZone = -1;
  };

  R.pops = function () { return pops; };
  R.banner = function () { return { t: bannerT, text: bannerText, sub: bannerSub }; };
  R.respawning = function () { return respawnT > 0; };
  R.endTime = function () { return endT; };
  R.checkpoint = function () { return checkpoint; };

  function pop(x, y, text, color, big) {
    pops.push({ x: x, y: y, text: text, color: color || '#eafaff', t: 0, big: !!big });
    if (pops.length > 24) pops.shift();
  }
  R.pop = pop;

  function add(points, x, y, label, color) {
    var mult = 1 + Math.min(R.combo, 9) * 0.1;
    var got = Math.round(points * mult);
    R.score += got;
    if (x !== undefined) {
      pop(x, y, (label ? label + '  ' : '') + '+' + got, color, points >= 250);
    }
    return got;
  }
  R.add = add;

  function showBanner(text, sub) {
    bannerText = text; bannerSub = sub || ''; bannerT = 3.4;
  }
  R.showBanner = showBanner;

  R.update = function (dt) {
    var i;

    if (!R.over) R.time += dt;
    bannerT = Math.max(0, bannerT - dt);

    R.comboT = Math.max(0, R.comboT - dt);
    if (R.comboT <= 0 && R.combo > 0) R.combo = 0;

    // Height is the base of the score, and it only ever ratchets up.
    if (Player.cy() < R.highestY) {
      var gainedM = C.altitudeAt(Player.cy()) - C.altitudeAt(R.highestY);
      R.score += gainedM * C.SCORE_HEIGHT_PER_M;
      R.highestY = Player.cy();
      R.best = C.altitudeAt(R.highestY);
    }

    // Zone announcements.
    var zi = C.zoneBlend(Player.cy()).index;
    if (zi !== lastZone) {
      if (lastZone >= 0) {
        showBanner(C.ZONES[zi].name, Math.round(C.altitudeAt(Player.cy())) + ' M');
        Aud.play('sfx_ui_hi');
      }
      lastZone = zi;
    }

    // Events from the world.
    var ev = Wp.events();
    for (i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'crystal') {
        R.crystals++;
        R.combo++; R.comboT = C.COMBO_WINDOW;
        add(C.SCORE_CRYSTAL, e.x, e.y - 14, 'CRYSTAL', '#6ef0dc');
        Player.grip = Math.min(1, Player.grip + 0.45);
      } else if (e.type === 'cairn') {
        R.cairns++;
        add(C.SCORE_CAIRN, e.x, e.y - 30, 'CAIRN', '#ffc46b');
        checkpoint = { x: e.x, y: e.y };
        Av.push(C.CAIRN_PUSHBACK);
        Dir.onCairn();
        Player.heal(1);
        Player.grip = 1;
        showBanner('CAIRN LIT', 'THE AVALANCHE FALLS BACK');
      }
    }
    Wp.clearEvents();

    // Events from the ice.
    ev = Hz.events();
    for (i = 0; i < ev.length; i++) {
      var h = ev[i];
      if (h.type === 'dodge') {
        R.dodges++;
        R.combo++; R.comboT = C.COMBO_WINDOW;
        add(C.SCORE_DODGE * (1 + h.size * 0.5), h.x, h.y - 10, null, '#9fe4ff');
      }
    }
    Hz.clearEvents();

    // The avalanche is the one thing you do not get a second chance at.
    // Everything else is a fall, and a fall costs you the ground back to the
    // last cairn you lit.
    if (Av.caught() && !R.over) {
      if (!Player.dead) Player.kill();
      R.tookHit = true;
      R.finish(false, 'THE AVALANCHE TOOK YOU');
    }

    if (Player.dead && respawnT <= 0 && !R.over) {
      R.tookHit = true;
      Dir.onPlayerHurt();
      respawnT = 1.6;
      R.deaths++;
    }
    if (respawnT > 0) {
      respawnT -= dt;
      if (respawnT <= 0 && !R.over) respawn();
    }

    // The summit.
    if (!R.won && !R.over && Player.cy() < IF.Terrain.summitY() + 6 && Player.onGround) {
      R.win();
    }

    if (R.over) endT += dt;

    for (i = pops.length - 1; i >= 0; i--) {
      pops[i].t += dt;
      pops[i].y -= dt * 22;
      if (pops[i].t > 1.5) pops.splice(i, 1);
    }
  };

  function respawn() {
    var c = Wp.lastCairn();
    var target = c ? { x: c.x, y: c.y } : checkpoint;
    Player.reset(target.x, target.y - 2);
    IF.Grapple.reset();
    Cam.reset(target.y - C.H * 0.58);
    // The avalanche is put back below the checkpoint, or the respawn is a
    // death sentence rather than a second chance.
    if (Av.y() < target.y + 260) Av.push((target.y + 320) - Av.y());
    Dir.rest(1.8);
    Dir.reset();
    R.combo = 0;
    Cam.punch(0.4);
    Pt.powder(target.x, target.y, 14, 80, 1);
  }

  R.win = function () {
    if (R.won || R.over) return;
    R.won = true;
    Player.won = true;
    R.over = true;
    endT = 0;
    R.cause = 'SUMMIT';
    R.score += C.SCORE_SUMMIT;
    var timeBonus = Math.max(0, Math.round((600 - R.time) * 6));
    R.score += timeBonus;
    if (!R.tookHit) R.score += C.SCORE_NO_HIT;
    R.timeBonus = timeBonus;
    Aud.play('sfx_summit');
    Cam.punch(0.9);
    showBanner('THE SUMMIT', '8848 M');
    for (var i = 0; i < 60; i++) {
      Pt.sparks(Player.cx() + (Math.random() - 0.5) * 90,
                Player.cy() - Math.random() * 60, 1, 220,
                [1, 0.96, 0.85], [1, 0.55, 0.2]);
    }
  };

  R.finish = function (won, cause) {
    if (R.over) return;
    R.over = true;
    R.won = !!won;
    R.cause = cause || '';
    endT = 0;
  };

  // Persisted records. Only a completed climb writes a time.
  R.commit = function () {
    var runs = U.loadNum(C.K_RUNS, 0) + 1;
    U.save(C.K_RUNS, runs);
    if (R.score > U.loadNum(C.K_BEST_SCORE, 0)) U.save(C.K_BEST_SCORE, Math.round(R.score));
    if (R.best > U.loadNum(C.K_BEST_ALT, 0)) U.save(C.K_BEST_ALT, Math.round(R.best));
    if (R.won) {
      var b = U.loadNum(C.K_BEST_TIME, 0);
      if (b <= 0 || R.time < b) U.save(C.K_BEST_TIME, R.time.toFixed(2));
    }
  };

  R.results = function () {
    return {
      won: R.won,
      cause: R.cause,
      time: R.time,
      score: Math.round(R.score),
      altitude: Math.round(R.best),
      crystals: R.crystals,
      cairns: R.cairns,
      dodges: R.dodges,
      deaths: R.deaths,
      noHit: !R.tookHit,
      timeBonus: R.timeBonus || 0,
      bestScore: U.loadNum(C.K_BEST_SCORE, 0),
      bestTime: U.loadNum(C.K_BEST_TIME, 0),
      bestAlt: U.loadNum(C.K_BEST_ALT, 0)
    };
  };

  IF.Run = R;
})();
