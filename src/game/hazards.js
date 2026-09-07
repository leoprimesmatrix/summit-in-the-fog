// The ice that is trying to land on you.
//
// Three shapes of threat, all of which end up as the same falling body:
//
//   boulder   comes off the top of the frame. Telegraphed by a marker on the
//             upper edge and a rumble a beat before it arrives.
//   serac     a block hanging on the wall. It notices you, cracks, and lets
//             go. You can see it coming from a long way off, which is the
//             point: it is a route decision, not a reflex test.
//   icicle    hangs under a ledge and drops when you pass beneath. Fast,
//             small, and entirely your fault.
//
// A block that lands hard enough shatters; one that lands at an angle bounces
// on down the face, which is where most of the good near-misses come from.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Hz = {};

  var T, Cam, D, A, Pt, Aud, Chunks;

  var falling = [];      // active bodies
  var anchored = [];     // seracs and icicles still attached
  var warns = [];        // top-of-frame telegraph markers
  var shocks = [];       // impact rings, drawn into the scene and the warp buffer
  var events = [];

  var SIZE_R = [11, 16, 23, 32];

  Hz.reset = function () {
    T = IF.Terrain; Cam = IF.Camera; D = IF.Draw; A = IF.Atlas;
    Pt = IF.Particles; Aud = IF.Audio; Chunks = IF.Chunks;
    falling.length = 0; warns.length = 0; shocks.length = 0; events.length = 0;

    anchored.length = 0;
    for (var i = 0; i < T.features.length; i++) {
      var f = T.features[i];
      if (f.type === 'serac') {
        anchored.push({ kind: 'serac', x: f.x, y: f.y, variant: f.variant || 0,
                        phase: 'set', t: 0, shake: 0, f: f });
      } else if (f.type === 'icicle') {
        anchored.push({ kind: 'icicle', x: f.x, y: f.y, size: f.size || 0,
                        phase: 'set', t: 0, shake: 0, f: f });
      }
    }
  };

  Hz.events = function () { return events; };
  Hz.clearEvents = function () { events.length = 0; };
  Hz.count = function () { return falling.length; };
  Hz.list = function () { return falling; };

  // --- spawning ------------------------------------------------------------

  // A boulder announced at the top of the frame. `aim` biases it toward the
  // climber; 0 is anywhere, 1 is straight at your head.
  Hz.dropBoulder = function (size, x, aim, playerX) {
    if (aim && playerX !== undefined) {
      x = U.lerp(x, playerX + (Math.random() - 0.5) * 40, aim);
    }
    x = U.clamp(x, 26, C.W - 26);
    warns.push({
      x: x, t: 0, dur: C.BOULDER_TELEGRAPH, size: size,
      done: false
    });
    Aud.playVar('sfx_rumble', 0.5 + size * 0.15, 0.14);
  };

  function spawnFalling(x, y, size, vx, vy, spin, kind) {
    var b = {
      x: x, y: y, vx: vx || 0, vy: vy || 0,
      size: size, r: SIZE_R[size],
      rot: Math.random() * U.TAU, spin: spin === undefined ? (Math.random() - 0.5) * 5 : spin,
      variant: (Math.random() * 4) | 0,
      bounces: 0, life: 0, kind: kind || 'ice',
      grazed: false, dead: false
    };
    falling.push(b);
    return b;
  }
  Hz.spawnFalling = spawnFalling;

  // --- impacts -------------------------------------------------------------

  function shock(x, y, power) {
    shocks.push({ x: x, y: y, t: 0, dur: 0.30 + power * 0.16, power: power });
  }
  Hz.shock = shock;

  function impact(b, hard) {
    var power = (b.size + 1) / 4 * (0.6 + U.clamp01(Math.abs(b.vy) / C.BOULDER_MAX_V) * 0.8);
    var dist = Math.abs(b.y - IF.Player.cy()) + Math.abs(b.x - IF.Player.cx());
    var near = U.clamp01(1 - dist / 420);

    Cam.shake(power * 0.9 * near + 0.05);
    Cam.punch(power * 0.35 * near);
    shock(b.x, b.y + b.r * 0.4, power);

    Pt.iceChips(b.x, b.y + b.r * 0.5, 8 + b.size * 8, 120 + b.size * 60, b.r * 0.8);
    Pt.powder(b.x, b.y + b.r * 0.6, 8 + b.size * 6, 60 + b.size * 40, 0.6);
    Pt.sparks(b.x, b.y + b.r * 0.5, 6 + b.size * 4, 140 + b.size * 50,
              [0.92, 0.99, 1], [0.35, 0.66, 0.92]);
    for (var p = 0; p < 2 + b.size; p++) {
      Pt.puff(b.x + (Math.random() - 0.5) * b.r * 2, b.y + b.r * 0.6, 0.7 + b.size * 0.3, 0.5);
    }
    Aud.playVar(hard ? 'sfx_shatter' : 'sfx_axe_hit', 0.5 + power * 0.6, 0.12);
    events.push({ type: 'impact', x: b.x, y: b.y, power: power });
  }

  function shatter(b) {
    impact(b, true);
    if (b.size > 0) {
      var n = b.size >= 2 ? 3 : 2;
      for (var i = 0; i < n; i++) {
        var a = -Math.PI * 0.5 + (i / (n - 1) - 0.5) * 2.2;
        var sp = 90 + Math.random() * 110;
        spawnFalling(b.x, b.y - 2, b.size - 1,
                     Math.cos(a) * sp, Math.sin(a) * sp * 0.7 - 40);
      }
    }
    b.dead = true;
  }

  // --- update --------------------------------------------------------------

  Hz.update = function (dt, player, wind) {
    var i, b;

    // Telegraph markers ripen into boulders.
    for (i = warns.length - 1; i >= 0; i--) {
      var w = warns[i];
      w.t += dt;
      if (w.t >= w.dur) {
        spawnFalling(w.x, Cam.y - 40, w.size, (Math.random() - 0.5) * 30, 90);
        warns.splice(i, 1);
      }
    }

    // Seracs and icicles wake up when you come close.
    for (i = 0; i < anchored.length; i++) {
      var an = anchored[i];
      if (an.phase === 'gone') continue;
      if (!Cam.visible(an.y, 260)) continue;
      var d = U.dist(player.cx(), player.cy(), an.x, an.y);
      if (an.phase === 'set') {
        var arm = an.kind === 'serac' ? C.SERAC_ARM : C.ICICLE_ARM;
        // An icicle only cares about what is under it; a serac cares about
        // anything nearby.
        var trip = an.kind === 'icicle'
          ? (Math.abs(player.cx() - an.x) < 20 && player.cy() > an.y && player.cy() - an.y < 190)
          : d < arm;
        if (trip) {
          an.phase = 'cracking';
          an.t = 0;
          Aud.playVar('sfx_crack', an.kind === 'serac' ? 1 : 0.55, 0.14);
        }
      } else if (an.phase === 'cracking') {
        an.t += dt;
        var fuse = an.kind === 'serac' ? C.SERAC_FUSE : C.ICICLE_FUSE;
        an.shake = an.t / fuse;
        if (Math.random() < dt * (an.kind === 'serac' ? 22 : 12)) {
          Pt.iceChips(an.x + (Math.random() - 0.5) * 14,
                      an.y + (an.kind === 'serac' ? 40 : 16), 1, 30, 3);
        }
        if (an.t >= fuse) {
          an.phase = 'gone';
          if (an.kind === 'serac') {
            spawnFalling(an.x, an.y + 26, 3, (an.x < C.W / 2 ? 40 : -40), 30, (Math.random() - 0.5) * 2);
            Aud.play('sfx_serac');
            Cam.shake(0.5);
            Pt.powder(an.x, an.y + 30, 22, 130, 0.5);
            events.push({ type: 'serac', x: an.x, y: an.y });
          } else {
            var ic = spawnFalling(an.x, an.y + 14, 0, 0, 140, 0);
            ic.kind = 'icicle';
            ic.variant = an.size;
            ic.r = 5 + an.size * 2;
            Aud.playVar('sfx_crack', 0.7, 0.2);
          }
        }
      }
    }

    // Falling bodies.
    for (i = falling.length - 1; i >= 0; i--) {
      b = falling[i];
      b.life += dt;
      b.vy = Math.min(C.BOULDER_MAX_V, b.vy + C.BOULDER_GRAV * dt);
      b.vx += wind * 0.06 * dt;
      b.vx *= Math.exp(-0.35 * dt);
      b.rot += b.spin * dt;

      var steps = Math.max(1, Math.ceil(Math.abs(b.vy * dt) / 5));
      var hit = false;
      for (var s = 0; s < steps && !hit; s++) {
        b.x += b.vx * dt / steps;
        b.y += b.vy * dt / steps;
        // Sample the leading edge rather than the centre, so a block stops on
        // the ledge instead of half inside it.
        var probe = b.r * 0.72;
        if (Chunks.solid(b.x, b.y + probe) ||
            Chunks.solid(b.x - probe * 0.6, b.y + probe * 0.6) ||
            Chunks.solid(b.x + probe * 0.6, b.y + probe * 0.6)) {
          hit = true;
        }
        if (b.x < b.r * 0.5 || b.x > C.W - b.r * 0.5) { b.vx = -b.vx * 0.6; b.x = U.clamp(b.x, b.r * 0.5, C.W - b.r * 0.5); }
      }

      if (hit) {
        var fast = b.vy > 260;
        // Small or fast: it breaks. Big and slow, or already bouncing: it
        // keeps going down the face, which is where the danger compounds.
        if (b.kind === 'icicle' || b.size === 0 || fast || b.bounces >= 2) {
          shatter(b);
        } else {
          b.bounces++;
          impact(b, false);
          b.y -= b.r * 0.5;
          b.vy = -Math.abs(b.vy) * 0.34;
          b.vx += (Math.random() - 0.5) * 150 + (b.x < C.W / 2 ? 40 : -40);
          b.spin = (Math.random() - 0.5) * 9;
        }
      }

      // A trail while it is really moving.
      if (b.vy > 200 && Math.random() < dt * (18 + b.size * 10)) {
        Pt.powder(b.x + (Math.random() - 0.5) * b.r, b.y - b.r * 0.5, 1, 18, 0.2);
      }

      // The player.
      if (!b.dead && !player.dead && !player.won) {
        var pd = U.circleRect(b.x, b.y, b.r * 0.78, player.x, player.y, player.w, player.h);
        if (pd) {
          if (player.hurt(b.size >= 2 ? 2 : 1, b.x, b.y, b.size >= 2)) {
            shatter(b);
          }
        } else if (!b.grazed) {
          var near = U.dist(b.x, b.y, player.cx(), player.cy());
          if (near < b.r + 22 && b.vy > 150) {
            b.grazed = true;
            events.push({ type: 'dodge', x: b.x, y: b.y, size: b.size });
          }
        }
      }

      if (b.dead || b.y > Cam.y + C.H + 260 || b.y > C.WORLD_H + 60) {
        falling.splice(i, 1);
      }
    }

    for (i = shocks.length - 1; i >= 0; i--) {
      shocks[i].t += dt;
      if (shocks[i].t >= shocks[i].dur) shocks.splice(i, 1);
    }
  };

  // --- lights --------------------------------------------------------------

  Hz.addLights = function (Lights) {
    var i;
    for (i = 0; i < shocks.length; i++) {
      var s = shocks[i];
      var k = 1 - s.t / s.dur;
      Lights.addHex(Cam.sx(s.x), Cam.sy(s.y), 90 * s.power * (0.4 + k * 0.8),
                    '#cfeaff', 2.4 * k * s.power, 22);
    }
    for (i = 0; i < anchored.length; i++) {
      var an = anchored[i];
      if (an.phase !== 'cracking') continue;
      if (!Cam.visible(an.y, 120)) continue;
      var f = 0.5 + 0.5 * Math.sin(an.t * 40);
      Lights.addHex(Cam.sx(an.x), Cam.sy(an.y + 20), 60, '#9fe0ff', 0.9 * an.shake * f, 14);
    }
  };

  // --- draw ----------------------------------------------------------------

  Hz.draw = function () {
    var i, an, b;
    D.useAtlas();
    D.blend('normal');

    // Anchored ice, still on the wall.
    for (i = 0; i < anchored.length; i++) {
      an = anchored[i];
      if (an.phase === 'gone') continue;
      if (!Cam.visible(an.y, 200)) continue;
      var jx = an.phase === 'cracking' ? (Math.random() - 0.5) * an.shake * 4 : 0;
      var sx = Cam.sx(an.x) + jx, sy = Cam.sy(an.y);
      if (an.kind === 'serac') {
        D.sprite('serac_' + an.variant, sx, sy, { lit: 1, normal: 0.7 });
      } else {
        D.sprite('icicle_' + an.size, sx, sy, { lit: 1, normal: 0.65 });
      }
    }

    // Falling bodies.
    for (i = 0; i < falling.length; i++) {
      b = falling[i];
      var bx = Cam.sx(b.x), by = Cam.sy(b.y);
      if (by < -120 || by > C.H + 120) continue;

      // Motion smear: a few dimmer copies up the flight path.
      var sp = Math.abs(b.vy);
      if (sp > 220) {
        var n = Math.min(4, 1 + Math.floor(sp / 160));
        for (var k = 1; k <= n; k++) {
          var t = k / (n + 1);
          if (b.kind === 'icicle') {
            D.sprite('icicle_' + b.variant, bx - b.vx * t * 0.035, by - b.vy * t * 0.035, {
              lit: 0, color: [0.62, 0.84, 1], alpha: 0.20 * (1 - t)
            });
          } else {
            D.sprite('boulder' + b.size + '_' + b.variant,
                     bx - b.vx * t * 0.035, by - b.vy * t * 0.035, {
              rot: b.rot - b.spin * t * 0.05, lit: 0,
              color: [0.62, 0.84, 1], alpha: 0.22 * (1 - t)
            });
          }
        }
      }

      if (b.kind === 'icicle') {
        D.sprite('icicle_' + b.variant, bx, by, { lit: 1, normal: 0.65, rot: b.rot * 0.2 });
      } else {
        D.sprite('boulder' + b.size + '_' + b.variant, bx, by, {
          rot: b.rot, lit: 1, normal: 0.75
        });
      }
    }
  };

  Hz.drawGlow = function () {
    var i;
    D.useAtlas();
    D.blend('add');

    // Telegraph markers along the top edge.
    for (i = 0; i < warns.length; i++) {
      var w = warns[i];
      var k = w.t / w.dur;
      var pulse = 0.45 + 0.55 * Math.abs(Math.sin(k * 22));
      var a = U.smoothstep(0, 0.15, k) * (0.55 + 0.45 * pulse);
      var yy = 12 + (1 - k) * 4;
      D.sprite('chevron', w.x, yy, {
        scale: 1 + w.size * 0.32, color: '#ff9a52', alpha: a, lit: 0, flipY: true
      });
      D.glow(w.x, yy + 4, 26 + w.size * 8, '#ff7a3a', a * 0.32);
      // A shaft of light down the lane it is coming from.
      D.streak(w.x, yy + 34, 56, 8, '#ff8a44', a * 0.10, Math.PI / 2);
    }

    // Cracking ice flashes along its fracture.
    for (i = 0; i < anchored.length; i++) {
      var an = anchored[i];
      if (an.phase !== 'cracking') continue;
      if (!Cam.visible(an.y, 160)) continue;
      var f = 0.4 + 0.6 * Math.abs(Math.sin(an.t * 34));
      var cf = Math.floor(an.t * 22) % IF.Atlas.seqLen('crack');
      D.sprite('crack_' + cf, Cam.sx(an.x), Cam.sy(an.y + (an.kind === 'serac' ? 26 : 8)), {
        scale: an.kind === 'serac' ? 1.4 : 0.6,
        color: '#d8f2ff', alpha: an.shake * f * 0.8, lit: 0
      });
    }

    // Impact rings.
    for (i = 0; i < shocks.length; i++) {
      var s = shocks[i];
      var t2 = s.t / s.dur;
      var r = 8 + t2 * (26 + s.power * 46);
      var fade = (1 - t2) * (1 - t2);
      D.ring(Cam.sx(s.x), Cam.sy(s.y), r, 2, '#dff2ff', fade * 0.30 * s.power);
      D.glow(Cam.sx(s.x), Cam.sy(s.y), 22 * s.power * (1 - t2), '#eaf8ff', fade * 0.55);
    }
    D.blend('normal');
  };

  // Shockwaves push the picture around. The warp buffer is half resolution,
  // so everything drawn into it is at half coordinates.
  Hz.drawWarp = function () {
    if (!shocks.length) return;
    D.useAtlas();
    D.blend('normal');
    for (var i = 0; i < shocks.length; i++) {
      var s = shocks[i];
      var t = s.t / s.dur;
      var r = (12 + t * (30 + s.power * 58)) * 0.5;
      D.sprite('warpring', Cam.sx(s.x) * 0.5, Cam.sy(s.y) * 0.5, {
        scale: r / 48, alpha: (1 - t) * (1 - t) * 0.95, lit: 0
      });
    }
  };

  Hz.hasWarp = function () { return shocks.length > 0; };
  Hz.warns = function () { return warns; };
  Hz.anchored = function () { return anchored; };

  IF.Hazards = Hz;
})();
