// Generates every sound effect for Summit in the Fog as plain PCM WAV files.
//
//   node tools/gen_sfx.js
//
// This is an offline authoring tool run with Node. The game itself only ever
// plays the resulting files through HTMLAudioElement; it contains no Web Audio
// API code. All sounds are designed to be soft, short and unobtrusive so they
// stay pleasant across hundreds of hops.

var fs = require('fs');
var path = require('path');

var RATE = 22050;
var OUT = path.join(__dirname, '..', 'assets', 'audio');

// ---- tiny DSP toolkit -----------------------------------------------------

function buf(sec) { return new Float32Array(Math.floor(RATE * sec)); }

// Deterministic noise so the files are reproducible.
var seed = 1234567;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 * 2 - 1;
}

// Envelope: attack, hold, release, all in seconds. Returns gain at t.
function env(t, a, h, r) {
  if (t < a) return t / a;
  if (t < a + h) return 1;
  var x = (t - a - h) / r;
  return x >= 1 ? 0 : (1 - x) * (1 - x);
}

function sine(f, t) { return Math.sin(2 * Math.PI * f * t); }

// Warm tone: fundamental with quiet harmonics, soft like a struck bell.
function warm(f, t) {
  return sine(f, t) + 0.35 * sine(f * 2, t) + 0.12 * sine(f * 3, t) + 0.05 * sine(f * 4.01, t);
}

// One-pole low-pass in place. cutoff in Hz.
function lowpass(x, cutoff) {
  var a = 1 - Math.exp(-2 * Math.PI * cutoff / RATE);
  var y = 0;
  for (var i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; }
  return x;
}

// Simple high-pass: signal minus low-passed copy.
function highpass(x, cutoff) {
  var lp = lowpass(Float32Array.from(x), cutoff);
  for (var i = 0; i < x.length; i++) x[i] -= lp[i];
  return x;
}

function noise(sec) {
  var b = buf(sec);
  for (var i = 0; i < b.length; i++) b[i] = rnd();
  return b;
}

function mixInto(dst, src, at, gain) {
  var off = Math.floor(at * RATE);
  for (var i = 0; i < src.length && off + i < dst.length; i++) dst[off + i] += src[i] * gain;
}

function normalize(x, peak) {
  var m = 0;
  for (var i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m < 1e-6) return x;
  var g = peak / m;
  for (var j = 0; j < x.length; j++) x[j] *= g;
  return x;
}

// Short fade on both ends kills clicks.
function declick(x, ms) {
  var n = Math.floor(RATE * ms / 1000);
  for (var i = 0; i < n && i < x.length; i++) {
    var g = i / n;
    x[i] *= g;
    x[x.length - 1 - i] *= g;
  }
  return x;
}

