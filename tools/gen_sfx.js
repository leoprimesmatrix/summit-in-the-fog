// Every sound in ICEFALL, generated offline as plain PCM WAV.
//
//   node tools/gen_sfx.js
//
// This is an authoring tool. The game itself never synthesises anything: it
// plays these files through HTMLAudioElement and contains no Web Audio API
// code at all. Doing it this way means the sound is identical everywhere and
// costs the runtime nothing.
//
// The palette is deliberately narrow. A mountain is wind, stone and ice:
// filtered noise for everything physical, a little metal for the axe, and one
// warm bell for the things that reward you.

var fs = require('fs');
var path = require('path');

var RATE = 22050;
var OUT = path.join(__dirname, '..', 'assets', 'audio');

// ---- toolkit --------------------------------------------------------------

function buf(sec) { return new Float32Array(Math.max(1, Math.floor(RATE * sec))); }

// Deterministic noise, so a rebuild produces byte-identical files.
var seed = 20240906;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 * 2 - 1;
}
function reseed(s) { seed = s >>> 0; }

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Attack / hold / release, all in seconds.
function env(t, a, h, r) {
  if (t < a) return a > 0 ? t / a : 1;
  if (t < a + h) return 1;
  var x = (t - a - h) / r;
  return x >= 1 ? 0 : (1 - x) * (1 - x);
}

// Exponential decay, which is what almost everything physical does.
function decay(t, tau) { return Math.exp(-t / tau); }

function sine(f, t) { return Math.sin(2 * Math.PI * f * t); }
function tri(f, t) {
  var p = (f * t) % 1;
  return 4 * Math.abs(p - 0.5) - 1;
}

// A struck body: a fundamental with inharmonic partials, like stone or metal.
function body(f, t, spread) {
  spread = spread === undefined ? 1 : spread;
  return sine(f, t) * 1.0 +
         sine(f * (2.76 * spread), t) * 0.36 * decay(t, 0.12) +
         sine(f * (5.40 * spread), t) * 0.16 * decay(t, 0.07) +
         sine(f * (8.93 * spread), t) * 0.07 * decay(t, 0.04);
}

// One-pole filters. Crude, stable, and exactly what noise needs.
function lowpass(b, cutoff) {
  var a = 1 - Math.exp(-2 * Math.PI * cutoff / RATE);
  var y = 0;
  for (var i = 0; i < b.length; i++) { y += a * (b[i] - y); b[i] = y; }
  return b;
}

function highpass(b, cutoff) {
  var a = 1 - Math.exp(-2 * Math.PI * cutoff / RATE);
  var y = 0;
  for (var i = 0; i < b.length; i++) { y += a * (b[i] - y); b[i] = b[i] - y; }
  return b;
}

// A sweeping lowpass, for anything that opens or closes over its length.
function sweepLP(b, from, to, curve) {
  var y = 0;
  for (var i = 0; i < b.length; i++) {
    var t = i / b.length;
    if (curve) t = Math.pow(t, curve);
    var c = lerp(from, to, t);
    var a = 1 - Math.exp(-2 * Math.PI * c / RATE);
    y += a * (b[i] - y);
    b[i] = y;
  }
  return b;
}

// Two resonant peaks: enough to give noise a pitch without a real filter.
function resonate(b, freq, q, mix) {
  var out = new Float32Array(b.length);
  var w = 2 * Math.PI * freq / RATE;
  var r = clamp(1 - w / (2 * q), 0, 0.9995);
  var a1 = 2 * r * Math.cos(w), a2 = -r * r;
  var y1 = 0, y2 = 0;
  for (var i = 0; i < b.length; i++) {
    var y = b[i] + a1 * y1 + a2 * y2;
    y2 = y1; y1 = y;
    out[i] = y * (1 - r);
  }
  for (i = 0; i < b.length; i++) b[i] = lerp(b[i], out[i], mix);
  return b;
}

