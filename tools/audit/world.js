// Headless loader: brings Util, Config and Terrain up in Node so the route
// can be audited without a browser.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');
var sandbox = {
  window: {}, document: undefined, console: console,
  Math: Math, Date: Date, Float32Array: Float32Array,
  Uint8Array: Uint8Array, Uint32Array: Uint32Array, Int32Array: Int32Array
};
sandbox.window.ICEFALL = {};
sandbox.self = sandbox.window;
vm.createContext(sandbox);

function load(rel) {
  var src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(src, sandbox, { filename: rel });
}

load('src/core/util.js');
load('src/core/config.js');
load('src/world/terrain.js');

var IF = sandbox.window.ICEFALL;
var C = IF.Config, U = IF.Util, T = IF.Terrain;

function build(seed) {
  T.generate(seed === undefined ? C.SEED : seed);

  // Rebuild the collision grid exactly as chunks.js bakes it: rasterise the
  // slab at pixel resolution, then take a cell solid when at least half of
  // its sampled pixels are.
  var CELLS_X = Math.ceil(C.W / C.CELL);
  var CELLS_Y = Math.ceil(C.CHUNK_H / C.CELL);
  var nChunks = T.chunkCount();
  var mask = new Uint8Array(C.W * C.CHUNK_H);
  var grids = new Array(nChunks);

  for (var ci = 0; ci < nChunks; ci++) {
    var yTop = ci * C.CHUNK_H;
    T.rasterize(mask, C.W, C.CHUNK_H, yTop);
    var g = new Uint8Array(CELLS_X * CELLS_Y);
    for (var cy = 0; cy < CELLS_Y; cy++) {
      for (var cx = 0; cx < CELLS_X; cx++) {
        var solid = 0, total = 0;
        for (var sy = 0; sy < C.CELL; sy += 2) {
          var py = cy * C.CELL + sy;
          if (py >= C.CHUNK_H) break;
          for (var sx = 0; sx < C.CELL; sx += 2) {
            var pxx = cx * C.CELL + sx;
            if (pxx >= C.W) break;
            total++;
            if (mask[py * C.W + pxx]) solid++;
          }
        }
        g[cy * CELLS_X + cx] = (total && solid / total >= 0.5) ? 1 : 0;
      }
    }
    grids[ci] = g;
  }

 // Brittle ledges are not baked into the wall; props.js carries them as
  // entities. They are solid until they let go, so the audit counts them.
  var brittle = T.platforms.filter(function (p) { return p.kind === 'brittle'; });

  function brittleSolid(x, y, w, h) {
    for (var i = 0; i < brittle.length; i++) {
      var b = brittle[i];
      if (Math.abs(b.y - y) > 300) continue;
      var bx = b.x - b.w / 2;
      if (x < bx + b.w && x + w > bx && y < b.y + 11 && y + h > b.y) return true;
    }
    return false;
  }

  function boxSolid(x, y, w, h) {
    if (x < 0 || x + w > C.W) return true;
    if (y + h > C.WORLD_H) return true;
    if (y + h < 0) return false;
    var cx0 = Math.floor(x / C.CELL), cx1 = Math.floor((x + w - 0.001) / C.CELL);
    var cy0 = Math.floor(y / C.CELL), cy1 = Math.floor((y + h - 0.001) / C.CELL);
    for (var cy = cy0; cy <= cy1; cy++) {
      var wy = cy * C.CELL;
      if (wy < 0) continue;
      var ci = Math.floor(wy / C.CHUNK_H);
      var g = grids[ci];
      if (!g) continue;
      var ly = Math.floor((wy - ci * C.CHUNK_H) / C.CELL);
      if (ly < 0 || ly >= CELLS_Y) continue;
      var row = ly * CELLS_X;
      for (var cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cx >= CELLS_X) return true;
        if (g[row + cx]) return true;
      }
    }
    return brittleSolid(x, y, w, h);
  }

  return { C: C, U: U, T: T, boxSolid: boxSolid };
}

module.exports = { build: build, IF: IF, C: C, U: U, T: T };
