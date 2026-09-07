// The things bolted to the mountain that are not the mountain: cairns you
// light, crystals you take, anchors the axe likes, the summit flag, and the
// ledges that give way under you.
//
// Terrain generation decided where they are. This file owns what they are
// doing right now, and it is the only part of the world that is not baked.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Wp = {};

  var T, Cam, D, A, Pt, Aud;
  var state = [];        // per feature index
  var brittle = [];      // dynamic ledges, from platforms of kind 'brittle'
  var brittleByChunk = [];
  var events = [];       // things the run wants to know about

  Wp.reset = function () {
    T = IF.Terrain; Cam = IF.Camera; D = IF.Draw; A = IF.Atlas;
    Pt = IF.Particles; Aud = IF.Audio;

    state = new Array(T.features.length);
    for (var i = 0; i < T.features.length; i++) {
      var f = T.features[i];
      state[i] = {
        f: f, lit: false, taken: false, t: Math.random() * 6,
        pulse: 0, pop: 0, armed: true
      };
    }

    brittle.length = 0;
    brittleByChunk = [];
    var n = Math.ceil(C.WORLD_H / C.CHUNK_H) + 1;
    for (i = 0; i < n; i++) brittleByChunk.push([]);
    for (i = 0; i < T.platforms.length; i++) {
      var p = T.platforms[i];
      if (p.kind !== 'brittle') continue;
      var b = {
        x: p.x, y: p.y, w: p.w, h: 15,
        phase: 'whole', t: 0, shake: 0, plat: p
      };
      brittle.push(b);
      var ci = U.clamp(Math.floor(p.y / C.CHUNK_H), 0, n - 1);
      brittleByChunk[ci].push(brittle.length - 1);
      // Register with the neighbour too: a slab near a boundary must still
      // be collidable from the chunk above.
      if (ci > 0) brittleByChunk[ci - 1].push(brittle.length - 1);
    }
    events.length = 0;
  };

  Wp.events = function () { return events; };
  Wp.clearEvents = function () { events.length = 0; };

  // --- collision -----------------------------------------------------------

  Wp.boxSolid = function (x, y, w, h) {
    var ci = U.clamp(Math.floor(y / C.CHUNK_H), 0, brittleByChunk.length - 1);
    var list = brittleByChunk[ci];
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      var b = brittle[list[i]];
      if (b.phase === 'gone') continue;
      var bx = b.x - b.w / 2;
      if (x < bx + b.w && x + w > bx && y < b.y + 11 && y + h > b.y) return true;
    }
    return false;
  };

  // --- update --------------------------------------------------------------

  Wp.update = function (dt, player) {
    var i, s;
    var py = player.cy();

    var vis = T.featuresBetween(Cam.y - 200, Cam.y + C.H + 200);
    for (i = 0; i < vis.length; i++) {
      var f = vis[i];
      s = state[f.i];
      if (!s) continue;
      s.t += dt;
      s.pop = Math.max(0, s.pop - dt * 2.6);

      if (f.type === 'crystal' && !s.taken) {
        if (U.dist2(player.cx(), py, f.x, f.y) < 15 * 15) {
          s.taken = true;
          s.pop = 1;
          events.push({ type: 'crystal', x: f.x, y: f.y });
          Pt.crystalBurst(f.x, f.y);
          Aud.playVar('sfx_crystal', 1, 0.08);
          Cam.punch(0.30);
        }
      } else if (f.type === 'cairn' && !s.lit) {
        // Lighting a cairn wants you standing on its ledge, not brushing past.
        if (Math.abs(player.cx() - f.x) < 22 &&
            Math.abs(player.feetY() - f.y) < 14 && player.onGround) {
          s.lit = true;
          s.pop = 1;
          events.push({ type: 'cairn', x: f.x, y: f.y });
          Aud.play('sfx_cairn');
          Cam.punch(0.42);
          Pt.sparks(f.x, f.y - 20, 26, 130, [1, 0.92, 0.62], [1, 0.42, 0.12]);
          for (var e = 0; e < 10; e++) Pt.ember(f.x, f.y - 18);
        }
      }
      if (f.type === 'cairn' && s.lit && Math.random() < dt * 9) {
        Pt.ember(f.x, f.y - 20);
      }
    }

    // Brittle ledges.
    for (i = 0; i < brittle.length; i++) {
      var b = brittle[i];
      if (b.y < Cam.y - 400 || b.y > Cam.y + C.H + 400) {
        // Off screen and broken: quietly restore it, so backtracking works.
        if (b.phase === 'gone' && b.t > 2) { b.phase = 'whole'; b.t = 0; b.shake = 0; }
        continue;
      }
      if (b.phase === 'whole') {
        var standing = Math.abs(player.cx() - b.x) < b.w / 2 + 4 &&
                       Math.abs(player.feetY() - b.y) < 8;
        if (standing) {
          b.phase = 'cracking';
          b.t = 0;
          Aud.playVar('sfx_crack', 0.7, 0.14);
        }
      } else if (b.phase === 'cracking') {
        b.t += dt;
        b.shake = b.t / 0.7;
        if (Math.random() < dt * 26) {
          Pt.iceChips(b.x + (Math.random() - 0.5) * b.w, b.y + 12, 1, 40, 4);
        }
        if (b.t > 0.72) {
          b.phase = 'gone';
          b.t = 0;
          Aud.playVar('sfx_brittle', 1, 0.1);
          Cam.shake(0.22);
          Pt.iceChips(b.x, b.y + 6, 20, 150, b.w * 0.5);
          Pt.powder(b.x, b.y + 8, 12, 80, 0.4);
          for (var k = 0; k < 5; k++) {
            Pt.puff(b.x + (Math.random() - 0.5) * b.w, b.y + 8, 0.8, 0.5);
          }
        }
      } else {
        b.t += dt;
      }
    }
  };

  Wp.isLit = function (featureIndex) {
    var s = state[featureIndex];
    return s ? s.lit : false;
  };

  Wp.litCairns = function () {
    var n = 0;
    for (var i = 0; i < state.length; i++) if (state[i] && state[i].lit) n++;
    return n;
  };

  // The highest lit cairn, which is where a fall puts you back.
  Wp.lastCairn = function () {
    var best = null;
    for (var i = 0; i < state.length; i++) {
      var s = state[i];
      if (!s || !s.lit || s.f.type !== 'cairn') continue;
      if (!best || s.f.y < best.y) best = s.f;
    }
    return best;
  };

  Wp.crystalsTaken = function () {
    var n = 0;
    for (var i = 0; i < state.length; i++) {
      if (state[i] && state[i].taken && state[i].f.type === 'crystal') n++;
    }
    return n;
  };

  // --- lights --------------------------------------------------------------

  Wp.addLights = function (Lights) {
    var vis = T.featuresBetween(Cam.y - 60, Cam.y + C.H + 60);
    for (var i = 0; i < vis.length; i++) {
      var f = vis[i];
      var s = state[f.i];
      if (!s) continue;
      if (f.type === 'cairn' && s.lit) {
        var fl = 0.82 + 0.18 * Math.sin(s.t * 9.1) + 0.08 * Math.sin(s.t * 23.7);
        Lights.addHex(Cam.sx(f.x), Cam.sy(f.y - 22), 108, C.CAIRN_COLOR, 1.9 * fl, 20);
      } else if (f.type === 'crystal' && !s.taken) {
        var p = 0.7 + 0.3 * Math.sin(s.t * 2.6);
        Lights.addHex(Cam.sx(f.x), Cam.sy(f.y), 62, C.CRYSTAL_COLOR, 1.15 * p, 16);
      } else if (f.type === 'crystal' && s.pop > 0) {
        Lights.addHex(Cam.sx(f.x), Cam.sy(f.y), 130 * s.pop, C.CRYSTAL_COLOR, 2.6 * s.pop, 20);
      } else if (f.type === 'flag') {
        Lights.addHex(Cam.sx(f.x), Cam.sy(f.y - 30), 120, '#cfe6ff', 0.8, 30);
      }
    }
  };

  // --- draw ----------------------------------------------------------------

  // Solid pass: the things that take light.
  Wp.draw = function () {
    var i, s, f;
    D.useAtlas();
    D.blend('normal');

    // Brittle ledges first: they are part of the floor.
    for (i = 0; i < brittle.length; i++) {
      var b = brittle[i];
      if (b.phase === 'gone') continue;
      if (!Cam.visible(b.y, 80)) continue;
      var jitter = b.phase === 'cracking' ? (Math.random() - 0.5) * b.shake * 2.6 : 0;
      var frame = b.phase === 'cracking' ? (b.t > 0.42 ? 2 : 1) : 0;
      D.slabX('brittle_' + frame, Cam.sx(b.x - b.w / 2) + jitter, Cam.sy(b.y) - 2,
              b.w, 10, { lit: 1, normal: 0.6 });
    }

    var vis = T.featuresBetween(Cam.y - 80, Cam.y + C.H + 80);
    for (i = 0; i < vis.length; i++) {
      f = vis[i];
      s = state[f.i];
      if (!s) continue;
      var sx = Cam.sx(f.x), sy = Cam.sy(f.y);

      if (f.type === 'cairn') {
        var pop = s.pop > 0 ? 1 + U.ease.outBack(1 - s.pop) * 0.10 : 1;
        D.sprite('cairn_' + (s.lit ? 1 : 0), sx, sy, {
          lit: 1, normal: 0.55, sy: pop, sx: 2 - pop
        });
      } else if (f.type === 'crystal' && !s.taken) {
        var bob = Math.sin(s.t * 2.2) * 2;
        var fr = Math.floor(s.t * 6) % A.seqLen('crystal');
        D.sprite('crystal_' + fr, sx, sy + bob, {
          lit: 1, normal: 0.7, emissive: 0.32
        });
      } else if (f.type === 'anchor') {
        D.sprite('piton', sx, sy, { lit: 1, normal: 0.5, alpha: 0.85 });
      } else if (f.type === 'flag') {
        var ff = Math.floor(s.t * 8) % A.seqLen('flag');
        D.sprite('flag_' + ff, sx, sy, { lit: 1, normal: 0.5 });
      }
    }
  };

  // Additive pass: the light these things throw.
  Wp.drawGlow = function () {
    var vis = T.featuresBetween(Cam.y - 80, Cam.y + C.H + 80);
    D.useAtlas();
    D.blend('add');
    for (var i = 0; i < vis.length; i++) {
      var f = vis[i];
      var s = state[f.i];
      if (!s) continue;
      var sx = Cam.sx(f.x), sy = Cam.sy(f.y);

      if (f.type === 'cairn' && s.lit) {
        var fl = 0.82 + 0.18 * Math.sin(s.t * 9.1);
        var fr = Math.floor(s.t * 14) % IF.Atlas.seqLen('flame');
        D.sprite('flame_' + fr, sx, sy - 20, { alpha: 0.95, lit: 0 });
        D.glow(sx, sy - 22, 34 * fl, C.CAIRN_COLOR, 0.55 * fl);
        D.streak(sx, sy - 22, 70, 6, C.CAIRN_COLOR, 0.16 * fl, 0);
      } else if (f.type === 'crystal' && !s.taken) {
        var p = 0.7 + 0.3 * Math.sin(s.t * 2.6);
        var bob = Math.sin(s.t * 2.2) * 2;
        D.glow(sx, sy + bob, 22 * p, C.CRYSTAL_COLOR, 0.5 * p, true);
        D.streak(sx, sy + bob, 40, 4, C.CRYSTAL_COLOR, 0.20 * p, 0);
        D.streak(sx, sy + bob, 26, 3, C.CRYSTAL_COLOR, 0.16 * p, Math.PI / 2);
      } else if (f.type === 'crystal' && s.pop > 0) {
        D.ring(sx, sy, 12 + (1 - s.pop) * 46, 3, C.CRYSTAL_COLOR, s.pop * 0.7);
        D.glow(sx, sy, 40 * s.pop, C.CRYSTAL_COLOR, s.pop * 0.6);
      }
    }
    D.blend('normal');
  };

  Wp.brittle = function () { return brittle; };
  Wp.stateOf = function (i) { return state[i]; };

  IF.WorldProps = Wp;
})();
