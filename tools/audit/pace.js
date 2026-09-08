// How fast can the route actually be climbed, and does the avalanche care?
'use strict';
var World = require('./world.js');
var Sim = require('./sim.js');
var w = World.build(); var sim = Sim.makeSim(w); var C = w.C, T = w.T;

var RUN = [0, 5, 9, 14, 20, 28, 38], HOLD = [26, 19, 13, 9], STEER = [1, 0, -1];

function tryPlan(startX, topY, target, plan) {
  var p = sim.place(startX, topY);
  if (sim.solid(p.x, p.y)) return -1;
  var inp = { ax: 0, jump: false, hold: false, allowWall: false };
  for (var f = 0; f < plan.run + 110; f++) {
    if (f < plan.run) { inp.ax = plan.runDir; inp.jump = false; inp.hold = true; }
    else {
      inp.jump = (f === plan.run);
      inp.hold = (f - plan.run) < plan.hold;
      inp.ax = f < plan.run + 2 ? plan.runDir : plan.steer;
    }
    sim.step(p, inp);
    if (f > plan.run + 1 && p.onGround) {
      if (p.y + C.P_H <= target.y + 2.5) return f + 1;
      if (p.y + C.P_H > topY + 6) return -1;
    }
    if (p.y > topY + 260) return -1;
  }
  return -1;
}

var chain = T.platforms.filter(function (p) { return p.path; }).sort(function (a, b) { return b.y - a.y; });
var frames = 0, worst = 0;
for (var i = 0; i < chain.length - 1; i++) {
  var a = chain[i], b = chain[i + 1];
  var dir = b.x >= a.x ? 1 : -1;
  var span = Math.max(0, a.w * 0.5 - 4);
  var xs = [a.x + dir * span, a.x, a.x + dir * span * 0.5, a.x - dir * span * 0.5, a.x - dir * span];
  var best = -1;
  for (var xi = 0; xi < xs.length && best < 0; xi++) {
    for (var r = 0; r < RUN.length && best < 0; r++) {
      for (var h = 0; h < HOLD.length && best < 0; h++) {
        for (var s = 0; s < STEER.length && best < 0; s++) {
          for (var d = 0; d < 2 && best < 0; d++) {
            var n = tryPlan(xs[xi], a.y, b, { runDir: d ? -dir : dir, run: RUN[r], hold: HOLD[h], steer: STEER[s] * dir });
            if (n > 0) best = n;
          }
        }
      }
    }
  }
  if (best < 0) { console.log('unreachable link', i); continue; }
  frames += best;
  if (best > worst) worst = best;
}
var perfect = frames / 60;
console.log('links', chain.length - 1);
console.log('perfect climb time', perfect.toFixed(1) + 's', ' worst single link', (worst / 60).toFixed(2) + 's');
console.log('mean climb rate', (C.WORLD_H / perfect).toFixed(1) + ' px/s');
console.log('zone avalanche speeds', C.ZONES.map(function (z) { return z.avalanche; }).join(', '));