// A handful of taps: enough space to say "this is happening on a mountain"
// without turning everything to mush.
function space(b, amount, spread) {
  spread = spread || 1;
  var taps = [
    [0.031 * spread, 0.42], [0.053 * spread, 0.30],
    [0.089 * spread, 0.21], [0.137 * spread, 0.14], [0.211 * spread, 0.09]
  ];
  var out = new Float32Array(b.length);
  for (var i = 0; i < b.length; i++) out[i] = b[i];
  for (var k = 0; k < taps.length; k++) {
    var d = Math.floor(taps[k][0] * RATE);
    var g = taps[k][1] * amount;
    for (i = d; i < b.length; i++) out[i] += b[i - d] * g;
  }
  for (i = 0; i < b.length; i++) b[i] = out[i];
  return b;
}

function normalize(b, peak) {
  var m = 0;
  for (var i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
  if (m < 1e-6) return b;
  var g = (peak === undefined ? 0.85 : peak) / m;
  for (i = 0; i < b.length; i++) b[i] *= g;
  return b;
}

// Soft clip. Nothing here should ever sound like it broke.
function saturate(b, drive) {
  drive = drive || 1;
  for (var i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive) / Math.tanh(drive);
  return b;
}

// Fade the ends so nothing clicks, and so a loop meets itself.
function edges(b, ms) {
  var n = Math.floor(RATE * (ms || 4) / 1000);
  for (var i = 0; i < n && i < b.length; i++) {
    var g = i / n;
    b[i] *= g;
    b[b.length - 1 - i] *= g;
  }
  return b;
}

// Crossfade a buffer with itself, half a length offset, so it loops with no
// seam at all. Used for the two ambience beds.
function seamless(b) {
  var n = b.length;
  var h = Math.floor(n / 2);
  var out = new Float32Array(h);
  for (var i = 0; i < h; i++) {
    var t = i / h;
    out[i] = b[i] * (1 - t) + b[i + h] * t;
  }
  return out;
}

function mix(dst, src, gain, offsetSec) {
  var o = Math.floor((offsetSec || 0) * RATE);
  for (var i = 0; i < src.length; i++) {
    var j = i + o;
    if (j >= 0 && j < dst.length) dst[j] += src[i] * gain;
  }
  return dst;
}

function noiseBuf(sec, s) {
  if (s !== undefined) reseed(s);
  var b = buf(sec);
  for (var i = 0; i < b.length; i++) b[i] = rnd();
  return b;
}

function write(name, b) {
  var n = b.length;
  var head = 44;
  var out = Buffer.alloc(head + n * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);         // PCM
  out.writeUInt16LE(1, 22);         // mono
  out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(n * 2, 40);
  for (var i = 0; i < n; i++) {
    var v = clamp(b[i], -1, 1);
    out.writeInt16LE(Math.round(v * 32700), head + i * 2);
  }
  fs.writeFileSync(path.join(OUT, name + '.wav'), out);
  console.log('  ' + name + '.wav  ' + (n / RATE).toFixed(2) + 's  ' + (out.length / 1024 | 0) + 'kB');
}

// ---- the sounds -----------------------------------------------------------

var S = {};

// A boot pushing off packed snow: a short filtered thump with a crunch on top.
S.sfx_jump = function () {
  var b = buf(0.24);
  var n = noiseBuf(0.24, 11);
  sweepLP(n, 2600, 500, 0.5);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.002, 0.01, 0.16) * 0.55
         + sine(lerp(180, 96, Math.min(1, t * 9)), t) * decay(t, 0.05) * 0.5;
  }
  return edges(normalize(b, 0.7));
};

// Landing: the same crunch with more body under it.
S.sfx_land = function () {
  var b = buf(0.30);
  var n = noiseBuf(0.30, 23);
  sweepLP(n, 3200, 380, 0.6);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.001, 0.012, 0.2) * 0.62
         + sine(lerp(150, 62, Math.min(1, t * 12)), t) * decay(t, 0.07) * 0.62;
  }
  return edges(normalize(b, 0.75));
};

