// Baking the mountain.
//
// The face is cut into slabs one screen-and-a-bit tall. When the camera gets
// near one, the slab is rasterised into a solidity mask, painted with the
// zone's materials, given a height field, differentiated into normals, and
// uploaded as a texture pair. Old slabs are dropped.
//
// The shading baked in here is only what does not move: rime on the edges,
// snow where the sky can reach, and the ambient occlusion of the mass. Every
// light in the game is applied live against the normal map.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;
  var T = IF.Terrain;
  var Rock = IF.Rock;
  var NG = IF.NormalGen;

  var W = C.W, H = C.CHUNK_H;
  var CELLS_X = Math.ceil(W / C.CELL);
  var CELLS_Y = Math.ceil(H / C.CELL);

  var K = {};

  var cache = {};        // ci -> chunk
  var order = [];        // LRU, most recent last
  var queue = [];
  var lastBakeMs = 0;

  // Scratch buffers, allocated once. Baking is the hottest thing the game
  // does and it should not also be the thing that makes the GC run.
  var mask = new Uint8Array(W * H);
  var df = new Float32Array(W * H);
  var occ = new Float32Array(W * H);
  var occTmp = new Float32Array(W * H);
  var height = new Float32Array(W * H);
  var gloss = new Float32Array(W * H);
  var expose = new Float32Array(W * H);

  var albedoCtx = null, normalCtx = null;
  var albedoImg = null, normalImg = null;

  function ensureScratch() {
    if (albedoCtx) return;
    albedoCtx = U.ctx2d(W, H);
    normalCtx = U.ctx2d(W, H);
    albedoImg = albedoCtx.createImageData(W, H);
    normalImg = normalCtx.createImageData(W, H);
  }

  // --- fields --------------------------------------------------------------

  // Distance from each solid pixel to the nearest air pixel. Two chamfer
  // sweeps; close enough to Euclidean for rime and bevel.
  function distanceField() {
    var i, x, y, v;
    for (i = 0; i < W * H; i++) df[i] = mask[i] ? 1e9 : 0;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        i = y * W + x;
        if (df[i] === 0) continue;
        v = df[i];
        if (x > 0) v = Math.min(v, df[i - 1] + 1);
        if (y > 0) v = Math.min(v, df[i - W] + 1);
        if (x > 0 && y > 0) v = Math.min(v, df[i - W - 1] + 1.414);
        if (x < W - 1 && y > 0) v = Math.min(v, df[i - W + 1] + 1.414);
        df[i] = v;
      }
    }
    for (y = H - 1; y >= 0; y--) {
      for (x = W - 1; x >= 0; x--) {
        i = y * W + x;
        if (df[i] === 0) continue;
        v = df[i];
        if (x < W - 1) v = Math.min(v, df[i + 1] + 1);
        if (y < H - 1) v = Math.min(v, df[i + W] + 1);
        if (x < W - 1 && y < H - 1) v = Math.min(v, df[i + W + 1] + 1.414);
        if (x > 0 && y < H - 1) v = Math.min(v, df[i + W - 1] + 1.414);
        df[i] = v;
      }
    }
  }

  // Sliding-window box blur: O(pixels) whatever the radius, which matters
  // because the ambient term wants a wide one.
  function boxBlur(src, dst, tmp, r) {
    var x, y, i, sum, n = r * 2 + 1;
    for (y = 0; y < H; y++) {
      var row = y * W;
      sum = 0;
      for (x = -r; x <= r; x++) sum += src[row + U.clamp(x, 0, W - 1)];
      for (x = 0; x < W; x++) {
        tmp[row + x] = sum / n;
        sum -= src[row + U.clamp(x - r, 0, W - 1)];
        sum += src[row + U.clamp(x + r + 1, 0, W - 1)];
      }
    }
    for (x = 0; x < W; x++) {
      sum = 0;
      for (y = -r; y <= r; y++) sum += tmp[U.clamp(y, 0, H - 1) * W + x];
      for (y = 0; y < H; y++) {
        dst[y * W + x] = sum / n;
        sum -= tmp[U.clamp(y - r, 0, H - 1) * W + x];
        sum += tmp[U.clamp(y + r + 1, 0, H - 1) * W + x];
      }
    }
  }

  // How much open sky is directly above a pixel. Snow lies where this is
  // high, which is what makes a ledge read as a ledge from across the frame.
  function exposure() {
    var LOOK = 6;
    for (var x = 0; x < W; x++) {
      var run = LOOK;              // air pixels seen going up, saturating
      for (var y = 0; y < H; y++) {
        var i = y * W + x;
        if (!mask[i]) { run = LOOK; expose[i] = 0; continue; }
        expose[i] = run / LOOK;
        run = Math.max(0, run - 2.2);
      }
    }
  }

  // --- the bake ------------------------------------------------------------

  // Which materials this altitude is made of, and how much snow sticks.
  function materialsFor(yTop) {
    var prog = C.progressAt(yTop + H * 0.5);
    var base, over, mix, snowBias;
    if (prog < 0.22) {
      base = Rock.get('rock'); over = Rock.get('rock_snow');
      mix = U.smoothstep(0.02, 0.30, prog); snowBias = 0.30;
    } else if (prog < 0.48) {
      base = Rock.get('rock_snow'); over = Rock.get('ice');
      mix = U.smoothstep(0.22, 0.52, prog); snowBias = 0.48;
    } else if (prog < 0.74) {
      base = Rock.get('ice'); over = Rock.get('rock_snow');
      mix = U.smoothstep(0.48, 0.78, prog); snowBias = 0.62;
    } else {
      base = Rock.get('rock_snow'); over = Rock.get('snow');
      mix = U.smoothstep(0.70, 1.06, prog) * 0.82; snowBias = 0.86;
    }
    return { base: base, over: over, mix: mix, snow: Rock.get('snow'), snowBias: snowBias };
  }

  function bake(ci) {
    var t0 = (window.performance || Date).now();
    ensureScratch();

    var yTop = ci * H;
    T.rasterize(mask, W, H, yTop);
    distanceField();
    exposure();
    // The occlusion term wants the mask smoothed a long way, so the middle of
    // a big slab sits back from its edges.
    boxBlur(mask, occ, occTmp, 7);

    var M = materialsFor(yTop);
    var TILE = Rock.TILE;
    var baseData = M.base.data, overData = M.over.data, snowData = M.snow.data;
    var baseH = M.base.height, overH = M.over.height, snowH = M.snow.height;
    var baseG = M.base.gloss, overG = M.over.gloss, snowG = M.snow.gloss;

    var ad = albedoImg.data;
    // A per-slab material blend offset stops the seam between two chunks
    // that chose different mixes from reading as a horizontal line.
    var mixTop = M.mix, mixBot = M.mix;
    {
      var pt = C.progressAt(yTop), pb = C.progressAt(yTop + H);
      mixTop = U.clamp01(M.mix + (pt - C.progressAt(yTop + H * 0.5)) * 1.6);
      mixBot = U.clamp01(M.mix + (pb - C.progressAt(yTop + H * 0.5)) * 1.6);
    }

    for (var y = 0; y < H; y++) {
      var wy = yTop + y;
      var ty = ((wy % TILE) + TILE) % TILE;
      var rowMix = U.lerp(mixTop, mixBot, y / H);
      for (var x = 0; x < W; x++) {
        var i = y * W + x;
        var p = i * 4;
        if (!mask[i]) { ad[p] = 0; ad[p + 1] = 0; ad[p + 2] = 0; ad[p + 3] = 0; height[i] = 0; gloss[i] = 0; continue; }

        var tx = ((x % TILE) + TILE) % TILE;
        var ti = (ty * TILE + tx) * 4;
        var th = ty * TILE + tx;

        var r = baseData[ti] + (overData[ti] - baseData[ti]) * rowMix;
        var g = baseData[ti + 1] + (overData[ti + 1] - baseData[ti + 1]) * rowMix;
        var b = baseData[ti + 2] + (overData[ti + 2] - baseData[ti + 2]) * rowMix;
        var hh = baseH[th] + (overH[th] - baseH[th]) * rowMix;
        var gg = baseG[th] + (overG[th] - baseG[th]) * rowMix;

        // Snow, where the sky can reach and the surface is near.
        var sn = expose[i] * U.smoothstep(5.5, 0.8, df[i]) * (0.42 + M.snowBias * 0.72);
        sn = U.clamp01(sn);
        if (sn > 0.01) {
          r += (snowData[ti] - r) * sn;
          g += (snowData[ti + 1] - g) * sn;
          b += (snowData[ti + 2] - b) * sn;
          hh += (snowH[th] * 1.15 + 0.28 - hh) * sn;
          gg += (snowG[th] - gg) * sn * 0.8;
        }

        // Rime: the last pixel or two of every edge is bright, cold and
        // glassy. It is what gives the silhouette its bite. Broken up by
        // noise, because a perfectly even line along a flat ledge reads as a
        // drawn border rather than as frost.
        var rimeN = 0.45 + U.noise2(x * 0.24, wy * 0.24, 4471) * 0.95;
        var rime = U.smoothstep(2.0, 0.5, df[i]) * (0.35 + expose[i] * 0.65) * rimeN;
        if (rime > 0.01) {
          r += (232 - r) * rime * 0.55;
          g += (244 - g) * rime * 0.55;
          b += (255 - b) * rime * 0.55;
          gg += (0.9 - gg) * rime * 0.7;
        }

        // Occlusion: the interior of the mass sits back a little from its
        // own edges, so a big slab is not a flat cutout.
        var ao = 1 - U.clamp01((occ[i] - 0.55) / 0.45) * 0.30;
        r *= ao; g *= ao; b *= ao;

        ad[p] = r; ad[p + 1] = g; ad[p + 2] = b; ad[p + 3] = 255;

        // Height: the material's own relief, plus a bevel that rolls the
        // silhouette over, plus a lift where snow has piled.
        var bevel = U.clamp01(df[i] / 3.4);
        bevel = bevel * bevel * (3 - 2 * bevel);
        height[i] = bevel * (0.42 + hh * 0.44 + sn * 0.24);
        gloss[i] = U.clamp01(gg);
      }
    }

    albedoCtx.putImageData(albedoImg, 0, 0);
    var nraw = NG.fromHeight(height, W, H, { strength: 3.4, glossField: gloss });
    normalImg.data.set(nraw);
    normalCtx.putImageData(normalImg, 0, 0);

    // Collision, sampled from the same mask so what you see is what you hit.
    var grid = new Uint8Array(CELLS_X * CELLS_Y);
    for (var cy = 0; cy < CELLS_Y; cy++) {
      for (var cx = 0; cx < CELLS_X; cx++) {
        var solid = 0, total = 0;
        for (var sy = 0; sy < C.CELL; sy += 2) {
          var py = cy * C.CELL + sy;
          if (py >= H) break;
          for (var sx = 0; sx < C.CELL; sx += 2) {
            var pxx = cx * C.CELL + sx;
            if (pxx >= W) break;
            total++;
            if (mask[py * W + pxx]) solid++;
          }
        }
        grid[cy * CELLS_X + cx] = (total && solid / total >= 0.5) ? 1 : 0;
      }
    }

    var G = IF.GL;
    var chunk = {
      ci: ci, yTop: yTop, grid: grid,
      albedo: G.texture(albedoCtx.canvas, { smooth: false, premultiply: true }),
      normal: G.texture(normalCtx.canvas, { smooth: false, premultiply: false })
    };
    lastBakeMs = (window.performance || Date).now() - t0;
    return chunk;
  }

  // --- cache ---------------------------------------------------------------

  function touch(ci) {
    var c = cache[ci];
    if (!c) return null;
    var k = order.indexOf(ci);
    if (k >= 0) order.splice(k, 1);
    order.push(ci);
    return c;
  }

  function evict() {
    while (order.length > C.CHUNK_CACHE) {
      var ci = order.shift();
      var c = cache[ci];
      if (c) {
        IF.GL.deleteTexture(c.albedo);
        IF.GL.deleteTexture(c.normal);
        delete cache[ci];
      }
    }
  }

  K.reset = function () {
    for (var ci in cache) {
      if (!cache.hasOwnProperty(ci)) continue;
      IF.GL.deleteTexture(cache[ci].albedo);
      IF.GL.deleteTexture(cache[ci].normal);
    }
    cache = {}; order = []; queue = [];
  };

  K.get = function (ci) {
    if (ci < 0 || ci >= T.chunkCount()) return null;
    var c = touch(ci);
    if (c) return c;
    c = bake(ci);
    cache[ci] = c;
    order.push(ci);
    evict();
    return c;
  };

  K.peek = function (ci) { return cache[ci] || null; };

  // Bake ahead of the camera without ever blocking a frame for more than one
  // slab. Above and below, because falling is a thing that happens.
  K.warm = function (camY, budgetMs) {
    var here = Math.floor(camY / H);
    var want = [here, here - 1, here + 1, here - 2, here + 2];
    var t0 = (window.performance || Date).now();
    for (var i = 0; i < want.length; i++) {
      var ci = want[i];
      if (ci < 0 || ci >= T.chunkCount()) continue;
      if (cache[ci]) { touch(ci); continue; }
      K.get(ci);
      if ((window.performance || Date).now() - t0 > (budgetMs || 8)) break;
    }
    evict();
  };

  K.prebake = function (camY, count) {
    var here = Math.floor(camY / H);
    for (var i = 0; i < count; i++) {
      var ci = here - i;
      if (ci >= 0 && ci < T.chunkCount()) K.get(ci);
    }
  };

  // --- collision -----------------------------------------------------------

  // Is world point (x, y) inside stone? Outside the corridor counts as solid
  // so nothing can leave the frame sideways.
  K.solid = function (x, y) {
    if (x < 0 || x >= C.W) return true;
    if (y < 0) return false;
    if (y >= C.WORLD_H) return true;
    var ci = Math.floor(y / H);
    var c = cache[ci];
    if (!c) c = K.get(ci);
    if (!c) return false;
    var cx = (x / C.CELL) | 0;
    var cy = ((y - c.yTop) / C.CELL) | 0;
    if (cx < 0 || cx >= CELLS_X || cy < 0 || cy >= CELLS_Y) return false;
    return c.grid[cy * CELLS_X + cx] === 1;
  };

  // Does an axis-aligned box overlap stone? This is the one collision query
  // the player uses, so it walks whole cells rather than sampling points:
  // a fast-moving box must never tunnel through a one-cell ledge.
  K.boxSolid = function (x, y, w, h) {
    if (x < 0 || x + w > C.W) return true;
    if (y + h > C.WORLD_H) return true;
    if (y + h < 0) return false;
    var cx0 = Math.floor(x / C.CELL), cx1 = Math.floor((x + w - 0.001) / C.CELL);
    var cy0 = Math.floor(y / C.CELL), cy1 = Math.floor((y + h - 0.001) / C.CELL);
    for (var cy = cy0; cy <= cy1; cy++) {
      var wy = cy * C.CELL;
      if (wy < 0) continue;
      var ci = Math.floor(wy / H);
      var c = cache[ci] || K.get(ci);
      if (!c) continue;
      var ly = Math.floor((wy - c.yTop) / C.CELL);
      if (ly < 0 || ly >= CELLS_Y) continue;
      var row = ly * CELLS_X;
      for (var cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cx >= CELLS_X) return true;
        if (c.grid[row + cx]) return true;
      }
    }
    return false;
  };

  // Sampled variant, used by particles and sight-lines where exactness does
  // not matter and speed does.
  K.boxHits = function (x, y, w, h) {
    var x0 = Math.floor(x / C.CELL) * C.CELL;
    var y0 = Math.floor(y / C.CELL) * C.CELL;
    for (var yy = y0; yy < y + h; yy += C.CELL) {
      for (var xx = x0; xx < x + w; xx += C.CELL) {
        if (K.solid(xx, yy)) return true;
      }
    }
    // The far edges, in case the box is not a whole number of cells.
    for (yy = y0; yy < y + h; yy += C.CELL) if (K.solid(x + w - 0.01, yy)) return true;
    for (xx = x0; xx < x + w; xx += C.CELL) if (K.solid(xx, y + h - 0.01)) return true;
    return K.solid(x + w - 0.01, y + h - 0.01);
  };

  // Walk a ray in small steps and report the first solid point. Used by the
  // axe and by hazard sight-lines.
  K.raycast = function (x, y, dx, dy, maxDist, step) {
    step = step || 3;
    var n = Math.ceil(maxDist / step);
    var px = x, py = y;
    for (var i = 1; i <= n; i++) {
      var nx = x + dx * (i * step), ny = y + dy * (i * step);
      if (K.solid(nx, ny)) {
        // Step back to the last clear point for a clean surface contact.
        return { hit: true, x: px, y: py, dist: (i - 1) * step };
      }
      px = nx; py = ny;
    }
    return { hit: false, x: px, y: py, dist: maxDist };
  };

  // How far down to the first stone under a point. -1 if nothing is there.
  K.groundBelow = function (x, y, maxDist) {
    var r = K.raycast(x, y, 0, 1, maxDist || 240, 2);
    return r.hit ? r.dist : -1;
  };

  K.lastBakeMs = function () { return lastBakeMs; };
  K.cached = function () { return order.length; };
  K.CELLS_X = CELLS_X;
  K.CELLS_Y = CELLS_Y;

  IF.Chunks = K;
})();
