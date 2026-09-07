// The climber.
//
// A precision platformer body: coyote time, jump buffering, variable jump
// height, wall slide and kick, an eight-way dash, and a ledge grab. None of
// those are features you notice. All of them are why a jump you meant to
// make lands.
//
// Collision is a box swept a pixel at a time against the chunk grid and the
// dynamic ledges. A pixel is small enough that nothing tunnels and cheap
// enough that nothing notices.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var P = {};

  var Chunks, Props, In, Aud, Pt, Cam;

  // --- state ---------------------------------------------------------------

  P.x = 0; P.y = 0;
  P.vx = 0; P.vy = 0;
  P.w = C.P_W; P.h = C.P_H;
  P.facing = 1;
  P.state = 'air';
  P.onGround = false;
  P.onWall = 0;             // -1 wall on the left, +1 on the right, 0 none
  P.grip = 1;
  P.health = C.HEALTH;
  P.dead = false;
  P.won = false;

  var coyote = 0;
  var wallCoyote = 0, wallCoyoteSide = 0;
  var lockSteer = 0;
  var dashT = 0, dashCool = 0, dashDX = 0, dashDY = 0, dashUsed = false;
  var iframe = 0;
  var animT = 0, animName = 'c_idle';
  var landT = 0, fallStart = 0, falling = false;
  var stepT = 0;
  var hurtT = 0;
  var deadT = 0;
  var hangT = 0, hangSide = 0, regrab = 0;
  var slipT = 0;            // ice underfoot: friction is suspended
  var surface = 'rock';
  var jumpHeld = false;
  var enterGroundV = 0;
  var lastSafe = { x: 0, y: 0 };
  var breath = 0;

  P.reset = function (x, y) {
    Chunks = IF.Chunks; Props = IF.WorldProps; In = IF.Input;
    Aud = IF.Audio; Pt = IF.Particles; Cam = IF.Camera;
    P.x = x - C.P_W / 2; P.y = y - C.P_H;
    P.vx = 0; P.vy = 0;
    P.facing = 1; P.state = 'air';
    P.onGround = false; P.onWall = 0;
    P.grip = 1; P.health = C.HEALTH;
    P.dead = false; P.won = false;
    coyote = 0; wallCoyote = 0; lockSteer = 0;
    dashT = 0; dashCool = 0; dashUsed = false;
    iframe = 0; animT = 0; landT = 0; falling = false;
    hurtT = 0; deadT = 0; hangT = 0; regrab = 0; slipT = 0; breath = 0;
    lastSafe.x = P.x; lastSafe.y = P.y;
  };

  P.cx = function () { return P.x + P.w / 2; };
  P.cy = function () { return P.y + P.h / 2; };
  P.feetY = function () { return P.y + P.h; };
  P.invulnerable = function () { return iframe > 0; };
  P.dashing = function () { return dashT > 0; };
  P.animName = function () { return animName; };

  // --- collision -----------------------------------------------------------

  function solid(x, y) {
    if (Chunks.boxSolid(x, y, P.w, P.h)) return true;
    return Props && Props.boxSolid ? Props.boxSolid(x, y, P.w, P.h) : false;
  }
  P.solidAt = solid;

  // A small test box, for the probes that ask about one part of the body
  // rather than about the whole of it.
  function probe(x, y, w, h) {
    if (Chunks.boxSolid(x - w / 2, y - h / 2, w, h)) return true;
    return Props && Props.boxSolid ? Props.boxSolid(x - w / 2, y - h / 2, w, h) : false;
  }

  // Sweep along one axis a pixel at a time. Returns true if something stopped
  // us, so the caller can zero the right velocity component.
  function moveAxis(dx, dy) {
    var dist = Math.abs(dx || dy);
    if (dist < 0.0001) return false;
    var sx = dx ? U.sign(dx) : 0;
    var sy = dy ? U.sign(dy) : 0;
    var remain = dist;
    while (remain > 0) {
      var s = Math.min(remain, 1);
      var nx = P.x + sx * s, ny = P.y + sy * s;
      if (solid(nx, ny)) {
        // Try again at the exact contact: back off to sub-pixel.
        var half = s * 0.5;
        while (half > 0.06) {
          if (!solid(P.x + sx * half, P.y + sy * half)) { P.x += sx * half; P.y += sy * half; }
          half *= 0.5;
        }
        return true;
      }
      P.x = nx; P.y = ny;
      remain -= s;
    }
    return false;
  }

  // A step up over a one- or two-pixel lip. Without it every seam in the
  // baked rock catches your toe.
  function tryStepUp(sx) {
    for (var up = 1; up <= 3; up++) {
      if (!solid(P.x + sx, P.y - up) && !solid(P.x, P.y - up)) {
        P.y -= up;
        P.x += sx;
        return true;
      }
    }
    return false;
  }

  function grounded() {
    return solid(P.x, P.y + 1);
  }

  function wallAt(side) {
    return solid(P.x + side * 2, P.y);
  }

  // What am I standing on? Ice is slippery, snow eats momentum.
  function surfaceUnder() {
    var y = P.y + P.h + 2;
    var pl = IF.Terrain.platformsBetween(y - 6, y + 6);
    var cxp = P.cx();
    for (var i = 0; i < pl.length; i++) {
      var p = pl[i];
      if (Math.abs(cxp - p.x) < p.w * 0.5 + 4 && Math.abs(p.y - (P.y + P.h)) < 12) {
        return p.kind === 'ice' ? 'ice' : (p.kind === 'brittle' ? 'brittle' : 'rock');
      }
    }
    return 'rock';
  }

  // --- damage --------------------------------------------------------------

  P.hurt = function (amount, fromX, fromY, hard) {
    if (iframe > 0 || P.dead || P.won) return false;
    P.health -= (amount || 1);
    iframe = C.IFRAME;
    hurtT = 0.42;
    var ang = Math.atan2(P.cy() - fromY, P.cx() - fromX);
    var kb = C.KNOCKBACK * (hard ? 1.35 : 1);
    P.vx = Math.cos(ang) * kb;
    P.vy = Math.min(-140, Math.sin(ang) * kb);
    P.state = 'air';
    dashT = 0;
    Cam.shake(hard ? 0.85 : 0.55);
    Cam.punch(0.5);
    Aud.playVar('sfx_hurt', 1, 0.1);
    Pt.sparks(P.cx(), P.cy(), 18, 200, [1, 0.85, 0.7], [1, 0.3, 0.15]);
    Pt.powder(P.cx(), P.cy(), 12, 90, 1);
    if (P.health <= 0) P.kill();
    return true;
  };

  P.kill = function () {
    if (P.dead) return;
    P.health = 0;
    P.dead = true;
    deadT = 0;
    Cam.shake(1);
    Aud.play('sfx_death');
    Pt.powder(P.cx(), P.cy(), 26, 130, 1);
  };

  P.heal = function (n) {
    P.health = Math.min(C.HEALTH, P.health + (n || 1));
  };

  P.spendGrip = function (n) {
    if (P.grip < n) return false;
    P.grip -= n;
    return true;
  };

  P.lastSafe = function () { return lastSafe; };
  P.setSafe = function (x, y) { lastSafe.x = x; lastSafe.y = y; };

  // --- update --------------------------------------------------------------

  P.update = function (dt, allowInput) {
    if (P.dead) {
      deadT += dt;
      P.vy = Math.min(C.FALL_CAP, P.vy + C.GRAVITY * dt);
      if (moveAxis(0, P.vy * dt)) P.vy = 0;
      animName = 'c_hurt';
      animT += dt * 6;
      return;
    }
    if (P.won) {
      animName = 'c_cheer';
      animT += dt * 7;
      if (!grounded()) {
        P.vy = Math.min(C.FALL_CAP, P.vy + C.GRAVITY * dt);
        if (moveAxis(0, P.vy * dt)) P.vy = 0;
      }
      return;
    }

    iframe = Math.max(0, iframe - dt);
    hurtT = Math.max(0, hurtT - dt);
    dashCool = Math.max(0, dashCool - dt);
    lockSteer = Math.max(0, lockSteer - dt);
    landT = Math.max(0, landT - dt);
    slipT = Math.max(0, slipT - dt);
    regrab = Math.max(0, regrab - dt);
    breath += dt;

    var ax = allowInput ? In.axisX() : 0;
    var ay = allowInput ? In.axisY() : 0;
    var wantJump = allowInput && In.buffered('jump', C.JUMP_BUFFER);
    jumpHeld = allowInput && In.down('jump');

    var wasGround = P.onGround;
    P.onGround = grounded();
    if (P.onGround) {
      surface = surfaceUnder();
      coyote = C.COYOTE;
      dashUsed = false;
      lastSafe.x = P.x; lastSafe.y = P.y;
    } else {
      coyote = Math.max(0, coyote - dt);
    }

    // --- landing --------------------------------------------------------
    if (P.onGround && !wasGround) {
      var impact = Math.abs(enterGroundV);
      landT = U.clamp(impact / 500, 0.06, 0.20);
      if (impact > 120) {
        Pt.powder(P.cx(), P.y + P.h, Math.min(16, 3 + impact / 40), 30 + impact * 0.18, 0.5);
        Pt.puff(P.cx(), P.y + P.h - 2, 0.5 + impact / 700, 0.4);
      }
      if (impact > C.TERMINAL_FALL) {
        Aud.playVar('sfx_land_hard', 1, 0.08);
        Cam.shake(U.clamp(impact / 900, 0.12, 0.5));
        Cam.punch(0.28);
        if (impact > C.TERMINAL_FALL * 1.9) P.hurt(1, P.cx(), P.y - 40, false);
      } else if (impact > 80) {
        Aud.playVar('sfx_land', U.clamp(impact / 320, 0.3, 1), 0.1);
        Cam.shake(impact / 3400);
      }
      falling = false;
    }
    if (!P.onGround && wasGround) fallStart = P.y;

    // --- ledge hang -----------------------------------------------------
    if (P.state === 'hang') {
      hangT += dt;
      P.vx = 0; P.vy = 0;
      P.grip = Math.max(0, P.grip - C.GRIP_DRAIN_HANG * dt);
      animName = 'c_hang';
      animT += dt * 4;
      // Climb up, drop off, or fall when the grip runs out.
      if (wantJump) {
        In.consume('jump');
        P.state = 'air';
        P.vy = -C.JUMP_V * 0.92;
        P.vx = hangSide * 40;
        P.y -= 4;
        regrab = 0.42;
        Aud.playVar('sfx_jump', 0.8, 0.1);
        Pt.powder(P.cx(), P.y + P.h, 5, 40, 1);
      } else if (ay > 0 || P.grip <= 0 || (ax && ax === -hangSide)) {
        P.state = 'air';
        P.x -= hangSide * 3;
        hangT = 0;
        regrab = 0.42;
      }
      if (P.state === 'hang') { finish(dt); return; }
    }

    // --- dash -----------------------------------------------------------
    if (dashT > 0) {
      dashT -= dt;
      P.vx = dashDX * C.DASH_SPEED;
      P.vy = dashDY * C.DASH_SPEED;
      Pt.trail(P.cx() - dashDX * 4, P.cy() - dashDY * 4, [0.75, 0.93, 1], 1.1, 0.24);
      if (dashT <= 0) {
        P.vx = dashDX * C.DASH_END_V;
        P.vy = Math.min(P.vy, dashDY * C.DASH_END_V);
        dashCool = C.DASH_COOLDOWN;
      }
    } else if (allowInput && In.pressed('dash') && dashCool <= 0 && !dashUsed && P.grip >= C.DASH_GRIP) {
      var dx = ax, dy = ay;
      if (!dx && !dy) { dx = P.facing; dy = 0; }
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      dashDX = dx / len; dashDY = dy / len;
      dashT = C.DASH_TIME;
      P.grip -= C.DASH_GRIP;
      if (!P.onGround) dashUsed = true;
      P.state = 'air';
      Aud.playVar('sfx_dash', 1, 0.1);
      Cam.punch(0.24);
      Cam.shake(0.1);
      Pt.powder(P.cx(), P.cy(), 8, 70, 0.4);
      Pt.sparks(P.cx(), P.cy(), 6, 120, [0.85, 0.96, 1], [0.4, 0.7, 0.95]);
      if (dashDX) P.facing = U.sign(dashDX);
    }

    // --- horizontal -----------------------------------------------------
    if (dashT <= 0) {
      var steer = lockSteer > 0 ? 0 : ax;
      if (steer) P.facing = steer;
      var target = steer * C.RUN_SPEED;
      if (P.onGround) {
        var accel = surface === 'ice' ? C.RUN_ACCEL * 0.35 : C.RUN_ACCEL;
        var fric = surface === 'ice' ? C.RUN_FRICTION * 0.09 : C.RUN_FRICTION;
        if (steer) P.vx = U.toward(P.vx, target, accel, dt);
        else P.vx = U.toward(P.vx, 0, fric, dt);
      } else {
        if (steer) P.vx = U.toward(P.vx, target, C.AIR_ACCEL, dt);
        else P.vx = U.toward(P.vx, 0, C.AIR_DRAG, dt);
      }
    }

    // --- walls ----------------------------------------------------------
    P.onWall = 0;
    if (!P.onGround && dashT <= 0) {
      if (wallAt(-1) && ax <= 0) P.onWall = -1;
      else if (wallAt(1) && ax >= 0) P.onWall = 1;
    }
    if (P.onWall) {
      wallCoyote = C.WALL_STICK;
      wallCoyoteSide = P.onWall;
      P.facing = -P.onWall;
      if (P.vy > 0) {
        // Sliding costs grip; when it runs out you slide at full speed.
        var slideCap = P.grip > 0 ? C.WALL_SLIDE_V : C.FALL_CAP;
        if (P.vy > slideCap) P.vy = U.toward(P.vy, slideCap, 900, dt);
        P.grip = Math.max(0, P.grip - C.GRIP_DRAIN_WALL * dt);
        if (P.grip > 0 && Math.random() < dt * 22) {
          Pt.powder(P.x + (P.onWall > 0 ? P.w : 0), P.y + P.h * 0.7, 1, 24, 0.2);
        }
      }
    } else {
      wallCoyote = Math.max(0, wallCoyote - dt);
    }

    // --- jump -----------------------------------------------------------
    if (wantJump) {
      if (P.onGround || coyote > 0) {
        In.consume('jump');
        P.vy = -C.JUMP_V;
        coyote = 0;
        P.state = 'air';
        Aud.playVar('sfx_jump', 1, 0.09);
        Pt.powder(P.cx(), P.y + P.h, 6, 46, 0.9);
      } else if (P.onWall || wallCoyote > 0) {
        var side = P.onWall || wallCoyoteSide;
        In.consume('jump');
        P.vx = -side * C.WALL_JUMP_VX;
        P.vy = -C.WALL_JUMP_VY;
        P.facing = -side;
        lockSteer = C.WALL_LOCK;
        wallCoyote = 0;
        dashUsed = false;
        P.state = 'air';
        Aud.playVar('sfx_wall', 1, 0.12);
        Cam.shake(0.07);
        Pt.powder(P.x + (side > 0 ? P.w : 0), P.y + P.h * 0.5, 8, 70, 0.4);
      }
    }
    // Releasing jump early clips the rise: the whole reason jumps feel
    // controllable rather than committed.
    if (!jumpHeld && P.vy < -C.JUMP_V * C.JUMP_CUT) {
      P.vy = -C.JUMP_V * C.JUMP_CUT;
    }

    // --- gravity --------------------------------------------------------
    if (dashT <= 0) {
      var g = C.GRAVITY;
      // Float a little at the top of the arc; it gives the apex weight.
      if (Math.abs(P.vy) < 60) g *= 0.82;
      if (P.vy < 0 && !jumpHeld) g *= 1.35;
      P.vy = Math.min(C.FALL_CAP, P.vy + g * dt);
    }

    // --- grip -----------------------------------------------------------
    if (P.onGround) P.grip = Math.min(1, P.grip + C.GRIP_REGEN_GROUND * dt);
    else if (!P.onWall) P.grip = Math.min(1, P.grip + C.GRIP_REGEN_AIR * dt);

    // --- move -----------------------------------------------------------
    enterGroundV = P.vy;
    var beforeX = P.x;
    if (moveAxis(P.vx * dt, 0)) {
      // A blocked horizontal move gets one chance to step over a small lip.
      if (P.onGround && !tryStepUp(U.sign(P.vx))) P.vx = 0;
      else if (!P.onGround) P.vx = 0;
    }
    if (moveAxis(0, P.vy * dt)) {
      if (P.vy < 0) {
        // Head bump: nudge sideways past a corner rather than dead-stopping.
        // Clipping a jump on the lip of the ledge you were aiming for is the
        // single most annoying thing a platformer can do.
        var slid = false;
        for (var n = 1; n <= 4 && !slid; n++) {
          if (!solid(P.x + n, P.y - 1)) { P.x += n; P.y -= 1; slid = true; }
          else if (!solid(P.x - n, P.y - 1)) { P.x -= n; P.y -= 1; slid = true; }
        }
        if (!slid) P.vy = 0;
      } else {
        P.vy = 0;
      }
    }

    // --- ledge grab -----------------------------------------------------
    // Deliberate only: you have to be falling, and you have to be holding
    // into the wall. Grabbing on the way up, or without asking, turned every
    // lip into flypaper and cost more runs than it saved.
    if (P.state !== 'hang' && !P.onGround && P.vy > 30 && dashT <= 0 &&
        P.grip > 0.08 && hangT <= 0 && regrab <= 0) {
      var s2 = ax;
      if (s2) {
        // A lip is stone at chest height with air above it. Probing with the
        // whole body instead meant every floor counted as a ledge.
        var fx = P.cx() + s2 * (P.w / 2 + 3);
        var chestSolid = probe(fx, P.y + 6, 4, 5);
        var headClear = !probe(fx, P.y - 4, 4, 8);
        var aboveClear = !probe(P.cx(), P.y - 4, P.w - 2, 6);
        var feetHang = !probe(P.cx(), P.y + P.h + 4, P.w - 2, 4);
        if (chestSolid && headClear && aboveClear && feetHang) {
          P.state = 'hang';
          hangSide = s2;
          hangT = 0.001;
          P.vy = 0; P.vx = 0;
          Aud.playVar('sfx_wall', 0.6, 0.1);
          Pt.powder(P.x + s2 * 5, P.y + 2, 4, 30, 0.4);
        }
      }
    }
    if (P.state === 'hang' && hangT <= 0) P.state = 'air';
    if (P.state !== 'hang') hangT = Math.max(0, hangT - dt);

    // --- footsteps ------------------------------------------------------
    if (P.onGround && Math.abs(P.vx) > 30) {
      stepT -= dt * Math.abs(P.vx) / C.RUN_SPEED;
      if (stepT <= 0) {
        stepT = 0.30;
        Aud.playVar('sfx_step', 0.5, 0.18);
        Pt.powder(P.cx() - U.sign(P.vx) * 3, P.y + P.h, 2, 22, 0.5);
      }
    } else {
      stepT = 0.12;
    }

    // Off the bottom of the world.
    if (P.y > C.WORLD_H + 40) P.kill();

    finish(dt);
  };

  // Animation selection, once, from the state the physics left behind.
  function finish(dt) {
    if (P.state === 'hang') return;

    var prev = animName;
    if (hurtT > 0) animName = 'c_hurt';
    else if (dashT > 0) animName = 'c_dash';
    else if (IF.Grapple && IF.Grapple.reeling()) animName = 'c_reel';
    else if (IF.Grapple && IF.Grapple.throwing()) animName = 'c_throwing';
    else if (P.onWall) animName = 'c_wall';
    else if (!P.onGround) {
      if (P.vy < -60) animName = 'c_rise';
      else if (P.vy > 90) animName = 'c_fall';
      else animName = 'c_apex';
    } else if (landT > 0) animName = 'c_land';
    else if (Math.abs(P.vx) > 22) animName = 'c_run';
    else animName = 'c_idle';

    if (animName !== prev) animT = 0;

    var rate = 8;
    if (animName === 'c_run') rate = 4 + Math.abs(P.vx) / C.RUN_SPEED * 9;
    else if (animName === 'c_idle') rate = 4.5;
    else if (animName === 'c_land') rate = 1 / Math.max(0.06, landT + 0.02);
    else if (animName === 'c_hang') rate = 3.5;
    animT += dt * rate;
    P.state = P.onGround ? 'ground' : (P.onWall ? 'wall' : 'air');
  }

  // --- drawing -------------------------------------------------------------

  P.draw = function () {
    var D = IF.Draw;
    var A = IF.Atlas;
    if (P.dead && deadT > 1.4) return;

    // Squash on landing, stretch while falling: the two frames of cartoon
    // physics that make a body feel like it has mass.
    var sy = 1, sx = 1;
    if (landT > 0) {
      var k = landT / 0.2;
      sy = 1 - 0.16 * k; sx = 1 + 0.14 * k;
    } else if (!P.onGround && P.state !== 'wall' && dashT <= 0) {
      var st = U.clamp(Math.abs(P.vy) / C.FALL_CAP, 0, 1) * 0.14;
      sy = 1 + st; sx = 1 - st * 0.7;
    } else if (dashT > 0) {
      sx = 1.16; sy = 0.88;
    }

    var sxp = Cam.sx(P.cx());
    var syp = Cam.sy(P.y + P.h);
    var flip = P.facing < 0;
    if (P.state === 'hang') flip = hangSide < 0;

    // Invulnerability: blink, but never fully vanish - losing the player
    // sprite for whole frames is worse than the hit.
    var alpha = 1;
    if (iframe > 0 && !P.dead) alpha = 0.45 + 0.55 * Math.abs(Math.sin(IF.time * 26));

    var frames = A.seqLen(animName) || 1;
    var fi = animName === 'c_land' || animName === 'c_dash'
      ? Math.min(frames - 1, Math.floor(animT))
      : Math.floor(animT) % frames;

    D.useAtlas();
    D.blend('normal');

    // A ghost trail behind a dash reads as speed without a separate sprite.
    if (dashT > 0) {
      for (var g = 1; g <= 3; g++) {
        D.sprite(A.frameOf(animName, fi), sxp - dashDX * g * 6, syp - dashDY * g * 6, {
          sx: sx, sy: sy, flipX: flip, lit: 0,
          color: [0.55, 0.82, 1], alpha: 0.30 / g
        });
      }
    }

    D.sprite(A.frameOf(animName, fi), sxp, syp, {
      sx: sx, sy: sy, flipX: flip, lit: 1, normal: 0.6, alpha: alpha,
      color: hurtT > 0 ? [1, 0.62, 0.55] : null
    });
  };

  // The lantern hangs off the pack, so it swings with the body.
  P.lanternPos = function () {
    var ox = -P.facing * 5;
    var oy = -13;
    if (P.state === 'hang') oy = -6;
    return { x: P.cx() + ox, y: P.y + P.h + oy };
  };

  P.addLights = function (Lights) {
    var l = P.lanternPos();
    var flick = 0.86 + 0.10 * Math.sin(IF.time * 8.7) + 0.06 * Math.sin(IF.time * 21.3);
    var i = C.LANTERN_I * flick;
    if (P.dead) i *= Math.max(0, 1 - deadT);
    Lights.addHex(Cam.sx(l.x), Cam.sy(l.y), C.LANTERN_RADIUS, C.LANTERN_COLOR, i, C.LANTERN_Z);
    // A tight core so the lamp itself is a hot point, not just a wash.
    Lights.addHex(Cam.sx(l.x), Cam.sy(l.y), 26, '#fff0d0', 1.1 * flick, 8);
  };

  P.drawGlow = function () {
    var D = IF.Draw;
    var l = P.lanternPos();
    var flick = 0.86 + 0.10 * Math.sin(IF.time * 8.7) + 0.06 * Math.sin(IF.time * 21.3);
    var a = P.dead ? Math.max(0, 1 - deadT) : 1;
    D.useAtlas();
    D.blend('add');
    D.glow(Cam.sx(l.x), Cam.sy(l.y), 22, C.LANTERN_COLOR, 0.55 * flick * a, true);
    D.streak(Cam.sx(l.x), Cam.sy(l.y), 46, 4, C.LANTERN_COLOR, 0.16 * flick * a, 0);
    D.blend('normal');
  };

  P.deadTime = function () { return deadT; };
  P.surface = function () { return surface; };

  IF.Player = P;
})();
