(function () {
  'use strict';
  var U = SITF.Util;

  var MAX = 600;
  var pool = [];
  var rnd = Math.random;

  for (var i = 0; i < MAX; i++) {
    pool.push({ alive: false, type: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
                w: 1, h: 1, color: '#fff', alpha: 1, seed: 0, layer: 'world' });
  }

  var P = { gustBoost: 0 };

  function free() {
    for (var i = 0; i < MAX; i++) if (!pool[i].alive) return pool[i];
    return null;
  }

  // opts: {vx,vy,life,w,h,color,alpha,layer}
  P.spawn = function (type, x, y, opts) {
    var p = free();
    if (!p) return null;
    opts = opts || {};
    p.alive = true;
    p.type = type;
    p.x = x; p.y = y;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.maxLife = opts.life || 1;
    p.life = p.maxLife;
    p.w = opts.w || 1;
    p.h = opts.h || 1;
    p.color = opts.color || '#ffffff';
    p.alpha = (opts.alpha == null) ? 1 : opts.alpha;
    p.layer = opts.layer || 'world';
    p.seed = rnd() * 6.283;
    return p;
  };

  P.clear = function () {
    for (var i = 0; i < MAX; i++) pool[i].alive = false;
    P.gustBoost = 0;
  };

  P.update = function (dt) {
    if (P.gustBoost > 0) P.gustBoost = Math.max(0, P.gustBoost - dt);
    for (var i = 0; i < MAX; i++) {
      var p = pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }

      switch (p.type) {
        case 'snow':
          p.x += (p.vx + (P.gustBoost > 0 ? 90 : 0)) * dt +
                 Math.sin(SITF.time * 1.6 + p.seed) * 0.35;
          p.y += p.vy * dt;
          break;
        case 'debris':
          p.vy += 260 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'sparkle':
          p.x += p.vx * dt + Math.sin(SITF.time * 4 + p.seed) * 0.4;
          p.y += p.vy * dt;
          p.vy *= 0.985;
          break;
        case 'dust':
          p.vy += 90 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.94;
          break;
        default: // streak, wisp
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
      }
    }
  };

  P.draw = function (ctx, layer) {
    ctx.save();
    for (var i = 0; i < MAX; i++) {
      var p = pool[i];
      if (!p.alive || p.layer !== layer) continue;
      var t = p.life / p.maxLife;
      var a = p.alpha;
      if (p.type === 'streak' || p.type === 'wisp' || p.type === 'dust') a *= t;
      else if (p.type === 'sparkle') a *= (t > 0.7 ? (1 - t) / 0.3 : t / 0.7);
      else if (p.type === 'snow') a *= Math.min(1, t * 3);
      if (a <= 0.01) continue;
      ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.w, p.h);
    }
    ctx.restore();
  };

  // Shift every world particle by dy (used when the camera jumps).
  P.shift = function (dy) {
    for (var i = 0; i < MAX; i++) {
      if (pool[i].alive && pool[i].layer === 'world') pool[i].y += dy;
    }
  };

  P.count = function () {
    var n = 0;
    for (var i = 0; i < MAX; i++) if (pool[i].alive) n++;
    return n;
  };

  SITF.Particles = P;
})();
