(function () {
  'use strict';
  var U = SITF.Util;

  var MAX = 900;
  var pool = [];
  var rnd = Math.random;

  for (var i = 0; i < MAX; i++) {
    pool.push({ alive: false, type: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
                w: 1, h: 1, color: '#fff', alpha: 1, seed: 0, layer: 'world', r: 0, grow: 0 });
  }

  var P = { gustBoost: 0 };

  function free() {
    for (var i = 0; i < MAX; i++) if (!pool[i].alive) return pool[i];
    return null;
  }

  // Types:
  //   snow     drifting flake, sways, pushed sideways during a gust
  //   flake    near-camera snow: bigger, faster, same behaviour
  //   wisp     slow horizontal band of fog
  //   streak   fast horizontal line during a gust
  //   dust     kicked up on landing, falls under gravity
  //   puff     landing cloud: expands and fades, no gravity
  //   debris   rock chips, gravity
  //   sparkle  rises and blinks (crystals, cairns)
  //   ember    rises with a sway, warm, shrinks as it dies (lit cairns)
  //   ring     expanding outline (echo step, cairn light)
  //   trail    short-lived pixel left behind a moving climber
  //   leaf     pine needle / leaf falling with a wide sway (treeline)
  //   mote     slow aurora light drifting upward (summit night)
  //
  // opts: {vx,vy,life,w,h,color,alpha,layer,r,grow}
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
    p.r = opts.r || 0;
    p.grow = opts.grow || 0;
    p.seed = rnd() * 6.283;
    return p;
  };

  P.clear = function () {
    for (var i = 0; i < MAX; i++) pool[i].alive = false;
    P.gustBoost = 0;
  };

  P.update = function (dt) {
    if (P.gustBoost > 0) P.gustBoost = Math.max(0, P.gustBoost - dt);
    var gust = P.gustBoost > 0 ? 90 : 0;
    for (var i = 0; i < MAX; i++) {
      var p = pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }

      switch (p.type) {
        case 'snow':
          p.x += (p.vx + gust) * dt + Math.sin(SITF.time * 1.6 + p.seed) * 0.35;
          p.y += p.vy * dt;
          break;
        case 'flake':
          p.x += (p.vx + gust * 1.5) * dt + Math.sin(SITF.time * 2.2 + p.seed) * 0.6;
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
        case 'ember':
          p.x += p.vx * dt + Math.sin(SITF.time * 3 + p.seed) * 0.5;
          p.y += p.vy * dt;
          p.vy -= 12 * dt;
          break;
        case 'dust':
          p.vy += 90 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.94;
          break;
        case 'puff':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.9;
          p.vy *= 0.9;
          break;
        case 'leaf':
          p.x += p.vx * dt + Math.sin(SITF.time * 2.5 + p.seed) * 1.1;
          p.y += p.vy * dt * (0.7 + 0.3 * Math.cos(SITF.time * 2.5 + p.seed));
          break;
        case 'mote':
          p.x += p.vx * dt + Math.sin(SITF.time * 0.8 + p.seed) * 0.25;
          p.y += p.vy * dt;
          break;
        case 'ring':
          break;
        default: // streak, wisp, trail
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
      var t = p.life / p.maxLife;   // 1 -> 0 over the life
      var a = p.alpha;
      var w = p.w, h = p.h;
      switch (p.type) {
        case 'streak': case 'wisp': case 'dust': case 'trail':
          a *= t; break;
        case 'sparkle':
          a *= (t > 0.7 ? (1 - t) / 0.3 : t / 0.7); break;
        case 'snow': case 'flake':
          a *= Math.min(1, t * 3); break;
        case 'ember':
          a *= Math.min(1, t * 2);
          if (t < 0.5) { w = 1; h = 1; }
          break;
        case 'puff':
          a *= t * t;
          w = p.w + Math.round(p.grow * (1 - t));
          h = p.h + Math.round(p.grow * (1 - t) * 0.6);
          break;
        case 'leaf':
          a *= Math.min(1, t * 4); break;
        case 'mote':
          a *= Math.sin(Math.PI * (1 - t)); break;
        case 'ring': {
          // Expanding circle outline, thinning as it grows.
          var rr = p.r * (1 - t * t);
          if (rr < 1) continue;
          ctx.globalAlpha = U.clamp(a * t, 0, 1);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.w;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, rr, rr * (p.grow || 1), 0, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
      }
      if (a <= 0.01) continue;
      ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - (w - p.w) / 2), Math.round(p.y - (h - p.h) / 2), w, h);
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