S.sfx_land_hard = function () {
  var b = buf(0.55);
  var n = noiseBuf(0.55, 37);
  sweepLP(n, 4200, 240, 0.55);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.001, 0.03, 0.4) * 0.7
         + sine(lerp(120, 44, Math.min(1, t * 8)), t) * decay(t, 0.13) * 0.85
         + sine(lerp(240, 70, Math.min(1, t * 14)), t) * decay(t, 0.05) * 0.3;
  }
  space(b, 0.22, 0.8);
  return edges(saturate(normalize(b, 0.85), 1.4));
};

// A crampon set into snow. Tiny, and it plays a lot, so it stays quiet.
S.sfx_step = function () {
  var b = buf(0.11);
  var n = noiseBuf(0.11, 53);
  highpass(n, 900);
  sweepLP(n, 5200, 1600, 0.4);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.001, 0.004, 0.08) * 0.5;
  }
  return edges(normalize(b, 0.42), 2);
};

// The dash: a rush of air with a rising edge on it.
S.sfx_dash = function () {
  var b = buf(0.36);
  var n = noiseBuf(0.36, 71);
  for (var i = 0; i < n.length; i++) {
    var t = i / RATE;
    var c = lerp(400, 5200, Math.min(1, t * 5));
    n[i] *= 1;
  }
  sweepLP(n, 600, 6000, 0.7);
  highpass(n, 300);
  for (i = 0; i < b.length; i++) {
    var t2 = i / RATE;
    b[i] = n[i] * env(t2, 0.012, 0.03, 0.26) * 0.8
         + sine(lerp(220, 520, Math.min(1, t2 * 4)), t2) * decay(t2, 0.06) * 0.18;
  }
  return edges(normalize(b, 0.68));
};

// Boot edging on rock: short, gritty, a bit of pitch.
S.sfx_wall = function () {
  var b = buf(0.22);
  var n = noiseBuf(0.22, 97);
  highpass(n, 600);
  sweepLP(n, 4600, 900, 0.5);
  resonate(n, 720, 3, 0.35);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.002, 0.012, 0.16) * 0.7;
  }
  return edges(normalize(b, 0.6));
};

// The axe leaving your hand: a whip of air.
S.sfx_axe = function () {
  var b = buf(0.26);
  var n = noiseBuf(0.26, 131);
  sweepLP(n, 900, 4200, 1.2);
  highpass(n, 500);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.006, 0.02, 0.2) * 0.7;
  }
  return edges(normalize(b, 0.6));
};

// The axe biting: metal on ice. A hard transient, a ring, and ice chips.
S.sfx_axe_hit = function () {
  var b = buf(0.42);
  var n = noiseBuf(0.42, 173);
  highpass(n, 1400);
  sweepLP(n, 9000, 2600, 0.4);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    var chips = n[i] * env(t, 0.0005, 0.006, 0.22) * 0.55;
    var ring = (body(1480, t, 1.0) * decay(t, 0.055) +
                body(2260, t, 1.0) * decay(t, 0.030) * 0.5) * 0.30;
    var thud = sine(lerp(300, 110, Math.min(1, t * 16)), t) * decay(t, 0.035) * 0.4;
    b[i] = chips + ring + thud;
  }
  space(b, 0.14, 0.6);
  return edges(normalize(b, 0.78));
};

// Rope through a hand. Almost nothing; it plays under everything else.
S.sfx_reel = function () {
  var b = buf(0.22);
  var n = noiseBuf(0.22, 199);
  highpass(n, 1200);
  sweepLP(n, 5000, 2200, 0.5);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.02, 0.05, 0.14) * 0.4;
  }
  return edges(normalize(b, 0.34));
};

// A crystal: the one genuinely pretty sound in the game.
S.sfx_crystal = function () {
  var b = buf(1.10);
  var notes = [1318.5, 1760, 2093, 2637];   // E6 A6 C7 E7
  for (var k = 0; k < notes.length; k++) {
    for (var i = 0; i < b.length; i++) {
      var t = i / RATE;
      var on = t - k * 0.045;
      if (on < 0) continue;
      b[i] += (sine(notes[k], on) + sine(notes[k] * 2.004, on) * 0.22) *
              decay(on, 0.20 - k * 0.02) * (0.30 - k * 0.045);
    }
  }
  var n = noiseBuf(0.2, 211);
  highpass(n, 4000);
  for (i = 0; i < n.length; i++) n[i] *= env(i / RATE, 0.001, 0.004, 0.14) * 0.20;
  mix(b, n, 1, 0);
  space(b, 0.30, 1.2);
  return edges(normalize(b, 0.72));
};

