// Can the route be climbed?
//
// For every link in the chain, brute-force a set of plans a player could
// actually input and see whether any of them gets a body from this ledge to
// the next. Plain jumps first; the wall kick only as a second opinion.
'use strict';
var World = require('./world.js');
var Sim = require('./sim.js');

var RUN_FRAMES = [0, 5, 9, 14, 20, 28, 38];
var HOLD = [26, 19, 13, 9];
var STEER = [1, 0, -1];

function attempt(sim, startX, topY, target, plan, allowWall) {
  var C = sim.C;
  var p = sim.place(startX, topY);
  if (sim.solid(p.x, p.y)) return false;
  var inp = { ax: 0, jump: false, hold: false, allowWall: allowWall };
  var n = plan.run + 110;
  for (var f = 0; f < n; f++) {
    if (f < plan.run) { inp.ax = plan.runDir; inp.jump = false; inp.hold = true; }
    else {
      inp.jump = (f === plan.run);
      inp.hold = (f - plan.run) < plan.hold;
      inp.ax = f < plan.run + 2 ? plan.runDir : plan.steer;
    }
    sim.step(p, inp);
    if (f > plan.run + 1 && p.onGround) {
      var feet = p.y + C.P_H;
      if (feet <= target.y + 2.5) return true;
      // Landed back down somewhere; nothing more to learn from this plan.
      if (feet > topY + 6) return false;
    }
    if (p.y > topY + 260) return false;
  }
  return false;
}

function canReach(sim, from, target, allowWall) {
  var C = sim.C;
  var xs = [];
  var half = from.w * 0.5;
  var span = Math.max(0, half - 4);
  // Prefer the lip nearest the target, then the middle, then the far lip.
  var dir = target.x >= from.x ? 1 : -1;
  xs.push(from.x + dir * span, from.x, from.x + dir * span * 0.5,
          from.x - dir * span * 0.5, from.x - dir * span);
  var plans = [];
  for (var r = 0; r < RUN_FRAMES.length; r++) {
    for (var h = 0; h < HOLD.length; h++) {
      for (var s = 0; s < STEER.length; s++) {
        plans.push({ runDir: dir, run: RUN_FRAMES[r], hold: HOLD[h], steer: STEER[s] * dir });
        plans.push({ runDir: -dir, run: RUN_FRAMES[r], hold: HOLD[h], steer: STEER[s] * dir });
      }
    }
  }
  for (var i = 0; i < xs.length; i++) {
    var topY = from.y;
    for (var j = 0; j < plans.length; j++) {
      if (attempt(sim, xs[i], topY, target, plans[j], allowWall)) {
        return { ok: true, x: xs[i], plan: plans[j] };
      }
    }
  }
  return { ok: false };
}

function main() {
  var seed = process.argv[2] === undefined ? undefined : Number(process.argv[2]);
  var w = World.build(seed);
  var sim = Sim.makeSim(w);
  var C = w.C, T = w.T;

  var chain = T.platforms.filter(function (p) { return p.path; })
                         .sort(function (a, b) { return b.y - a.y; });   // bottom first

  var fails = [], hard = [];
  for (var i = 0; i < chain.length - 1; i++) {
    var a = chain[i], b = chain[i + 1];
    var r = canReach(sim, a, b, false);
    if (!r.ok) {
      var rw = canReach(sim, a, b, true);
      if (rw.ok) hard.push({ i: i, a: a, b: b, why: 'wall kick only' });
      else fails.push({ i: i, a: a, b: b });
    }
    if (i % 60 === 0) process.stderr.write('.');
  }
  process.stderr.write('\n');

  console.log('links', chain.length - 1, 'plain-jump failures', fails.length,
              'wall-kick-only', hard.length);
  fails.slice(0, 40).forEach(function (f) {
    var dy = f.a.y - f.b.y, dx = f.b.x - f.a.x;
    console.log('  FAIL link ' + f.i + '  y ' + f.a.y + ' -> ' + f.b.y +
      '  rise ' + dy.toFixed(0) + '  dx ' + dx.toFixed(0) +
      '  from(' + f.a.kind + ' w' + f.a.w + ') to(' + f.b.kind + ' w' + f.b.w + ')' +
      '  prog ' + (1 - f.a.y / C.WORLD_H).toFixed(3));
  });
  hard.slice(0, 20).forEach(function (f) {
    console.log('  wall-only link ' + f.i + '  rise ' + (f.a.y - f.b.y).toFixed(0) +
                '  dx ' + (f.b.x - f.a.x).toFixed(0));
  });
}

main();
