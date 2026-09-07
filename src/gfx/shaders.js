// Every shader in the game.
//
// The look is built from four ideas:
//   1. Everything solid carries a normal map, so lights actually shape it.
//   2. Lights are real: position, radius, colour, height above the wall.
//   3. Mist is lit by those same lights, which is what sells depth.
//   4. The frame is graded, bloomed and grained as one image at the end.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;

  var S = {};

  // Shared GLSL: hash, value noise, fbm, and the ACES curve.
  var LIB = [
    'float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }',
    'float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }',
    'vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  f = f*f*(3.0-2.0*f);',
    '  float a = hash21(i), b = hash21(i+vec2(1,0));',
    '  float c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));',
    '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);',
    '}',
    'float fbm(vec2 p, int oct){',
    '  float s = 0.0, a = 0.5, n = 0.0;',
    '  for(int i=0;i<8;i++){ if(i>=oct) break; s += vnoise(p)*a; n += a; a *= 0.5; p = p*2.02 + 17.3; }',
    '  return s/max(n,1e-4);',
    '}',
    'float ridge(vec2 p, int oct){',
    '  float s = 0.0, a = 0.5, n = 0.0;',
    '  for(int i=0;i<8;i++){ if(i>=oct) break; float v = 1.0-abs(vnoise(p)*2.0-1.0); s += v*v*a; n += a; a *= 0.5; p = p*2.07 + 5.1; }',
    '  return s/max(n,1e-4);',
    '}',
    // Narkowicz's ACES fit. Cheap, and it rolls highlights off instead of
    // clipping them, which is most of why bloom reads as light and not paint.
    'vec3 aces(vec3 x){',
    '  const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;',
    '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);',
    '}',
    'float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }'
  ].join('\n');

  var HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
  var HEADV = '#version 300 es\nprecision highp float;\n';

  // A block of light uniforms, shared by the sprite and mist shaders so the
  // mist is lit by exactly the lamps that light the rock.
  var LIGHTS =
    'const int MAXL = ' + C.MAX_LIGHTS + ';\n' +
    'uniform int u_lightCount;\n' +
    'uniform vec4 u_lightPos[MAXL];\n' +   // xy = screen px, z = height, w = radius
    'uniform vec4 u_lightCol[MAXL];\n';    // rgb = colour*intensity, a = flicker

  // =========================================================================
  // SPRITE  -  everything in the world, lit
  // =========================================================================

  S.spriteVS = HEADV + [
    'layout(location=0) in vec2 a_pos;',
    'layout(location=1) in vec2 a_uv;',
    'layout(location=2) in vec4 a_color;',
    'layout(location=3) in vec4 a_params;',   // x emissive, y lit, z normalStrength, w fog
    'uniform vec2 u_res;',
    'out vec2 v_uv;',
    'out vec4 v_color;',
    'out vec4 v_params;',
    'out vec2 v_pos;',
    'void main(){',
    '  v_uv = a_uv;',
    '  v_color = a_color;',
    '  v_params = a_params;',
    '  v_pos = a_pos;',
    '  vec2 c = a_pos / u_res;',
    '  gl_Position = vec4(c.x*2.0-1.0, 1.0-c.y*2.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  S.spriteFS = HEAD + LIB + '\n' + LIGHTS + [
    'in vec2 v_uv;',
    'in vec4 v_color;',
    'in vec4 v_params;',
    'in vec2 v_pos;',
    'uniform sampler2D u_albedo;',
    'uniform sampler2D u_normal;',
    'uniform vec3 u_ambient;',
    'uniform vec3 u_key;',
    'uniform vec3 u_keyDir;',      // xy direction, z elevation
    'uniform vec3 u_fogColor;',
    'uniform float u_time;',
    'uniform float u_exposure;',
    'out vec4 outColor;',
    'void main(){',
    '  vec4 alb = texture(u_albedo, v_uv);',
    '  if (alb.a < 0.003) discard;',
    // Atlases are uploaded premultiplied; lighting wants straight colour.
    '  vec3 base = alb.rgb / max(alb.a, 1e-4);',
    '  base *= v_color.rgb;',
    '  float alpha = alb.a * v_color.a;',
    '  float emissive = v_params.x;',
    '  float isLit = v_params.y;',
    '  float nStr = v_params.z * 2.0;',
    '  float fogAmt = v_params.w;',
    '',
    '  vec3 lit = base;',
    '  if (isLit > 0.5) {',
    '    vec4 nt = texture(u_normal, v_uv);',
    '    vec3 N = nt.xyz * 2.0 - 1.0;',
    '    N.xy *= nStr;',
    '    N = normalize(N + vec3(0.0, 0.0, 0.001));',
    '    float gloss = nt.w;',
    '',
    '    vec3 acc = u_ambient;',
    // A directional key with a soft wrap term: the unlit side of a rock still
    // picks up sky, which is what keeps night from turning into black cutouts.
    '    vec3 K = normalize(u_keyDir);',
    '    float kd = dot(N, K) * 0.5 + 0.5;',
    '    kd = kd * kd;',
    '    acc += u_key * kd;',
    // Rim: grazing angles catch the sky. Reads as rime on every edge.
    '    float rim = pow(1.0 - abs(N.z), 3.0);',
    '    acc += u_key * rim * 0.35 * gloss;',
    '',
    '    for (int i = 0; i < MAXL; i++) {',
    '      if (i >= u_lightCount) break;',
    '      vec4 lp = u_lightPos[i];',
    '      vec3 d = vec3(lp.xy - v_pos, lp.z);',
    '      float dist = length(d);',
    '      float att = clamp(1.0 - dist / max(lp.w, 1.0), 0.0, 1.0);',
    '      if (att <= 0.0) continue;',
    '      att = att * att * (3.0 - 2.0 * att);',
    '      vec3 L = d / max(dist, 1e-3);',
    '      float nl = max(dot(N, L), 0.0);',
    // Half-lambert keeps the falloff soft so a lantern glows rather than
    // cutting a hard terminator across the wall.
    '      float wrapped = nl * 0.78 + 0.22;',
    '      vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));',
    '      float sp = pow(max(dot(N, H), 0.0), 22.0) * gloss * 1.5;',
    '      acc += u_lightCol[i].rgb * att * (wrapped + sp);',
    '    }',
    '    lit = base * acc;',
    '  }',
    '',
    '  lit += base * emissive * 2.2;',
    '  lit = mix(lit, u_fogColor, fogAmt);',
    '  lit *= u_exposure;',
    '  outColor = vec4(lit * alpha, alpha);',
    '}'
  ].join('\n');

  // =========================================================================
  // SKY  -  procedural, per zone
  // =========================================================================

  S.quadVS = HEADV + [
    'layout(location=0) in vec2 a_pos;',
    'layout(location=1) in vec2 a_uv;',
    'out vec2 v_uv;',
    'void main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  S.skyFS = HEAD + LIB + [
    'in vec2 v_uv;',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform float u_scroll;',       // world y of the camera, for star parallax
    'uniform vec3 u_top;',
    'uniform vec3 u_mid;',
    'uniform vec3 u_bot;',
    'uniform vec3 u_sunCol;',
    'uniform vec3 u_sun;',           // xy screen pos, z radius
    'uniform float u_stars;',
    'uniform float u_aurora;',
    'uniform float u_storm;',
    'uniform float u_cloud;',
    'uniform float u_flash;',
    'out vec4 outColor;',
    '',
    'vec3 auroraBand(vec2 uv, float t, float seedo, vec3 tint){',
    '  float x = uv.x * 2.4 + seedo;',
    '  float wave = sin(x*1.7 + t*0.35) * 0.10',
    '             + sin(x*3.1 - t*0.24) * 0.055',
    '             + sin(x*0.8 + t*0.12) * 0.075;',
    '  float base = 0.30 + wave + seedo*0.06;',
    '  float d = uv.y - base;',
    // Curtains: a vertical falloff modulated by a scrolling ridge so the
    // band breaks into rays instead of reading as a painted stripe.
    '  float curtain = ridge(vec2(x*2.2, uv.y*1.4 - t*0.09), 4);',
    '  float body = exp(-abs(d)*(8.0 + curtain*10.0));',
    '  float rays = pow(clamp(curtain, 0.0, 1.0), 1.8);',
    '  float m = body * (0.45 + rays*0.9);',
    '  m *= smoothstep(0.0, 0.28, uv.y);',
    '  return tint * m;',
    '}',
    '',
    'void main(){',
    '  vec2 uv = v_uv;',
    '  float y = uv.y;',
    '  vec3 col = mix(u_bot, u_mid, smoothstep(0.0, 0.62, y));',
    '  col = mix(col, u_top, smoothstep(0.45, 1.0, y));',
    '',
    // Stars, on a slow vertical parallax so the sky moves as you climb.
    '  if (u_stars > 0.001) {',
    '    vec2 sp = vec2(uv.x*u_res.x, uv.y*u_res.y + u_scroll*0.06);',
    '    vec2 cell = floor(sp / 7.0);',
    '    vec2 f = fract(sp / 7.0);',
    '    vec2 jit = hash22(cell);',
    '    float d = length(f - jit);',
    '    float mag = hash21(cell + 3.7);',
    '    float tw = 0.55 + 0.45*sin(u_time*(1.2 + mag*2.6) + mag*31.0);',
    '    float star = smoothstep(0.30, 0.0, d) * step(0.955 - u_stars*0.03, mag) * tw;',
    '    vec3 sc = mix(vec3(0.75,0.85,1.0), vec3(1.0,0.92,0.80), hash21(cell+11.1));',
    '    col += sc * star * u_stars * (0.55 + mag*0.9) * smoothstep(0.12, 0.6, y);',
    '  }',
    '',
    // The sun or moon: a hard disc, an inner corona and a wide bloom seed.
    '  vec2 px = vec2(uv.x*u_res.x, (1.0-uv.y)*u_res.y);',
    '  float sd = length(px - u_sun.xy);',
    '  if (u_sun.z > 0.5) {',
    '    float disc = smoothstep(u_sun.z, u_sun.z-2.0, sd);',
    '    float corona = pow(clamp(1.0 - sd/(u_sun.z*13.0), 0.0, 1.0), 3.0);',
    '    float halo = pow(clamp(1.0 - sd/(u_sun.z*38.0), 0.0, 1.0), 2.0);',
    '    col += u_sunCol * (disc*2.6 + corona*0.85 + halo*0.30);',
    '  }',
    '',
    '  if (u_aurora > 0.001) {',
    '    vec3 a = auroraBand(uv, u_time, 0.0, vec3(0.22,1.00,0.62));',
    '    a += auroraBand(uv, u_time*0.83, 2.7, vec3(0.30,0.72,1.00)) * 0.75;',
    '    a += auroraBand(uv, u_time*1.21, 5.3, vec3(0.85,0.35,0.95)) * 0.42;',
    '    col += a * u_aurora;',
    '  }',
    '',
    // Cloud deck. Two fbm layers at different speeds so it churns.
    '  if (u_cloud > 0.001) {',
    '    vec2 cp = vec2(uv.x*3.1 + u_time*0.011, uv.y*2.2 - u_scroll*0.00028);',
    '    float c1 = fbm(cp, 5);',
    '    float c2 = fbm(cp*2.3 - vec2(u_time*0.019, 0.0), 4);',
    '    float m = smoothstep(0.44, 0.86, c1*0.68 + c2*0.32);',
    '    m *= smoothstep(0.02, 0.42, y) * smoothstep(1.0, 0.55, y);',
    '    vec3 cc = mix(u_mid*1.25, u_top*1.1, uv.y);',
    '    col = mix(col, cc, m * u_cloud);',
    '  }',
    '',
    // Storm: heavy low cloud that swallows the top of the frame.
    '  if (u_storm > 0.001) {',
    '    vec2 sp2 = vec2(uv.x*2.0 + u_time*0.05, uv.y*1.6 - u_scroll*0.0006 - u_time*0.02);',
    '    float s = fbm(sp2, 5);',
    '    float m = smoothstep(0.36, 0.9, s);',
    '    col = mix(col, u_mid*0.72, m*u_storm);',
    '    col = mix(col, u_bot*0.9, smoothstep(0.55, 1.0, y)*u_storm*0.7);',
    '  }',
    '',
    '  col += vec3(0.62,0.72,1.0) * u_flash;',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // =========================================================================
  // MIST  -  fullscreen fog, lit by the same lights as the rock
  // =========================================================================

  S.mistFS = HEAD + LIB + '\n' + LIGHTS + [
    'in vec2 v_uv;',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform float u_scroll;',
    'uniform float u_density;',
    'uniform float u_wind;',
    'uniform vec3 u_color;',
    'uniform vec3 u_ambient;',
    'uniform float u_bandY;',       // screen y where the fog bank sits
    'uniform float u_bandH;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 px = vec2(v_uv.x*u_res.x, (1.0-v_uv.y)*u_res.y);',
    '  float wy = px.y + u_scroll;',
    '  vec2 p1 = vec2(px.x*0.0075 + u_time*u_wind*0.0016, wy*0.0075);',
    '  vec2 p2 = vec2(px.x*0.017  - u_time*u_wind*0.0031, wy*0.014 + u_time*0.012);',
    '  float n = fbm(p1, 4)*0.62 + fbm(p2, 3)*0.38;',
    '  n = smoothstep(0.30, 0.86, n);',
    // A vertical band so mist pools in layers rather than filling the frame.
    '  float band = exp(-pow((px.y - u_bandY)/max(u_bandH,1.0), 2.0));',
    '  float d = n * u_density * (0.35 + band*0.9);',
    '  if (d <= 0.002) discard;',
    '',
    // Scattering: mist near a lamp takes the lamp's colour. This is the
    // single cheapest trick that makes a 2D scene look like it has air in it.
    '  vec3 scat = u_ambient * 0.55;',
    '  for (int i = 0; i < MAXL; i++) {',
    '    if (i >= u_lightCount) break;',
    '    vec4 lp = u_lightPos[i];',
    '    float dist = length(lp.xy - px);',
    '    float att = clamp(1.0 - dist/max(lp.w*1.35, 1.0), 0.0, 1.0);',
    '    scat += u_lightCol[i].rgb * att * att * 0.85;',
    '  }',
    '  vec3 col = u_color * (0.45 + scat);',
    '  d = clamp(d, 0.0, 1.0);',
    '  outColor = vec4(col * d, d);',
    '}'
  ].join('\n');

  // =========================================================================
  // BLOOM  -  dual filtering (Kawase). Four down, four up, tent weighted.
  // =========================================================================

  S.brightFS = HEAD + LIB + [
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform float u_threshold;',
    'uniform float u_knee;',
    'out vec4 outColor;',
    'void main(){',
    '  vec3 c = texture(u_tex, v_uv).rgb;',
    '  float l = luma(c);',
    // Soft knee: light just under the threshold still contributes a little,
    // so bloom fades in instead of snapping on as something gets brighter.
    '  float soft = clamp(l - u_threshold + u_knee, 0.0, 2.0*u_knee);',
    '  soft = soft*soft / (4.0*u_knee + 1e-4);',
    '  float w = max(soft, l - u_threshold) / max(l, 1e-4);',
    '  outColor = vec4(c * clamp(w, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  S.downFS = HEAD + [
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_texel;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 o = u_texel;',
    '  vec3 s = texture(u_tex, v_uv).rgb * 4.0;',
    '  s += texture(u_tex, v_uv - o).rgb;',
    '  s += texture(u_tex, v_uv + o).rgb;',
    '  s += texture(u_tex, v_uv + vec2(o.x, -o.y)).rgb;',
    '  s += texture(u_tex, v_uv - vec2(o.x, -o.y)).rgb;',
    '  outColor = vec4(s / 8.0, 1.0);',
    '}'
  ].join('\n');

  S.upFS = HEAD + [
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_texel;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 o = u_texel;',
    '  vec3 s = texture(u_tex, v_uv + vec2(-o.x*2.0, 0.0)).rgb;',
    '  s += texture(u_tex, v_uv + vec2(-o.x, o.y)).rgb * 2.0;',
    '  s += texture(u_tex, v_uv + vec2(0.0, o.y*2.0)).rgb;',
    '  s += texture(u_tex, v_uv + vec2(o.x, o.y)).rgb * 2.0;',
    '  s += texture(u_tex, v_uv + vec2(o.x*2.0, 0.0)).rgb;',
    '  s += texture(u_tex, v_uv + vec2(o.x, -o.y)).rgb * 2.0;',
    '  s += texture(u_tex, v_uv + vec2(0.0, -o.y*2.0)).rgb;',
    '  s += texture(u_tex, v_uv + vec2(-o.x, -o.y)).rgb * 2.0;',
    '  outColor = vec4(s / 12.0, 1.0);',
    '}'
  ].join('\n');

  // =========================================================================
  // GOD RAYS  -  radial blur of the bright pass, from the sun
  // =========================================================================

  S.rayFS = HEAD + [
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_origin;',      // uv space
    'uniform float u_density;',
    'uniform float u_decay;',
    'uniform float u_weight;',
    'out vec4 outColor;',
    'void main(){',
    '  const int STEPS = 24;',
    '  vec2 uv = v_uv;',
    '  vec2 delta = (uv - u_origin) * (u_density / float(STEPS));',
    '  float illum = 1.0;',
    '  vec3 acc = vec3(0.0);',
    '  for (int i = 0; i < STEPS; i++) {',
    '    uv -= delta;',
    '    acc += texture(u_tex, uv).rgb * illum * u_weight;',
    '    illum *= u_decay;',
    '  }',
    '  outColor = vec4(acc / float(STEPS), 1.0);',
    '}'
  ].join('\n');

  // =========================================================================
  // COMPOSITE  -  the whole frame, graded and presented
  // =========================================================================

  S.postFS = HEAD + LIB + [
    'in vec2 v_uv;',
    'uniform sampler2D u_scene;',
    'uniform sampler2D u_bloom;',
    'uniform sampler2D u_rays;',
    'uniform sampler2D u_warp;',      // rg = screen-space uv offset, b = blur hint
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform float u_bloomI;',
    'uniform float u_raysI;',
    'uniform vec3 u_rayCol;',
    'uniform vec3 u_lift;',
    'uniform vec3 u_gain;',
    'uniform float u_sat;',
    'uniform float u_contrast;',
    'uniform float u_exposure;',
    'uniform float u_vignette;',
    'uniform float u_grain;',
    'uniform float u_aberration;',
    'uniform float u_flash;',
    'uniform vec3 u_flashCol;',
    'uniform float u_fade;',
    'uniform float u_warpAmt;',
    'uniform float u_desat;',         // rises as you are hurt
    'uniform float u_zoom;',          // impact punch-in
    'uniform float u_rot;',           // shake roll
    'out vec4 outColor;',
    '',
    'vec3 sampleScene(vec2 uv, float ab){',
    // Radial chromatic aberration: channels separate slightly toward the
    // corners, which is what makes a flat pixel frame feel like it came
    // through a lens.
    '  vec2 c = uv - 0.5;',
    '  float r2 = dot(c,c);',
    '  vec2 off = c * r2 * ab * 0.018;',
    '  float rr = texture(u_scene, uv - off).r;',
    '  vec2 g  = texture(u_scene, uv).gb;',
    '  float bb = texture(u_scene, uv + off).b;',
    '  return vec3(rr, g.x, bb);',
    '}',
    '',
    'void main(){',
    // Shake roll and impact punch-in happen here rather than in the world
    // transform, so terrain never has to be re-rasterised for a camera kick.
    '  vec2 uv = v_uv - 0.5;',
    '  float cr = cos(u_rot), sr = sin(u_rot);',
    '  uv = vec2(uv.x*cr - uv.y*sr, uv.x*sr + uv.y*cr) / max(u_zoom, 0.001);',
    '  uv += 0.5;',
    '  vec3 warp = texture(u_warp, uv).rgb;',
    '  vec2 wo = (warp.rg * 2.0 - 1.0) * u_warpAmt;',
    '  uv += wo;',
    '  uv = clamp(uv, vec2(0.0005), vec2(0.9995));',
    '',
    '  vec3 col = sampleScene(uv, u_aberration);',
    '  vec3 bloom = texture(u_bloom, uv).rgb;',
    '  col += bloom * u_bloomI;',
    '  vec3 rays = texture(u_rays, uv).rgb;',
    '  col += rays * u_rayCol * u_raysI;',
    '',
    '  col *= u_exposure;',
    '  col = aces(col);',
    '',
    // Grade: lift the shadows toward a hue, scale the highlights toward
    // another, then contrast and saturate around mid grey.
    '  col = col + u_lift * (1.0 - col);',
    '  col *= u_gain;',
    '  col = (col - 0.5) * u_contrast + 0.5;',
    '  float l = luma(col);',
    '  col = mix(vec3(l), col, u_sat);',
    '  col = mix(vec3(l), col, 1.0 - u_desat);',
    '',
    '  col += u_flashCol * u_flash;',
    '',
    '  vec2 vc = (v_uv - 0.5) * vec2(u_res.x/u_res.y, 1.0);',
    '  float vig = 1.0 - smoothstep(0.34, 0.92, length(vc)) * u_vignette;',
    '  col *= vig;',
    '',
    // Grain, animated. A little goes a long way; too much and pixel art
    // starts to crawl.
    '  float g = hash21(gl_FragCoord.xy + fract(u_time)*vec2(311.7, 191.3));',
    '  col += (g - 0.5) * u_grain * (1.0 - luma(col)*0.55);',
    '',
    // Ordered dither before the 8-bit write. Kills the banding that a big
    // smooth sky gradient otherwise shows on every monitor.
    '  float dth = hash21(gl_FragCoord.xy*1.37) - 0.5;',
    '  col += dth / 255.0;',
    '',
    '  col *= u_fade;',
    '  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  // =========================================================================
  // BLIT  -  plain copy, with an optional tint
  // =========================================================================

  S.blitFS = HEAD + [
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec4 u_tint;',
    'out vec4 outColor;',
    'void main(){ outColor = texture(u_tex, v_uv) * u_tint; }'
  ].join('\n');

  // Nearest-neighbour present with a hair of sub-pixel smoothing at the
  // edges, so a non-integer window scale does not shimmer.
  S.presentFS = HEAD + [
    'in vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_src;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 p = v_uv * u_src;',
    '  vec2 i = floor(p) + 0.5;',
    '  vec2 f = p - i;',
    '  vec2 w = fwidth(p);',
    '  vec2 s = clamp(f / max(w, vec2(1e-4)), -0.5, 0.5);',
    '  outColor = vec4(texture(u_tex, (i + s) / u_src).rgb, 1.0);',
    '}'
  ].join('\n');

  IF.Shaders = S;
})();