// A cairn lighting: a low warm swell under a rising bell.
S.sfx_cairn = function () {
  var b = buf(1.9);
  var notes = [261.6, 392.0, 523.3, 784.0];
  for (var k = 0; k < notes.length; k++) {
    for (var i = 0; i < b.length; i++) {
      var t = i / RATE;
      var on = t - k * 0.10;
      if (on < 0) continue;
      b[i] += body(notes[k], on, 0.6) * decay(on, 0.42) * (0.26 - k * 0.035);
    }
  }
  // The flame catching.
  var n = noiseBuf(0.9, 233);
  sweepLP(n, 300, 2200, 0.6);
  for (i = 0; i < n.length; i++) n[i] *= env(i / RATE, 0.05, 0.1, 0.7) * 0.22;
  mix(b, n, 1, 0.02);
  space(b, 0.40, 1.4);
  return edges(normalize(b, 0.8));
};

// Ice about to let go. A tight, nasty creak.
S.sfx_crack = function () {
  var b = buf(0.5);
  reseed(281);
  // A run of irregular ticks: fracture, not a single snap.
  for (var k = 0; k < 22; k++) {
    var at = Math.pow(Math.abs(rnd()), 1.6) * 0.34;
    var f = 900 + Math.abs(rnd()) * 2600;
    var tick = buf(0.05);
    for (var i = 0; i < tick.length; i++) {
      var t = i / RATE;
      tick[i] = (rnd() * 0.6 + sine(f, t) * 0.4) * decay(t, 0.006);
    }
    highpass(tick, 700);
    mix(b, tick, 0.5 + Math.abs(rnd()) * 0.5, at);
  }
  var groan = buf(0.5);
  for (i = 0; i < groan.length; i++) {
    var t2 = i / RATE;
    groan[i] = tri(lerp(78, 56, Math.min(1, t2 * 3)), t2) * env(t2, 0.02, 0.06, 0.35) * 0.35;
  }
  lowpass(groan, 400);
  mix(b, groan, 1, 0);
  space(b, 0.20, 0.9);
  return edges(normalize(b, 0.7));
};

// Something big coming, heard before it is seen.
S.sfx_rumble = function () {
  var b = buf(1.5);
  var n = noiseBuf(1.5, 307);
  lowpass(n, 160);
  lowpass(n, 220);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.30, 0.35, 0.8) * 2.4
         + sine(lerp(46, 34, t / 1.5), t) * env(t, 0.35, 0.3, 0.8) * 0.30;
  }
  return edges(normalize(b, 0.62), 20);
};

// A block of ice failing. The loudest thing in the game.
S.sfx_shatter = function () {
  var b = buf(0.85);
  var n = noiseBuf(0.85, 331);
  highpass(n, 900);
  sweepLP(n, 11000, 1800, 0.35);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.0005, 0.02, 0.5) * 0.75
         + sine(lerp(180, 52, Math.min(1, t * 10)), t) * decay(t, 0.10) * 0.55;
  }
  // Shards landing afterwards.
  reseed(347);
  for (var k = 0; k < 26; k++) {
    var at = 0.05 + Math.abs(rnd()) * 0.5;
    var tick = buf(0.04);
    var f = 1800 + Math.abs(rnd()) * 4200;
    for (i = 0; i < tick.length; i++) {
      var t2 = i / RATE;
      tick[i] = (rnd() * 0.5 + sine(f, t2) * 0.5) * decay(t2, 0.005);
    }
    highpass(tick, 1500);
    mix(b, tick, 0.28 * (1 - at), at);
  }
  space(b, 0.30, 1.1);
  return edges(saturate(normalize(b, 0.9), 1.3));
};