function writeWav(name, x) {
  var data = Buffer.alloc(x.length * 2);
  for (var i = 0; i < x.length; i++) {
    var v = Math.max(-1, Math.min(1, x[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  var h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  var file = path.join(OUT, name + '.wav');
  fs.writeFileSync(file, Buffer.concat([h, data]));
  console.log('wrote ' + name + '.wav  ' + (x.length / RATE).toFixed(2) + 's');
}

// ---- the sounds -------------------------------------------------------------

// Hop: a soft snow crunch with a tiny upward lilt.
function hop() {
  var out = buf(0.14);
  var n = lowpass(noise(0.08), 2600);
  for (var i = 0; i < n.length; i++) n[i] *= env(i / RATE, 0.003, 0.01, 0.06);
  mixInto(out, n, 0, 0.6);
  for (var j = 0; j < out.length; j++) {
    var t = j / RATE;
    out[j] += 0.25 * sine(420 + 380 * t, t) * env(t, 0.004, 0.02, 0.07);
  }
  return normalize(declick(out, 3), 0.45);
}

// Land: a padded thud, snow over rock.
function land() {
  var out = buf(0.16);
  for (var i = 0; i < out.length; i++) {
    var t = i / RATE;
    out[i] = sine(130 - 40 * t, t) * env(t, 0.002, 0.02, 0.10) * 0.8;
  }
  var n = lowpass(noise(0.06), 1800);
  for (var k = 0; k < n.length; k++) n[k] *= env(k / RATE, 0.002, 0.005, 0.045);
  mixInto(out, n, 0, 0.5);
  return normalize(declick(out, 3), 0.5);
}

// Slip: a falling tone with a scrape of snow, never harsh.
function slip() {
  var out = buf(0.42);
  for (var i = 0; i < out.length; i++) {
    var t = i / RATE;
    var f = 520 * Math.pow(0.28, t / 0.4);
    out[i] = warm(f, t) * env(t, 0.005, 0.05, 0.33) * 0.5;
  }
  var n = lowpass(noise(0.3), 1400);
  for (var k = 0; k < n.length; k++) n[k] *= env(k / RATE, 0.01, 0.05, 0.22);
  mixInto(out, n, 0.02, 0.35);
  return normalize(declick(out, 4), 0.5);
}

// Crumble: a low grumble of shifting rock with a few crackles.
function crumble() {
  var out = buf(0.55);
  var n = lowpass(noise(0.55), 420);
  for (var i = 0; i < n.length; i++) {
    var t = i / RATE;
    n[i] *= env(t, 0.02, 0.25, 0.25) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 23 * t));
  }
  mixInto(out, n, 0, 1);
  for (var c = 0; c < 9; c++) {
    var at = 0.03 + c * 0.05 + rnd() * 0.02;
    var crack = lowpass(noise(0.02), 3000);
    for (var k = 0; k < crack.length; k++) crack[k] *= env(k / RATE, 0.001, 0.002, 0.015);
    mixInto(out, crack, Math.max(0, at), 0.35);
  }
  return normalize(declick(out, 4), 0.45);
}

// Whiteout: the wind swallowing everything, a long soft swell.
function whiteout() {
  var out = buf(1.4);
  var n = highpass(lowpass(noise(1.4), 900), 120);
  for (var i = 0; i < n.length; i++) {
    var t = i / RATE;
    n[i] *= env(t, 0.5, 0.3, 0.6);
  }
  mixInto(out, n, 0, 1);
  for (var j = 0; j < out.length; j++) {
    var t2 = j / RATE;
    out[j] += 0.35 * sine(70 - 20 * t2, t2) * env(t2, 0.4, 0.4, 0.6);
  }
  return normalize(declick(out, 10), 0.5);
}

// Cairn: a gentle two-note bell, warm and low, with a soft attack.
// Deliberately quiet and mellow so it never grates on the twelfth checkpoint.
function cairn() {
  var out = buf(0.9);
  var notes = [[0.00, 392.0], [0.13, 523.25]];
  for (var n = 0; n < notes.length; n++) {
    var at = notes[n][0], f = notes[n][1];
    var tone = buf(0.75);
    for (var i = 0; i < tone.length; i++) {
      var t = i / RATE;
      tone[i] = warm(f, t) * env(t, 0.018, 0.05, 0.62);
    }
    mixInto(out, lowpass(tone, 3200), at, n === 0 ? 0.55 : 0.7);
  }
  return normalize(declick(out, 5), 0.42);
}

// Crystal: a small bright sparkle, two quick high notes.
function crystal() {
  var out = buf(0.35);
  var notes = [[0.0, 1046.5], [0.07, 1568.0]];
  for (var n = 0; n < notes.length; n++) {
    var tone = buf(0.28);
    for (var i = 0; i < tone.length; i++) {
      var t = i / RATE;
      tone[i] = (sine(notes[n][1], t) + 0.2 * sine(notes[n][1] * 2, t)) * env(t, 0.004, 0.02, 0.24);
    }
    mixInto(out, tone, notes[n][0], 0.5);
  }
  return normalize(declick(out, 3), 0.38);
}

// Summit: a rising four-note phrase, the only sound allowed to be big.
function summit() {
  var out = buf(2.2);
  var notes = [[0.00, 392.0], [0.18, 523.25], [0.36, 659.25], [0.60, 783.99]];
  for (var n = 0; n < notes.length; n++) {
    var last = n === notes.length - 1;
    var tone = buf(last ? 1.5 : 0.7);
    for (var i = 0; i < tone.length; i++) {
      var t = i / RATE;
      tone[i] = warm(notes[n][1], t) * env(t, 0.015, last ? 0.3 : 0.08, last ? 1.1 : 0.5);
    }
    mixInto(out, lowpass(tone, 3600), notes[n][0], last ? 0.8 : 0.55);
  }
  // A shimmer of high partials under the final note.
  for (var j = 0; j < out.length; j++) {
    var t2 = j / RATE;
    if (t2 > 0.6) out[j] += 0.08 * sine(1567.98, t2) * env(t2 - 0.6, 0.1, 0.3, 1.0);
  }
  return normalize(declick(out, 6), 0.5);
}

// UI: a barely-there tick.
function ui() {
  var out = buf(0.06);
  for (var i = 0; i < out.length; i++) {
    var t = i / RATE;
    out[i] = sine(1300, t) * env(t, 0.001, 0.008, 0.035);
  }
  return normalize(declick(out, 2), 0.3);
}

// Gust: a breath of wind passing left to right.
function gust() {
  var out = buf(1.1);
  var n = highpass(lowpass(noise(1.1), 1600), 250);
  for (var i = 0; i < n.length; i++) {
    var t = i / RATE;
    n[i] *= env(t, 0.25, 0.25, 0.55);
  }
  mixInto(out, n, 0, 1);
  return normalize(declick(out, 8), 0.45);
}

// Echo step: the ripple that opens the fog on landing. Airy and short.
function echo() {
  var out = buf(0.3);
  var n = highpass(lowpass(noise(0.3), 2400), 500);
  for (var i = 0; i < n.length; i++) {
    var t = i / RATE;
    n[i] *= env(t, 0.01, 0.03, 0.22);
  }
  mixInto(out, n, 0, 1);
  return normalize(declick(out, 3), 0.22);
}

// Wind bed: six seconds of slow, low wind that loops seamlessly.
function windLoop() {
  var sec = 6;
  var base = lowpass(noise(sec + 1), 520);
  var out = buf(sec);
  var xf = Math.floor(RATE * 1.0);
  for (var i = 0; i < out.length; i++) {
    var t = i / RATE;
    var lfo = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.17 * t) * Math.sin(2 * Math.PI * 0.05 * t + 1);
    var v = base[i] * lfo;
    // Crossfade the tail into the head so the loop point is inaudible.
    if (i < xf) {
      var w = i / xf;
      var tail = base[out.length + i] * lfo;
      v = v * w + tail * (1 - w);
    }
    out[i] = v;
  }
  return normalize(out, 0.35);
}

// ---- run ----------------------------------------------------------------------

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
writeWav('sfx_hop', hop());
writeWav('sfx_land', land());
writeWav('sfx_slip', slip());
writeWav('sfx_crumble', crumble());
writeWav('sfx_whiteout', whiteout());
writeWav('sfx_cairn', cairn());
writeWav('sfx_crystal', crystal());
writeWav('sfx_summit', summit());
writeWav('sfx_ui', ui());
writeWav('sfx_gust', gust());
writeWav('sfx_echo', echo());
writeWav('amb_wind', windLoop());
console.log('done');
