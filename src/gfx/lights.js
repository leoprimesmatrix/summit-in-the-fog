// Lights.
//
// A light is a screen-space position, a height above the wall, a radius and a
// colour. Anything can add one, every frame, and the list is rebuilt from
// scratch each time - there are no light handles to leak.
//
// The shader takes a fixed-size array, so the list is culled to what is on
// screen and then sorted by how much each light can possibly contribute. If
// twenty-five things are glowing at once, the twenty-four that matter win.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var L = {};
  var MAX = C.MAX_LIGHTS;

  var list = [];
  var posBuf = new Float32Array(MAX * 4);
  var colBuf = new Float32Array(MAX * 4);
  var count = 0;

  // Ambient and key are properties of the zone, blended by the renderer.
  L.ambient = [0.2, 0.25, 0.35];
  L.key = [0.5, 0.55, 0.6];
  L.keyDir = [-0.5, -0.7, 0.5];

  L.begin = function () { list.length = 0; };

  // x, y are screen pixels. `z` is how far the lamp floats off the wall,
  // which is what decides whether it rakes across the rock or floods it.
  L.add = function (x, y, radius, r, g, b, intensity, z) {
    if (radius <= 0 || intensity <= 0) return;
    // Cheap frustum cull with the radius as the margin.
    if (x + radius < -20 || x - radius > C.W + 20) return;
    if (y + radius < -20 || y - radius > C.H + 20) return;
    list.push({
      x: x, y: y, z: z === undefined ? 18 : z, r: radius,
      cr: r * intensity, cg: g * intensity, cb: b * intensity,
      score: intensity * radius
    });
  };

  // Convenience for a hex colour.
  L.addHex = function (x, y, radius, hex, intensity, z) {
    var c = U.rgb(hex);
    L.add(x, y, radius, c[0], c[1], c[2], intensity, z);
  };

  L.end = function () {
    if (list.length > MAX) {
      list.sort(function (a, b) { return b.score - a.score; });
      list.length = MAX;
    }
    count = list.length;
    for (var i = 0; i < count; i++) {
      var l = list[i];
      posBuf[i * 4] = l.x; posBuf[i * 4 + 1] = l.y;
      posBuf[i * 4 + 2] = l.z; posBuf[i * 4 + 3] = l.r;
      colBuf[i * 4] = l.cr; colBuf[i * 4 + 1] = l.cg;
      colBuf[i * 4 + 2] = l.cb; colBuf[i * 4 + 3] = 1;
    }
    return count;
  };

  // Push the current set into a program that declares the light block.
  L.bind = function (prog) {
    prog.i('u_lightCount', count);
    if (count > 0) {
      prog.v4v('u_lightPos', posBuf.subarray(0, count * 4));
      prog.v4v('u_lightCol', colBuf.subarray(0, count * 4));
    }
    prog.v3('u_ambient', L.ambient[0], L.ambient[1], L.ambient[2]);
    prog.v3('u_key', L.key[0], L.key[1], L.key[2]);
    prog.v3('u_keyDir', L.keyDir[0], L.keyDir[1], L.keyDir[2]);
  };

  L.count = function () { return count; };
  L.list = function () { return list; };

  IF.Lights = L;
})();
