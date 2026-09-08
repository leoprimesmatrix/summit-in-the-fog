// A faithful-enough copy of the climber's physics, with no renderer, no
// audio and no hazards, so a route can be brute-forced.
'use strict';

function makeSim(world) {
  var C = world.C, U = world.U, T = world.T, boxSolid = world.boxSolid;
  var DT = 1 / 60;

  function P() {
    return { x: 0, y: 0, vx: 0, vy: 0, onGround: false, onWall: 0,
             coyote: 0, wallCoyote: 0, wallSide: 0, lockSteer: 0, grip: 1 };
  }

  function solid(x, y) { return boxSolid(x, y, C.P_W, C.P_H); }

  function moveAxis(p, dx, dy) {
    var dist = Math.abs(dx || dy);
    if (dist < 0.0001) return false;
    var sx = dx ? U.sign(dx) : 0;
    var sy = dy ? U.sign(dy) : 0;
    var remain = dist;
    while (remain > 0) {
      var s = Math.min(remain, 1);
      var nx = p.x + sx * s, ny = p.y + sy * s;
      if (solid(nx, ny)) {
        var half = s * 0.5;
        while (half > 0.06) {
          if (!solid(p.x + sx * half, p.y + sy * half)) { p.x += sx * half; p.y += sy * half; }
          half *= 0.5;
        }
        return true;
      }
      p.x = nx; p.y = ny;
      remain -= s;
    }
    return false;
  }

  function tryStepUp(p, sx) {
    for (var up = 1; up <= 3; up++) {
      if (!solid(p.x + sx, p.y - up) && !solid(p.x, p.y - up)) { p.y -= up; p.x += sx; return true; }
    }
    return false;
  }

  function surfaceUnder(p) {
    var y = p.y + C.P_H + 2;
    var pl = T.platformsBetween(y - 6, y + 6);
    var cxp = p.x + C.P_W / 2;
    for (var i = 0; i < pl.length; i++) {
      var q = pl[i];
      if (Math.abs(cxp - q.x) < q.w * 0.5 + 4 && Math.abs(q.y - (p.y + C.P_H)) < 12) {
        return q.kind === 'ice' ? 'ice' : 'rock';
      }
    }
    return 'rock';
  }

  // in: { ax, jumpPressed, jumpHeld }
  function step(p, inp) {
    var dt = DT;
    p.lockSteer = Math.max(0, p.lockSteer - dt);
    var ax = inp.ax | 0;

    p.onGround = solid(p.x, p.y + 1);
    if (p.onGround) { p.coyote = C.COYOTE; p.surface = surfaceUnder(p); }
    else p.coyote = Math.max(0, p.coyote - dt);

    // horizontal
    var steer = p.lockSteer > 0 ? 0 : ax;
    var target = steer * C.RUN_SPEED;
    if (p.onGround) {
      var accel = p.surface === 'ice' ? C.RUN_ACCEL * 0.35 : C.RUN_ACCEL;
      var fric = p.surface === 'ice' ? C.RUN_FRICTION * 0.09 : C.RUN_FRICTION;
      p.vx = steer ? U.toward(p.vx, target, accel, dt) : U.toward(p.vx, 0, fric, dt);
    } else {
      p.vx = steer ? U.toward(p.vx, target, C.AIR_ACCEL, dt) : U.toward(p.vx, 0, C.AIR_DRAG, dt);
    }

    // walls
    p.onWall = 0;
    if (!p.onGround) {
      if (solid(p.x - 2, p.y) && ax <= 0) p.onWall = -1;
      else if (solid(p.x + 2, p.y) && ax >= 0) p.onWall = 1;
    }
    if (p.onWall) {
      p.wallCoyote = C.WALL_STICK; p.wallSide = p.onWall;
      if (p.vy > 0) {
        var cap = p.grip > 0 ? C.WALL_SLIDE_V : C.FALL_CAP;
        if (p.vy > cap) p.vy = U.toward(p.vy, cap, 900, dt);
        p.grip = Math.max(0, p.grip - C.GRIP_DRAIN_WALL * dt);
      }
    } else p.wallCoyote = Math.max(0, p.wallCoyote - dt);

    // jump
    if (inp.jump) {
      if (p.onGround || p.coyote > 0) { p.vy = -C.JUMP_V; p.coyote = 0; p.jumped = true; }
      else if (inp.allowWall && (p.onWall || p.wallCoyote > 0)) {
        var side = p.onWall || p.wallSide;
        p.vx = -side * C.WALL_JUMP_VX;
        p.vy = -C.WALL_JUMP_VY;
        p.lockSteer = C.WALL_LOCK;
        p.wallCoyote = 0;
        p.jumped = true;
      }
    }
    if (!inp.hold && p.vy < -C.JUMP_V * C.JUMP_CUT) p.vy = -C.JUMP_V * C.JUMP_CUT;

    // gravity
    var g = C.GRAVITY;
    if (Math.abs(p.vy) < 60) g *= 0.82;
    if (p.vy < 0 && !inp.hold) g *= 1.35;
    p.vy = Math.min(C.FALL_CAP, p.vy + g * dt);

    if (p.onGround) p.grip = Math.min(1, p.grip + C.GRIP_REGEN_GROUND * dt);
    else if (!p.onWall) p.grip = Math.min(1, p.grip + C.GRIP_REGEN_AIR * dt);

    // move
    if (moveAxis(p, p.vx * dt, 0)) {
      if (p.onGround && !tryStepUp(p, U.sign(p.vx))) p.vx = 0;
      else if (!p.onGround) p.vx = 0;
    }
    if (moveAxis(p, 0, p.vy * dt)) {
      if (p.vy < 0) {
        var slid = false;
        for (var n = 1; n <= 4 && !slid; n++) {
          if (!solid(p.x + n, p.y - 1)) { p.x += n; p.y -= 1; slid = true; }
          else if (!solid(p.x - n, p.y - 1)) { p.x -= n; p.y -= 1; slid = true; }
        }
        if (!slid) p.vy = 0;
      } else p.vy = 0;
    }
    return p;
  }

  // Drop a body onto a platform's top surface at world x.
  function place(px, topY) {
    var p = P();
    p.x = px - C.P_W / 2;
    p.y = topY - C.P_H;
    // Settle it out of any overlap.
    for (var i = 0; i < 24 && solid(p.x, p.y); i++) p.y -= 1;
    p.surface = 'rock';
    return p;
  }

  return { P: P, solid: solid, step: step, place: place, DT: DT, C: C, U: U, T: T };
}

module.exports = { makeSim: makeSim };