// A ledge giving way underfoot: crack, then collapse.
S.sfx_brittle = function () {
  var b = buf(0.7);
  var n = noiseBuf(0.7, 373);
  sweepLP(n, 5000, 500, 0.4);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.002, 0.05, 0.5) * 0.7
         + sine(lerp(130, 48, Math.min(1, t * 6)), t) * decay(t, 0.14) * 0.5;
  }
  space(b, 0.25, 1.0);
  return edges(normalize(b, 0.78));
};

// A serac letting go. Long, deep, and it should make you look up.
S.sfx_serac = function () {
  var b = buf(2.2);
  var n = noiseBuf(2.2, 401);
  lowpass(n, 900);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.02, 0.25, 1.7) * 0.85
         + sine(lerp(70, 32, Math.min(1, t * 1.2)), t) * env(t, 0.03, 0.3, 1.5) * 0.55
         + tri(lerp(120, 44, Math.min(1, t * 2)), t) * env(t, 0.01, 0.1, 0.7) * 0.22;
  }
  reseed(409);
  for (var k = 0; k < 30; k++) {
    var at = Math.abs(rnd()) * 1.6;
    var tick = buf(0.05);
    var f = 700 + Math.abs(rnd()) * 3200;
    for (i = 0; i < tick.length; i++) {
      var t2 = i / RATE;
      tick[i] = (rnd() * 0.6 + sine(f, t2) * 0.4) * decay(t2, 0.007);
    }
    highpass(tick, 900);
    mix(b, tick, 0.20, at);
  }
  space(b, 0.45, 1.6);
  return edges(saturate(normalize(b, 0.92), 1.2), 20);
};

// Taking a hit. Blunt, wrong, and over quickly.
S.sfx_hurt = function () {
  var b = buf(0.5);
  var n = noiseBuf(0.5, 433);
  sweepLP(n, 2400, 300, 0.5);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.001, 0.02, 0.3) * 0.6
         + tri(lerp(210, 84, Math.min(1, t * 7)), t) * decay(t, 0.09) * 0.55
         + sine(lerp(420, 130, Math.min(1, t * 12)), t) * decay(t, 0.04) * 0.25;
  }
  return edges(saturate(normalize(b, 0.82), 1.5));
};

// The fall that ends it: everything drops away.
S.sfx_death = function () {
  var b = buf(1.8);
  var n = noiseBuf(1.8, 461);
  sweepLP(n, 3000, 180, 0.7);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = n[i] * env(t, 0.005, 0.2, 1.4) * 0.55
         + sine(lerp(260, 46, Math.min(1, t * 0.9)), t) * env(t, 0.01, 0.15, 1.4) * 0.5
         + sine(lerp(390, 69, Math.min(1, t * 0.9)), t) * env(t, 0.01, 0.15, 1.2) * 0.2;
  }
  space(b, 0.40, 1.5);
  return edges(normalize(b, 0.85), 20);
};

// The summit. The only major chord in the game.
S.sfx_summit = function () {
  var b = buf(3.2);
  var chord = [261.6, 329.6, 392.0, 523.3, 659.3, 784.0];
  for (var k = 0; k < chord.length; k++) {
    for (var i = 0; i < b.length; i++) {
      var t = i / RATE;
      var on = t - k * 0.075;
      if (on < 0) continue;
      b[i] += (sine(chord[k], on) + sine(chord[k] * 2.002, on) * 0.28 +
               sine(chord[k] * 3.01, on) * 0.10) *
              env(on, 0.01, 0.25, 2.2) * (0.20 - k * 0.017);
    }
  }
  var air = noiseBuf(3.2, 487);
  sweepLP(air, 400, 3200, 0.5);
  for (i = 0; i < air.length; i++) air[i] *= env(i / RATE, 0.6, 0.5, 1.8) * 0.10;
  mix(b, air, 1, 0);
  space(b, 0.5, 1.8);
  return edges(normalize(b, 0.82), 20);
};

