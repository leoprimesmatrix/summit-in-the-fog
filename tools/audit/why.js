'use strict';
var World = require('./world.js');
var Sim = require('./sim.js');
var w = World.build(process.argv[2] ? Number(process.argv[2]) : undefined);
var sim = Sim.makeSim(w), C = w.C, T = w.T;
var chain = T.platforms.filter(function (p) { return p.path; }).sort(function (a, b) { return b.y - a.y; });

// The best headroom anywhere along a ledge: how high the body's feet can get
// standing somewhere on it, before its head meets something.
function headroom(p) {
  var best = 0, bestX = p.x;
  for (var x = p.x - p.w / 2 + 6; x <= p.x + p.w / 2 - 6; x += 2) {
    var bx = x - C.P_W / 2, r = 0;
    for (var up = 0; up <= 90; up += 1) {
      if (w.boxSolid(bx, p.y - C.P_H - up, C.P_W, C.P_H)) break;
      r = up;
    }
    if (r > best) { best = r; bestX = x; }
  }
  return { rise: best, x: bestX };
}

var idx = process.argv[3] !== undefined ? [Number(process.argv[3])] : null;
var out = [];
for (var i = 0; i < chain.length - 1; i++) {
  if (idx && idx.indexOf(i) < 0) continue;
  var a = chain[i], b = chain[i + 1];
  var need = a.y - b.y;
  var hr = headroom(a);
  if (hr.rise < need + 1 || idx) {
    out.push({ i: i, need: need, head: hr.rise, dx: (b.x - a.x).toFixed(0),
               a: a.kind + ' w' + a.w + ' y' + a.y, b: b.kind + ' w' + b.w + ' y' + b.y });
  }
}
console.log('links', chain.length - 1, 'ceilinged', out.length);
out.slice(0, 30).forEach(function (o) { console.log(JSON.stringify(o)); });