// A gust arriving.
S.sfx_gust = function () {
  var b = buf(1.7);
  var n = noiseBuf(1.7, 509);
  sweepLP(n, 500, 2600, 0.9);
  highpass(n, 220);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    var shape = Math.pow(Math.sin(Math.min(1, t / 1.7) * Math.PI), 1.5);
    b[i] = n[i] * shape * 0.8;
  }
  resonate(b, 620, 2.5, 0.20);
  return edges(normalize(b, 0.55), 30);
};

// Thunder, a long way off and then not.
S.sfx_thunder = function () {
  var b = buf(2.6);
  var n = noiseBuf(2.6, 541);
  lowpass(n, 700);
  lowpass(n, 900);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    var crack = env(t, 0.002, 0.03, 0.35) * 0.55;
    var roll = (Math.pow(Math.sin(clamp(t / 2.6, 0, 1) * Math.PI), 0.7)) * 0.5;
    b[i] = n[i] * (crack + roll);
  }
  space(b, 0.5, 2.0);
  return edges(saturate(normalize(b, 0.8), 1.2), 20);
};

// Interface. Two clicks, one lower and one higher.
S.sfx_ui = function () {
  var b = buf(0.12);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = (sine(880, t) * 0.7 + sine(1320, t) * 0.3) * decay(t, 0.022);
  }
  return edges(normalize(b, 0.4), 2);
};

S.sfx_ui_hi = function () {
  var b = buf(0.26);
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    b[i] = (sine(1046, t) * 0.6 + sine(1568, t) * 0.34) * decay(t, 0.05)
         + sine(2093, t) * 0.16 * decay(t, 0.02);
  }
  space(b, 0.18, 0.8);
  return edges(normalize(b, 0.5), 3);
};

// ---- ambience -------------------------------------------------------------
// Both beds are built at double length and folded onto themselves so they
// loop with no seam whatsoever.

S.amb_wind = function () {
  var LEN = 16;
  var b = noiseBuf(LEN, 601);
  lowpass(b, 700);
  // Slow filter movement: wind is noise that breathes.
  var out = buf(LEN);
  var y = 0;
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    var c = 380 + 260 * Math.sin(t * 0.31) + 160 * Math.sin(t * 0.11 + 1.3)
                + 90 * Math.sin(t * 0.73 + 2.6);
    var a = 1 - Math.exp(-2 * Math.PI * c / RATE);
    y += a * (b[i] - y);
    var amp = 0.55 + 0.35 * Math.sin(t * 0.19 + 0.6) + 0.12 * Math.sin(t * 0.47);
    out[i] = y * amp;
  }
  resonate(out, 340, 1.6, 0.16);
  highpass(out, 90);
  return normalize(seamless(out), 0.5);
};

S.amb_storm = function () {
  var LEN = 16;
  var b = noiseBuf(LEN, 617);
  var out = buf(LEN);
  var y = 0, y2 = 0;
  for (var i = 0; i < b.length; i++) {
    var t = i / RATE;
    var c = 1100 + 700 * Math.sin(t * 0.53) + 400 * Math.sin(t * 0.17 + 2.1);
    var a = 1 - Math.exp(-2 * Math.PI * c / RATE);
    y += a * (b[i] - y);
    // A low rumble under the hiss: this is a mountain moving, not just air.
    var a2 = 1 - Math.exp(-2 * Math.PI * 120 / RATE);
    y2 += a2 * (b[i] - y2);
    var amp = 0.7 + 0.3 * Math.sin(t * 0.29 + 1.1);
    out[i] = (y * 0.6 + y2 * 2.2) * amp;
  }
  resonate(out, 210, 1.4, 0.22);
  highpass(out, 55);
  return normalize(seamless(saturate(out, 1.3)), 0.62);
};

// ---- run ------------------------------------------------------------------

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
console.log('Generating ICEFALL audio into ' + OUT);
var names = Object.keys(S);
for (var i = 0; i < names.length; i++) {
  write(names[i], S[names[i]]());
}
console.log('Done: ' + names.length + ' files.');
