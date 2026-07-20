/*!
 * cueVJ: an experimental web-native live-visuals framework.
 * https://github.com/ironsingh/cueVJ
 *
 * Copyright (c) 2026 Ronny Singh. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. See LICENSE.
 * Noncommercial use only; commercial use requires a separate license.
 *
 * No build step, no dependencies. Browser global: window.cueVJ
 */

/* ===================== cueVJ.skin: surface engine (UI chrome) ===================== */
/* ============================================================================
   cueVJ.skin: surface engine (UI chrome)
   ----------------------------------------------------------------------------
   Same architecture as the framework's attach() core: the visual SURFACE of a
   real DOM element is painted into its background-image as a data-URI <svg>,
   regenerated to fit on resize via ResizeObserver. The element keeps its real
   content, text, focus and interactivity. SVG only owns the chrome.

   This build extends the core's painters (panel/button/badge) with a richer
   set: corner registration ticks, hairline insets, scanlines, etched rules,
   perforations, recessed fields. It also adds per-element interaction state,
   declarative [data-skin] binding, and a global on/off switch.

   API:  cueVJ.skin.attach(el, surface, opts) -> { update, setState, detach }
         cueVJ.skin.auto(root)   bind every [data-skin] under root
         cueVJ.skin.setEnabled(b) paint all surfaces, or strip them to plain DOM
         cueVJ.skin.tokens      default style tokens (override before auto())
   ========================================================================== */
(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var registry = [];           // { el, surface, opts, render, state }
  var enabled = true;

  var tokens = {
    stroke: 1.5, radius: 12, corner: "notch",
    fill: "transparent", line: "rgba(255,255,255,.10)",
    accent: "#ff6a17", accentDeep: "#c64600", ink: "#cfcbe6"
  };

  /* ---------- geometry (ported from the attach core) ---------- */
  function snap(p, s) { return (s % 2) ? Math.round(p - 0.5) + 0.5 : Math.round(p); }
  function rr(w, h, s, rad, corner) {
    var x0 = snap(s / 2, s), y0 = snap(s / 2, s), x1 = snap(w - s / 2, s), y1 = snap(h - s / 2, s);
    var r = Math.max(0, Math.min(rad, Math.min(x1 - x0, y1 - y0) / 2));
    if (corner === "square" || r <= 0) return "M" + x0 + " " + y0 + "L" + x1 + " " + y0 + "L" + x1 + " " + y1 + "L" + x0 + " " + y1 + "Z";
    if (corner === "cut") { var c = r;
      return "M" + (x0 + c) + " " + y0 + "L" + (x1 - c) + " " + y0 + "L" + x1 + " " + (y0 + c) + "L" + x1 + " " + (y1 - c) +
             "L" + (x1 - c) + " " + y1 + "L" + (x0 + c) + " " + y1 + "L" + x0 + " " + (y1 - c) + "L" + x0 + " " + (y0 + c) + "Z"; }
    var notch = (corner === "notch");
    var d = "M" + (x0 + r) + " " + y0 + "L" + (x1 - r) + " " + y0;
    d += notch ? ("L" + x1 + " " + (y0 + r)) : ("Q" + x1 + " " + y0 + " " + x1 + " " + (y0 + r));
    d += "L" + x1 + " " + (y1 - r) + "Q" + x1 + " " + y1 + " " + (x1 - r) + " " + y1;
    d += "L" + (x0 + r) + " " + y1 + "Q" + x0 + " " + y1 + " " + x0 + " " + (y1 - r);
    d += "L" + x0 + " " + (y0 + r) + "Q" + x0 + " " + y0 + " " + (x0 + r) + " " + y0 + "Z";
    return d;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ---------- tiny svg-string builder ---------- */
  function G() {
    var p = [];
    return {
      path: function (d, st) { p.push(el("path", { d: d, fill: st.fill || "none", stroke: st.stroke || "none", "stroke-width": st.width || 0, "stroke-linejoin": "round", "stroke-linecap": st.cap || "butt", opacity: st.opacity == null ? 1 : st.opacity })); },
      line: function (x1, y1, x2, y2, st) { p.push(el("line", { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2), stroke: st.stroke, "stroke-width": st.width || 1, opacity: st.opacity == null ? 1 : st.opacity, "stroke-linecap": st.cap || "butt" })); },
      rect: function (x, y, w, h, st) { p.push(el("rect", { x: f(x), y: f(y), width: f(w), height: f(h), rx: st.rx || 0, fill: st.fill || "none", stroke: st.stroke || "none", "stroke-width": st.width || 0, opacity: st.opacity == null ? 1 : st.opacity })); },
      circle: function (cx, cy, r, st) { p.push(el("circle", { cx: f(cx), cy: f(cy), r: f(r), fill: st.fill || "none", stroke: st.stroke || "none", "stroke-width": st.width || 0, opacity: st.opacity == null ? 1 : st.opacity })); },
      text: function (x, y, str, st) { p.push(el("text", { x: f(x), y: f(y), "font-family": st.font || "ui-monospace, monospace", "font-size": st.size || 9, "font-weight": st.weight || 600, "letter-spacing": st.ls || 1.5, fill: st.fill || tokens.ink, "text-anchor": st.anchor || "start", opacity: st.opacity == null ? 1 : st.opacity }, esc(str))); },
      out: function () { return p.join(""); }
    };
    function el(tag, a, inner) { var s = "<" + tag; for (var k in a) s += " " + k + "='" + a[k] + "'"; return inner != null ? (s + ">" + inner + "</" + tag + ">") : (s + "/>"); }
    function f(n) { n = +n; return (Math.abs(n) < 1e-3 ? 0 : Math.round(n * 100) / 100); }
  }

  /* ---------- corner registration ticks ---------- */
  function ticks(g, w, h, len, color, m, sw) {
    function tk(x, y, dx, dy) { g.path("M" + (x + dx * len) + " " + y + "L" + x + " " + y + "L" + x + " " + (y + dy * len), { stroke: color, width: sw || 1.4, cap: "round" }); }
    tk(m, m, 1, 1); tk(w - m, m, -1, 1); tk(m, h - m, 1, -1); tk(w - m, h - m, -1, -1);
  }

  /* ============================ PAINTERS ============================ */
  var P = {};
  P.panel = function (w, h, o) {
    var g = G(), sw = o.stroke, r = o.radius, c = o.corner;
    g.path(rr(w, h, sw, r, c), { fill: o.fill, stroke: o.line, width: sw });
    if (o.scan) { var gap = o.scanGap || 4, sc = o.scanColor || "rgba(255,255,255,.03)";
      for (var y = (o.scanTop || r + 6); y < h - r; y += gap) g.line(sw + 3, y, w - sw - 3, y, { stroke: sc, width: 1 }); }
    if (o.accentBar) g.rect(snap(sw / 2, sw) + 0.5, r, 3, h - 2 * r, { fill: o.accent });
    if (o.inset) { var ip = o.insetPad == null ? 5 : o.insetPad;
      g.path(shift(rr(w - ip * 2, h - ip * 2, 1, Math.max(0, r - ip), c), ip, ip), { fill: "none", stroke: o.insetColor || "rgba(255,255,255,.07)", width: 1 }); }
    if (o.ticks) ticks(g, w, h, o.tickLen || 9, o.tickColor || o.accent || o.line, o.tickInset == null ? 9 : o.tickInset, o.tickWidth || 1.4);
    if (o.screws) { var si = o.screwInset == null ? 13 : o.screwInset, scl = o.screwColor || "rgba(255,255,255,.18)";
      [[si, si], [w - si, si], [si, h - si], [w - si, h - si]].forEach(function (q) { g.circle(q[0], q[1], 2.4, { fill: "none", stroke: scl, width: 1 }); g.line(q[0] - 2, q[1], q[0] + 2, q[1], { stroke: scl, width: 1 }); }); }
    if (o.perf) { var py = r + 6, pc = o.perfColor || "rgba(255,255,255,.16)"; while (py < h - r) { g.circle(w - 7, py, 1.5, { fill: pc }); py += 9; } }
    if (o.label) g.text(o.labelX || 14, o.labelY || 16, o.label, { fill: o.labelColor || o.accent || o.line, size: o.labelSize || 9, ls: 2 });
    if (o.cornerCode) g.text(w - 12, h - 10, o.cornerCode, { fill: o.codeColor || "rgba(255,255,255,.3)", size: 8, anchor: "end", ls: 1.5 });
    return g.out();
  };
  P.button = function (w, h, o, s) {
    var g = G(), sw = o.stroke || 1.5, r = o.radius == null ? 9 : o.radius, c = o.corner || "cut";
    var variant = o.variant || "ghost", fill, stroke;
    if (variant === "solid") { fill = s.active ? (o.accentDeep || tokens.accentDeep) : (o.accent || tokens.accent); stroke = "none"; }
    else { fill = (s.hover || s.active) ? (o.fillSoft || "rgba(255,106,23,.12)") : (o.fill || "transparent");
           stroke = (s.hover || s.active || s.focus) ? (o.accent || tokens.accent) : (o.line || tokens.line); }
    g.path(rr(w, h, sw, r, c), { fill: fill, stroke: stroke, width: sw });
    if (variant !== "solid" && o.topHighlight !== false) g.line(r + 2, snap(sw, sw) + 0.5, w - r - 2, snap(sw, sw) + 0.5, { stroke: "rgba(255,255,255,.12)", width: 1 });
    if (o.accentSide) g.rect(snap(sw / 2, sw) + 0.5, 4, 3, h - 8, { fill: o.accent || tokens.accent });
    if (s.active && variant !== "solid") g.path(rr(w, h, sw, r, c), { fill: "rgba(0,0,0,.16)" });
    return g.out();
  };
  P.input = function (w, h, o, s) {
    var g = G(), sw = s.focus ? 1.8 : 1.3, r = o.radius == null ? 7 : o.radius, c = o.corner || "cut";
    var stroke = s.focus ? (o.accent || tokens.accent) : (o.line || "rgba(255,255,255,.14)");
    g.path(rr(w, h, sw, r, c), { fill: o.fill || "rgba(0,0,0,.22)", stroke: stroke, width: sw });
    g.line(r, 2, w - r, 2, { stroke: "rgba(0,0,0,.45)", width: 2 });            // recessed top shadow
    if (s.focus) g.path(rr(w, h, 1, r, c), { fill: "none", stroke: o.accent || tokens.accent, width: 1, opacity: 0.3 });
    return g.out();
  };
  P.chip = function (w, h, o) {
    var g = G();
    g.path(rr(w, h, 1.3, h, "round"), { fill: o.fill || "transparent", stroke: o.accent || tokens.accent, width: 1.3 });
    if (o.dot !== false) g.circle(h * 0.52, h * 0.5, Math.min(h * 0.16, 3.6), { fill: o.accent || tokens.accent });
    return g.out();
  };
  P.tab = function (w, h, o, s) {
    var g = G(), r = o.radius == null ? 8 : o.radius;
    var on = o.active || s.active;
    g.path("M" + 1 + " " + (h - 1) + "L" + 1 + " " + (r + 1) + "Q" + 1 + " " + 1 + " " + (r + 1) + " " + 1 + "L" + (w - r - 1) + " " + 1 + "Q" + (w - 1) + " " + 1 + " " + (w - 1) + " " + (r + 1) + "L" + (w - 1) + " " + (h - 1),
      { fill: on ? (o.fillSoft || "rgba(255,106,23,.12)") : "transparent", stroke: on ? (o.accent || tokens.accent) : (s.hover ? (o.accent || tokens.accent) : "rgba(255,255,255,.08)"), width: 1.4 });
    if (on) g.line(r, h - 1.5, w - r, h - 1.5, { stroke: o.accent || tokens.accent, width: 2.5, cap: "round" });
    return g.out();
  };
  P.meter = function (w, h, o) {
    var g = G(), v = Math.max(0, Math.min(1, o.value == null ? 0.5 : o.value));
    g.path(rr(w, h, 1.3, h / 2, "round"), { fill: o.fill || "rgba(0,0,0,.3)", stroke: o.line || "rgba(255,255,255,.12)", width: 1.3 });
    if (v > 0) g.rect(2.5, 2.5, (w - 5) * v, h - 5, { fill: o.accent || tokens.accent, rx: (h - 5) / 2 });
    return g.out();
  };
  P.badge = P.chip;

  function shift(d, dx, dy) { return "<g transform='translate(" + dx + "," + dy + ")'>" + "<path d='" + d + "' fill='none' stroke='inherit'/>" + "</g>"; }
  // (shift above is unused for inset path now; inset drawn directly). Keep simple:
  shift = function (d, dx, dy) { return d.replace(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, function (_, c, x, y) { return c + (parseFloat(x) + dx) + " " + (parseFloat(y) + dy); }).replace(/Q\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, function (_, a, b, x, y) { return "Q" + (parseFloat(a) + dx) + " " + (parseFloat(b) + dy) + " " + (parseFloat(x) + dx) + " " + (parseFloat(y) + dy); }); };

  /* ---------- data-URI surface ---------- */
  function dataURI(surface, w, h, o, state) {
    var inner = (P[surface] || P.panel)(w, h, o, state || {});
    var svg = "<svg xmlns='" + NS + "' width='" + w + "' height='" + h + "' viewBox='0 0 " + w + " " + h + "' preserveAspectRatio='none'>" + inner + "</svg>";
    return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
  }

  /* ---------- attach ---------- */
  function attach(elm, surface, opts) {
    if (!elm) return { update: function () {}, setState: function () {}, detach: function () {} };
    var o = merge(tokens, opts || {});
    var state = { hover: false, active: false, focus: false };
    var rec = { el: elm, surface: surface, opts: o, state: state, render: render, obs: null };
    function render() {
      if (!enabled) { elm.style.backgroundImage = "none"; return; }
      var w = Math.max(1, elm.clientWidth || elm.offsetWidth || 0), h = Math.max(1, elm.clientHeight || elm.offsetHeight || 0);
      if (w <= 1 || h <= 1) return;
      elm.style.backgroundImage = dataURI(rec.surface, w, h, rec.opts, rec.state);
      elm.style.backgroundRepeat = "no-repeat";
      elm.style.backgroundSize = "100% 100%";
    }
    elm.classList.add("skin-host");
    // interaction state (matches what the React/Vue adapters pass through)
    var interactive = surface === "button" || surface === "tab" || surface === "input" || elm.hasAttribute("data-skin-interactive");
    if (interactive) {
      elm.addEventListener("pointerenter", function () { state.hover = true; render(); });
      elm.addEventListener("pointerleave", function () { state.hover = false; state.active = false; render(); });
      elm.addEventListener("pointerdown", function () { state.active = true; render(); });
      window.addEventListener("pointerup", function () { if (state.active) { state.active = false; render(); } });
      elm.addEventListener("focus", function () { state.focus = true; render(); });
      elm.addEventListener("blur", function () { state.focus = false; render(); });
    }
    render();
    if (typeof ResizeObserver !== "undefined") { rec.obs = new ResizeObserver(render); rec.obs.observe(elm); }
    registry.push(rec);
    return {
      el: elm,
      update: function (next) { rec.opts = merge(tokens, next || {}); render(); },
      patch: function (partial) { for (var k in partial) rec.opts[k] = partial[k]; render(); },
      setState: function (s) { if (s) { for (var k in s) state[k] = s[k]; } render(); },
      detach: function () { if (rec.obs) rec.obs.disconnect(); elm.style.backgroundImage = ""; elm.classList.remove("skin-host"); var i = registry.indexOf(rec); if (i >= 0) registry.splice(i, 1); }
    };
  }

  /* ---------- declarative binding ---------- */
  function auto(rootEl) {
    rootEl = rootEl || document;
    var nodes = rootEl.querySelectorAll("[data-skin]");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n._skinned) continue;
      var surface = n.getAttribute("data-skin") || "panel";
      var opts = {};
      var raw = n.getAttribute("data-skin-opts");
      if (raw) { try { opts = JSON.parse(raw); } catch (e) { opts = {}; } }
      n._skinned = attach(n, surface, opts);
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    document.body && document.body.classList.toggle("skin-off", !enabled);
    for (var i = 0; i < registry.length; i++) registry[i].render();
  }
  function refresh() { for (var i = 0; i < registry.length; i++) registry[i].render(); }
  function merge(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var j in b) o[j] = b[j]; return o; }

  root.__cueVJskin = {
    attach: attach, auto: auto, setEnabled: setEnabled, refresh: refresh,
    tokens: tokens, painters: P, dataURI: dataURI,
    get enabled() { return enabled; }
  };
})(typeof window !== "undefined" ? window : this);

/* ===================== cueVJ: live visuals engine ================================= */
/* =====================================================================
   cueVJ: engine
   ---------------------------------------------------------------------
   Live generative SVG visuals for music. cueVJ paints the WHOLE viewport:
   morphing, line-structured motion graphics that emerge and sequence
   themselves into a story, driven by a single normalized "signal bus".

   The signal bus is fed by pluggable SOURCES, any mix of:
     • demo()      a self-driving 4-on-the-floor clock (works with no input)
     • audioMic()  live microphone  -> Web Audio AnalyserNode
     • audioEl(el) an <audio>/<video> element you control
     • audioFile() a dropped/selected audio file
     • midi()      Web MIDI: notes, CC, transport clock
     • scroll()    page scroll progress + velocity
     • pointer()   cursor / touch

   SCENES are small generators that draw line art into an SVG <g> layer
   and react to the signal every frame. A DIRECTOR cross-fades scenes
   along a timeline that can advance by time, by scroll, or by beat.

   cueVJ.skin is the surface engine bundled in this file: it paints UI
   chrome (panels, buttons) into an element's background as an SVG,
   leaving the real DOM to own layout, text, focus and interactivity.

   No build step, no dependencies. Browser global: window.cueVJ
   ---------------------------------------------------------------------
   Quick start:

     const app = cueVJ.create({
       mount: '#stage',
       background: '#06070a',
       palette: ['#f3a93c','#5fe3d4','#ff4f8b','#9b7bff'],
       scenes: [ cueVJ.scenes.emerge(), cueVJ.scenes.flow(),
                 cueVJ.scenes.lissa(),  cueVJ.scenes.bars() ],
       story: ['emerge','flow','lissa','bars'],
       storyMode: 'time'       // 'time' | 'scroll' | 'beat'
     });

     app.use(cueVJ.sources.scroll());
     app.use(cueVJ.sources.demo());        // self-drives until real audio
     app.start();
   ===================================================================== */
(function (global) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var TAU = Math.PI * 2;

  /* ---------- tiny math ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(c, t) { return t * t * (3 - 2 * t) * c; } // unused helper kept for authors
  function mix(a, b, t) { return a + (b - a) * t; }
  function now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

  /* seeded rng (mulberry32) */
  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 2D gradient (Perlin-ish) noise -> roughly [-1,1] */
  function makeNoise(seed) {
    var r = rng(seed || 1234), perm = new Uint8Array(512), src = new Uint8Array(256), i;
    for (i = 0; i < 256; i++) src[i] = i;
    for (i = 255; i > 0; i--) { var j = (r() * (i + 1)) | 0, t = src[i]; src[i] = src[j]; src[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = src[i & 255];
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function grad(h, x, y) { switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; } }
    return function (x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      var u = fade(x), v = fade(y);
      var aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
      var x1 = lerp(grad(aa, x, y), grad(ba, x - 1, y), u);
      var x2 = lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u);
      return lerp(x1, x2, v);
    };
  }

  /* ---------- svg helpers ---------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag), k;
    if (attrs) for (k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function setA(node, attrs) { for (var k in attrs) node.setAttribute(k, attrs[k]); }
  function hsl(h, s, l, a) { h = ((h % 360) + 360) % 360; return a == null ? "hsl(" + h + "," + s + "%," + l + "%)" : "hsla(" + h + "," + s + "%," + l + "%," + a + ")"; }

  /* =====================================================================
     SIGNAL BUS
     A single object updated each frame and handed to every scene.
     All band/energy values are normalized 0..1.
     ===================================================================== */
  function makeSignal(bandCount, waveLen) {
    var midi = { cc: new Array(128), note: new Array(128), clock: 0, bpm: 0, started: false };
    var i;
    for (i = 0; i < 128; i++) { midi.cc[i] = 0; midi.note[i] = 0; }
    return {
      t: 0, dt: 0, frame: 0,
      energy: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0,
      bands: new Float32Array(bandCount),
      wave: new Float32Array(waveLen),
      bpm: 0, beat: 0,             // beat: 0..1 phase
      onset: 0,                    // decaying transient envelope
      onsetPulse: false,           // true for the single frame of a detected hit
      scroll: 0, scrollV: 0,
      pointer: { x: 0.5, y: 0.5, down: false, vx: 0, vy: 0 },
      midi: midi,
      intensity: 1                 // global author/MIDI-driven multiplier (CC1 by default)
    };
  }

  /* =====================================================================
     AUDIO band/onset extraction (shared by all audio sources)
     ===================================================================== */
  function extractAudio(state, signal) {
    var an = state.an; if (!an) return;
    an.getByteFrequencyData(state.freq);
    an.getByteTimeDomainData(state.time);

    /* time-domain -> energy + waveform */
    var i, n = state.time.length, sum = 0, wl = signal.wave.length, stride = Math.max(1, (n / wl) | 0);
    for (i = 0; i < n; i++) { var v = (state.time[i] - 128) / 128; sum += v * v; }
    for (i = 0; i < wl; i++) signal.wave[i] = (state.time[i * stride] - 128) / 128;
    var energy = Math.sqrt(sum / n);
    signal.energy = lerp(signal.energy, clamp(energy * 2.2, 0, 1), 0.35);

    /* frequency -> log-spaced bands w/ per-band AGC */
    var bins = state.freq.length, N = signal.bands.length;
    var minHz = 30, maxHz = (state.sampleRate || 44100) / 2;
    var logMin = Math.log(minHz), logMax = Math.log(maxHz);
    var b, flux = 0;
    for (b = 0; b < N; b++) {
      var f0 = Math.exp(logMin + (logMax - logMin) * (b / N));
      var f1 = Math.exp(logMin + (logMax - logMin) * ((b + 1) / N));
      var i0 = clamp((f0 / maxHz * bins) | 0, 0, bins - 1);
      var i1 = clamp(Math.max(i0 + 1, (f1 / maxHz * bins) | 0), 0, bins);
      var acc = 0, c = 0;
      for (i = i0; i < i1; i++) { acc += state.freq[i]; c++; flux += Math.max(0, state.freq[i] - state.prev[i]); state.prev[i] = state.freq[i]; }
      var raw = c ? acc / c / 255 : 0;
      state.bandMax[b] = Math.max(raw, state.bandMax[b] * 0.992 + 0.0001);
      var val = clamp(raw / (state.bandMax[b] || 1), 0, 1);
      signal.bands[b] = lerp(signal.bands[b], val, 0.4);
    }

    /* coarse band groups */
    var grp = function (a, z) { var s = 0, k = 0; for (var x = a; x < z; x++) { s += signal.bands[x]; k++; } return k ? s / k : 0; };
    signal.bass = grp(0, (N * 0.10) | 0 || 1);
    signal.lowMid = grp((N * 0.10) | 0, (N * 0.25) | 0);
    signal.mid = grp((N * 0.25) | 0, (N * 0.50) | 0);
    signal.highMid = grp((N * 0.50) | 0, (N * 0.72) | 0);
    signal.treble = grp((N * 0.72) | 0, N);

    /* spectral-flux onset + naive beat phase */
    flux = flux / (bins * 255);
    state.fluxAvg = state.fluxAvg * 0.94 + flux * 0.06;
    var thresh = state.fluxAvg * 1.5 + 0.0008;
    signal.onset = Math.max(signal.onset * 0.86, clamp(flux * 8, 0, 1));
    signal.onsetPulse = false;
    if (flux > thresh && state.refractory <= 0) {
      signal.onsetPulse = true; state.refractory = 8;
      var tt = now(); if (state.lastBeat) { var iv = tt - state.lastBeat; if (iv > 250 && iv < 1500) { var bpm = 60000 / iv; signal.bpm = signal.bpm ? lerp(signal.bpm, bpm, 0.2) : bpm; } } state.lastBeat = tt;
    }
    if (state.refractory > 0) state.refractory--;
    if (signal.bpm) signal.beat = (signal.beat + signal.dt * signal.bpm / 60) % 1;
  }

  function makeAnalyser(audioCtx, srcNode) {
    var an = audioCtx.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0.8;
    srcNode.connect(an);
    return {
      an: an, sampleRate: audioCtx.sampleRate,
      freq: new Uint8Array(an.frequencyBinCount),
      time: new Uint8Array(an.fftSize),
      prev: new Float32Array(an.frequencyBinCount),
      bandMax: new Float32Array(256),
      fluxAvg: 0, refractory: 0, lastBeat: 0,
      ctx: audioCtx, node: srcNode
    };
  }

  /* =====================================================================
     SOURCES: each is { name, start(app), stop(app), frame(signal,app) }
     ===================================================================== */
  var sources = {
    /* self-driving clock so the cinema is alive with zero input */
    demo: function (opts) {
      opts = opts || {}; var bpm = opts.bpm || 124, nz = makeNoise(7);
      return {
        name: "demo",
        start: function () {}, stop: function () {},
        frame: function (s) {
          var t = s.t, N = s.bands.length, i;
          var interval = 60 / bpm;
          var phase = (t % interval) / interval;
          s.beat = phase; s.bpm = bpm;
          var hit = phase < s.dt / interval + 0.0001;
          s.onsetPulse = !!hit;
          s.onset = Math.max(s.onset * 0.85, hit ? 1 : 0) + 0.12 * Math.exp(-Math.pow((phase - 0) * 6, 2));
          var env = 0.45 + 0.35 * Math.exp(-Math.pow(phase * 5, 2)); // kick envelope
          for (i = 0; i < N; i++) {
            var f = i / N;
            var slow = 0.5 + 0.5 * Math.sin(t * (0.5 + f * 2) + i * 0.6);
            var shimmer = 0.5 + 0.5 * (nz(f * 4, t * 0.4) );
            var tilt = (1 - f) * 0.8 + 0.2;            // more low-end
            s.bands[i] = clamp(lerp(s.bands[i], (slow * 0.6 + shimmer * 0.4) * tilt * env, 0.25), 0, 1);
          }
          s.bass = (0.5 + 0.5 * Math.sin(t * 2)) * env + (hit ? 0.4 : 0);
          s.lowMid = 0.4 + 0.3 * Math.sin(t * 1.3 + 1);
          s.mid = 0.4 + 0.3 * Math.sin(t * 0.9 + 2);
          s.highMid = 0.35 + 0.3 * Math.sin(t * 1.7 + 3);
          s.treble = 0.3 + 0.3 * Math.abs(Math.sin(t * 2.3));
          s.energy = lerp(s.energy, 0.45 + 0.3 * env, 0.2);
          var wl = s.wave.length;
          for (i = 0; i < wl; i++) s.wave[i] = Math.sin(i / wl * TAU * (2 + s.mid * 6) + t * 6) * (0.4 + s.energy * 0.5);
        }
      };
    },

    scroll: function () {
      var lastY = 0, vel = 0, attached = false, target = (typeof window !== "undefined") ? window : null;
      function onScroll() {}
      return {
        name: "scroll",
        start: function () { if (typeof window === "undefined" || attached) return; attached = true; lastY = window.pageYOffset || 0; window.addEventListener("scroll", onScroll, { passive: true }); },
        stop: function () { if (target && attached) { window.removeEventListener("scroll", onScroll); attached = false; } },
        frame: function (s) {
          if (typeof window === "undefined" || typeof document === "undefined") return;
          var d = document.documentElement, max = (d.scrollHeight - window.innerHeight) || 1;
          var y = window.pageYOffset || d.scrollTop || 0;
          var p = clamp(y / max, 0, 1);
          vel = lerp(vel, (y - lastY), 0.3); lastY = y;
          s.scroll = p; s.scrollV = vel;
        }
      };
    },

    pointer: function () {
      var px = 0.5, py = 0.5, lx = 0.5, ly = 0.5, down = false, attached = false;
      function move(e) { var t = e.touches ? e.touches[0] : e; if (!t) return; px = t.clientX / (window.innerWidth || 1); py = t.clientY / (window.innerHeight || 1); }
      function dn() { down = true; } function up() { down = false; }
      return {
        name: "pointer",
        start: function () { if (typeof window === "undefined" || attached) return; attached = true; window.addEventListener("pointermove", move); window.addEventListener("pointerdown", dn); window.addEventListener("pointerup", up); window.addEventListener("touchmove", move, { passive: true }); },
        stop: function () { if (attached) { window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", dn); window.removeEventListener("pointerup", up); window.removeEventListener("touchmove", move); attached = false; } },
        frame: function (s) { s.pointer.vx = px - lx; s.pointer.vy = py - ly; lx = px; ly = py; s.pointer.x = px; s.pointer.y = py; s.pointer.down = down; }
      };
    },

    audioElement: function (mediaEl) {
      var st = null;
      return {
        name: "audio", media: mediaEl,
        start: function (app) {
          var AC = global.AudioContext || global.webkitAudioContext; if (!AC || !mediaEl) return;
          var ctx = app._audioCtx || (app._audioCtx = new AC());
          if (ctx.state === "suspended" && ctx.resume) ctx.resume();
          var node = ctx.createMediaElementSource(mediaEl);
          st = makeAnalyser(ctx, node);
          node.connect(ctx.destination); // keep audible
          app._audioState = st;
        },
        stop: function (app) { if (st) { try { st.node.disconnect(); } catch (e) {} } app._audioState = (app._audioState === st ? null : app._audioState); },
        frame: function (s) { if (st) extractAudio(st, s); }
      };
    },

    audioMic: function () {
      var st = null, stream = null;
      return {
        name: "audio",
        start: function (app) {
          var AC = global.AudioContext || global.webkitAudioContext;
          if (!AC || typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("mic unavailable"));
          var ctx = app._audioCtx || (app._audioCtx = new AC());
          if (ctx.state === "suspended" && ctx.resume) ctx.resume();
          return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
            stream = s; var node = ctx.createMediaStreamSource(s);
            st = makeAnalyser(ctx, node); app._audioState = st; return true;
          });
        },
        stop: function (app) { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); if (app._audioState === st) app._audioState = null; },
        frame: function (s) { if (st) extractAudio(st, s); }
      };
    },

    audioFile: function (file) {
      var st = null, node = null;
      return {
        name: "audio",
        start: function (app) {
          var AC = global.AudioContext || global.webkitAudioContext; if (!AC || !file) return Promise.reject(new Error("no file"));
          var ctx = app._audioCtx || (app._audioCtx = new AC());
          if (ctx.state === "suspended" && ctx.resume) ctx.resume();
          return file.arrayBuffer().then(function (buf) { return ctx.decodeAudioData(buf); }).then(function (audioBuf) {
            node = ctx.createBufferSource(); node.buffer = audioBuf; node.loop = true;
            st = makeAnalyser(ctx, node); node.connect(ctx.destination); node.start(0); app._audioState = st; return true;
          });
        },
        stop: function (app) { if (node) { try { node.stop(); } catch (e) {} } if (app._audioState === st) app._audioState = null; },
        frame: function (s) { if (st) extractAudio(st, s); }
      };
    },

    midi: function (opts) {
      opts = opts || {}; var ccIntensity = opts.intensity == null ? 1 : opts.intensity; // CC#1 mod-wheel -> signal.intensity
      var state = { ccArr: new Array(128), noteArr: new Array(128), clockCount: 0, lastClock: 0, beatPulse: false, access: null };
      var i; for (i = 0; i < 128; i++) { state.ccArr[i] = 0; state.noteArr[i] = 0; }
      function onMsg(ev) {
        var d = ev.data, status = d[0] & 0xf0;
        if (status === 0x90 && d[2] > 0) { state.noteArr[d[1]] = d[2] / 127; state.lastNote = d[1]; state.notePulse = true; }
        else if (status === 0x80 || (status === 0x90 && d[2] === 0)) { state.noteArr[d[1]] = 0; }
        else if (status === 0xB0) { state.ccArr[d[1]] = d[2] / 127; }
        else if (d[0] === 0xF8) { state.clockCount++; if (state.clockCount % 24 === 0) { state.beatPulse = true; var t = now(); if (state.lastClock) { var iv = (t - state.lastClock); if (iv > 200 && iv < 2000) state.bpm = 60000 / iv; } state.lastClock = t; } }
        else if (d[0] === 0xFA) { state.started = true; state.clockCount = 0; }
        else if (d[0] === 0xFC) { state.started = false; }
      }
      return {
        name: "midi", state: state,
        start: function () {
          if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) return Promise.reject(new Error("Web MIDI unavailable"));
          return navigator.requestMIDIAccess().then(function (a) { state.access = a; a.inputs.forEach(function (inp) { inp.onmidimessage = onMsg; }); a.onstatechange = function () { a.inputs.forEach(function (inp) { inp.onmidimessage = onMsg; }); }; return true; });
        },
        stop: function () { if (state.access) state.access.inputs.forEach(function (inp) { inp.onmidimessage = null; }); },
        frame: function (s) {
          var i; for (i = 0; i < 128; i++) { s.midi.cc[i] = state.ccArr[i]; s.midi.note[i] = state.noteArr[i]; }
          if (ccIntensity) s.intensity = 0.4 + state.ccArr[1] * 1.2;
          if (state.bpm) s.bpm = state.bpm;
          if (state.beatPulse) { s.onsetPulse = true; s.onset = 1; s.beat = 0; state.beatPulse = false; }
          else if (state.notePulse) { s.onset = Math.max(s.onset, 0.9); state.notePulse = false; }
          if (s.bpm) s.beat = (s.beat + s.dt * s.bpm / 60) % 1;
          // let MIDI notes feed a little energy when there's no audio analyser
          if (!this._hasAudio) { var e = 0, c = 0; for (i = 0; i < 128; i++) { e += s.midi.note[i]; if (s.midi.note[i] > 0) c++; } s.energy = lerp(s.energy, clamp(e * 0.5, 0, 1), 0.2); }
        }
      };
    }
  };

  /* =====================================================================
     SCENE CONTEXT: handed to each scene's setup()/frame()
     ===================================================================== */
  function makeCtx(app, layer) {
    var noise = app._noise;
    return {
      layer: layer, W: app.W, H: app.H, cx: app.W / 2, cy: app.H / 2, t: 0,
      palette: app.palette.slice(), TAU: TAU, ink: app.ink, bg: app.bg,
      el: function (tag, attrs) { return el(tag, attrs, layer); },
      set: setA,
      pool: function (tag, n, attrs) { var a = [], i; for (i = 0; i < n; i++) a.push(el(tag, attrs || {}, layer)); return a; },
      clear: function () { while (layer.firstChild) layer.removeChild(layer.firstChild); },
      lerp: lerp, clamp: clamp, mix: mix,
      polar: function (cx, cy, r, ang) { return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]; },
      noise: noise, rng: app._rng, hsl: hsl,
      col: function (i) { return app.palette[((i % app.palette.length) + app.palette.length) % app.palette.length]; },
      /* sketch primitives: reveal a sub-span of a path, or run a full draw->hold->erase life */
      segment: function (node, a, b) {
        a = a < 0 ? 0 : a > 1 ? 1 : a; b = b < 0 ? 0 : b > 1 ? 1 : b; if (b < a) { var tmp = a; a = b; b = tmp; }
        node.setAttribute("pathLength", 1);
        node.style.strokeDasharray = "0 " + a.toFixed(4) + " " + (b - a).toFixed(4) + " " + (1 - b).toFixed(4);
        node.style.strokeDashoffset = "0";
      },
      sketch: function (node, life, draw, hold) {
        life = life - Math.floor(life);                       // wrap into [0,1)
        draw = draw == null ? 0.4 : draw; hold = hold == null ? 0.25 : hold;
        var erase = 1 - draw - hold; if (erase < 0.0001) erase = 0.0001;
        var a = 0, b = 0, al = 1, p;
        if (life < draw) { p = life / draw; b = p * p * (3 - 2 * p); al = p < 0.25 ? p * 4 : 1; }     // drawing on
        else if (life < draw + hold) { a = 0; b = 1; al = 1; }                                        // held
        else { p = (life - draw - hold) / erase; a = p * p * (3 - 2 * p); b = 1; al = 1 - p; }        // erasing from the start
        this.segment(node, a, b);
        node.setAttribute("opacity", (al < 0 ? 0 : al).toFixed(3));
      },
      min: function () { return Math.min(app.W, app.H); }
    };
  }

  /* =====================================================================
     BUILT-IN SCENE KIT
     Each factory returns { name, params, setup(ctx), frame(ctx, signal) }.
     setup/frame are called with `this` = the scene object, so scenes may
     stash pooled elements + state on themselves.
     ===================================================================== */
  function poly(pts) { var d = "", i; for (i = 0; i < pts.length; i += 2) d += (i ? "L" : "M") + pts[i].toFixed(1) + " " + pts[i + 1].toFixed(1) + " "; return d; }

  var scenes = {
    /* lines emerge from the centre into a morphing string-art web */
    emerge: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "emerge",
        params: { nodes: opts.nodes || 60, spread: opts.spread || 0.42 },
        setup: function (ctx) {
          this.lines = ctx.pool("path", 120, { fill: "none", "stroke-width": 1.1, "stroke-linecap": "round" });
        },
        frame: function (ctx, s) {
          var P = this.params, N = P.nodes, R = ctx.min() * P.spread, cx = ctx.W / 2, cy = ctx.H / 2, t = s.t;
          var skip = 1 + Math.floor(2 + s.mid * 5), draw = clamp(0.15 + s.energy * 1.3, 0, 1);
          var li = 0, lines = this.lines;
          for (var i = 0; i < N && li < lines.length; i++) {
            var a0 = (i / N) * TAU + t * 0.05;
            var rr = R * (0.6 + 0.4 * Math.sin(a0 * 3 + t + s.bass * 4));
            var p0 = ctx.polar(cx, cy, rr, a0);
            var a1 = ((i + skip) / N) * TAU + t * 0.05;
            var rr2 = R * (0.6 + 0.4 * Math.sin(a1 * 3 + t + s.bass * 4));
            var p1 = ctx.polar(cx, cy, rr2, a1);
            var midr = R * (0.15 + s.treble * 0.5) * (Math.sin(t + i) );
            var mp = ctx.polar(cx, cy, midr, (a0 + a1) / 2 + 1.57);
            var L = lines[li++];
            L.setAttribute("d", "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " Q" + mp[0].toFixed(1) + " " + mp[1].toFixed(1) + " " + p1[0].toFixed(1) + " " + p1[1].toFixed(1));
            L.setAttribute("stroke", ctx.hsl((i / N) * 90 + t * 14 + s.treble * 80, 80, 62, clamp(0.25 + s.bands[i % s.bands.length] * 0.7, 0, 1)));
            L.setAttribute("pathLength", "1");
            L.style.strokeDasharray = "1";
            L.style.strokeDashoffset = (1 - draw);
          }
          for (; li < lines.length; li++) lines[li].style.strokeDashoffset = "1";
        }
      };
    },

    /* flow-field streamlines following Perlin noise, modulated by bands */
    flow: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "flow",
        params: { density: opts.density || 60, steps: opts.steps || 22, scale: opts.scale || 0.0016, spin: 0 },
        setup: function (ctx) {
          this.max = 160; this.paths = ctx.pool("path", this.max, { fill: "none", "stroke-width": 1.2, "stroke-linecap": "round" });
          this.seeds = []; var r = ctx.rng; for (var i = 0; i < this.max; i++) this.seeds.push([r(), r()]);
        },
        frame: function (ctx, s) {
          var P = this.params, W = ctx.W, H = ctx.H, t = s.t, nz = ctx.noise;
          var count = clamp(P.density | 0, 4, this.max), steps = P.steps, sc = P.scale;
          var stepLen = (6 + s.energy * 16) * (ctx.min() / 800);
          for (var i = 0; i < this.paths.length; i++) {
            var pa = this.paths[i];
            if (i >= count) { pa.setAttribute("d", ""); continue; }
            var x = this.seeds[i][0] * W, y = this.seeds[i][1] * H;
            // drift the seed slowly so the field breathes
            this.seeds[i][0] = (this.seeds[i][0] + (nz(i, t * 0.05) ) * 0.0009 + 1) % 1;
            this.seeds[i][1] = (this.seeds[i][1] + (nz(i + 99, t * 0.05)) * 0.0009 + 1) % 1;
            var pts = [x, y];
            for (var k = 0; k < steps; k++) {
              var ang = nz(x * sc, y * sc + t * 0.15) * TAU * 2 + t * P.spin;
              x += Math.cos(ang) * stepLen; y += Math.sin(ang) * stepLen;
              if (x < -20 || x > W + 20 || y < -20 || y > H + 20) break;
              pts.push(x, y);
            }
            pa.setAttribute("d", poly(pts));
            pa.setAttribute("stroke", ctx.hsl((i / count) * 120 + t * 10 + s.treble * 90, 78, 60, clamp(0.18 + s.bands[i % s.bands.length] * 0.7, 0, 0.9)));
          }
        }
      };
    },

    /* harmonograph / Lissajous: one long morphing line */
    lissa: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "lissa",
        params: { samples: opts.samples || 1400, loops: opts.loops || 8 },
        setup: function (ctx) { this.path = ctx.el("path", { fill: "none", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }); this.ph = 0; },
        frame: function (ctx, s) {
          var P = this.params, n = P.samples, W = ctx.W, H = ctx.H, cx = W / 2, cy = H / 2, t = s.t;
          var Ax = W * 0.36, Ay = H * 0.36;
          var a = 2 + Math.round(s.bass * 4), b = 3 + Math.round(s.mid * 4), c = 1 + Math.round(s.treble * 5);
          if (s.onsetPulse) this.ph += 0.6;
          var decay = 0.4 + (1 - s.energy) * 1.8;
          var d = "", i;
          for (i = 0; i <= n; i++) {
            var p = (i / n) * TAU * P.loops;
            var damp = Math.exp(-(p / (TAU * P.loops)) * decay);
            var x = cx + Math.sin(a * p + this.ph + t * 0.3) * Ax * damp;
            var y = cy + Math.sin(b * p + t * 0.2) * Ay * damp * Math.cos(c * p * 0.5);
            d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
          }
          this.path.setAttribute("d", d);
          this.path.setAttribute("stroke", ctx.hsl(t * 18 + s.treble * 120, 82, 64, 0.85));
        }
      };
    },

    /* oscilloscope: actual waveform + a faint band Lissajous */
    scope: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "scope",
        params: { gain: opts.gain || 1 },
        setup: function (ctx) {
          this.wave = ctx.el("path", { fill: "none", "stroke-width": 2 });
          this.xy = ctx.el("path", { fill: "none", "stroke-width": 1, opacity: 0.5 });
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, cy = H / 2, wl = s.wave.length, i, d = "";
          var amp = H * 0.3 * this.params.gain;
          for (i = 0; i < wl; i++) { var x = (i / (wl - 1)) * W; var y = cy + s.wave[i] * amp; d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " "; }
          this.wave.setAttribute("d", d);
          this.wave.setAttribute("stroke", ctx.hsl(180 + s.energy * 120, 85, 62, 0.9));
          // XY figure from bass/treble envelopes
          var cx = W / 2, R = ctx.min() * 0.32, dd = "", n = 240;
          for (i = 0; i <= n; i++) { var p = i / n * TAU; var rr = R * (0.6 + 0.4 * Math.sin(p * (2 + s.bass * 5) + s.t)); var px = cx + Math.cos(p) * rr * (0.7 + s.treble * 0.5); var py = cy + Math.sin(p) * rr; dd += (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1) + " "; }
          this.xy.setAttribute("d", dd);
          this.xy.setAttribute("stroke", ctx.col(0));
        }
      };
    },

    /* radial spectrum: mirrored bars around a ring, spin + onset bloom */
    bars: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "bars",
        params: { spin: opts.spin || 0.2, inner: opts.inner || 0.18 },
        setup: function (ctx) { this.n = ctx.layer.dataset ? 0 : 0; this.lines = ctx.pool("line", 200, { "stroke-width": 2.4, "stroke-linecap": "round" }); this.rot = 0; },
        frame: function (ctx, s) {
          var N = Math.min(this.lines.length / 2 | 0, s.bands.length), cx = ctx.W / 2, cy = ctx.H / 2;
          var base = ctx.min() * this.params.inner * (1 + s.onset * 0.25);
          this.rot += s.dt * this.params.spin;
          var li = 0;
          for (var i = 0; i < N; i++) {
            var v = s.bands[i];
            var len = base + v * ctx.min() * 0.34;
            for (var m = 0; m < 2; m++) {
              var ang = this.rot + (i / N) * Math.PI + (m ? Math.PI : 0);
              var p0 = ctx.polar(cx, cy, base, ang), p1 = ctx.polar(cx, cy, len, ang);
              var L = this.lines[li++];
              L.setAttribute("x1", p0[0].toFixed(1)); L.setAttribute("y1", p0[1].toFixed(1));
              L.setAttribute("x2", p1[0].toFixed(1)); L.setAttribute("y2", p1[1].toFixed(1));
              L.setAttribute("stroke", ctx.hsl((i / N) * 140 + s.t * 10, 80, 60, clamp(0.3 + v, 0, 1)));
            }
          }
          for (; li < this.lines.length; li++) { this.lines[li].setAttribute("x2", this.lines[li].getAttribute("x1") || 0); }
        }
      };
    },

    /* a line mesh that warps with a travelling noise wave + bands */
    mesh: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "mesh",
        params: { cols: opts.cols || 18, rows: opts.rows || 11, amp: opts.amp || 1 },
        setup: function (ctx) { this.rowsP = ctx.pool("path", 40, { fill: "none", "stroke-width": 1 }); this.colsP = ctx.pool("path", 40, { fill: "none", "stroke-width": 1 }); },
        frame: function (ctx, s) {
          var C = this.params.cols, R = this.params.rows, W = ctx.W, H = ctx.H, nz = ctx.noise, t = s.t;
          var amp = (12 + s.energy * 70) * this.params.amp * (ctx.min() / 800);
          var gx = W / (C - 1), gy = H / (R - 1);
          function pt(c, r) { var x = c * gx, y = r * gy; var n = nz(c * 0.4 + t * 0.3, r * 0.4 - t * 0.2); return [x + Math.cos(n * TAU) * amp, y + Math.sin(n * TAU) * amp + s.bands[(c) % s.bands.length] * amp]; }
          var i, c, r, p;
          for (r = 0; r < R; r++) { var d = ""; for (c = 0; c < C; c++) { p = pt(c, r); d += (c ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1) + " "; } var P = this.rowsP[r]; if (P) { P.setAttribute("d", d); P.setAttribute("stroke", ctx.hsl(200 + r / R * 80 + t * 8, 70, 58, 0.5)); } }
          for (c = 0; c < C; c++) { var d2 = ""; for (r = 0; r < R; r++) { p = pt(c, r); d2 += (r ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1) + " "; } var P2 = this.colsP[c]; if (P2) { P2.setAttribute("d", d2); P2.setAttribute("stroke", ctx.hsl(200 + c / C * 80 + t * 8, 70, 58, 0.35)); } }
          for (r = R; r < this.rowsP.length; r++) this.rowsP[r].setAttribute("d", "");
          for (c = C; c < this.colsP.length; c++) this.colsP[c].setAttribute("d", "");
        }
      };
    },

    /* constellation: drifting points joined when near; onset = shockwave */
    constellation: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "constellation",
        params: { points: opts.points || 64, link: opts.link || 0.16 },
        setup: function (ctx) {
          var P = this.params.points, r = ctx.rng; this.pts = [];
          for (var i = 0; i < P; i++) this.pts.push({ x: r(), y: r(), vx: (r() - 0.5) * 0.0008, vy: (r() - 0.5) * 0.0008 });
          this.dots = ctx.pool("circle", P, { r: 1.6 });
          this.links = ctx.pool("line", P * 4, { "stroke-width": 0.8 });
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, pts = this.pts, n = pts.length, i, j;
          var linkD = this.params.link * (1 + s.energy);
          if (s.onsetPulse) { for (i = 0; i < n; i++) { var dx = pts[i].x - 0.5, dy = pts[i].y - 0.5, m = Math.sqrt(dx * dx + dy * dy) || 1; pts[i].vx += dx / m * 0.004; pts[i].vy += dy / m * 0.004; } }
          for (i = 0; i < n; i++) { var p = pts[i]; p.vx *= 0.96; p.vy *= 0.96; p.x += p.vx + (s.pointer.down ? (s.pointer.x - p.x) * 0.002 : 0); p.y += p.vy; if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1; p.x = clamp(p.x, 0, 1); p.y = clamp(p.y, 0, 1); var dd = this.dots[i]; dd.setAttribute("cx", (p.x * W).toFixed(1)); dd.setAttribute("cy", (p.y * H).toFixed(1)); dd.setAttribute("fill", ctx.hsl(s.t * 12 + i, 80, 66, 0.9)); dd.setAttribute("r", (1.4 + s.bands[i % s.bands.length] * 4).toFixed(1)); }
          var li = 0, links = this.links;
          for (i = 0; i < n && li < links.length; i++) for (j = i + 1; j < n && li < links.length; j++) {
            var ax = pts[i].x, ay = pts[i].y, bx = pts[j].x, by = pts[j].y, dx2 = ax - bx, dy2 = ay - by, dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            if (dist < linkD) { var L = links[li++]; L.setAttribute("x1", (ax * W).toFixed(1)); L.setAttribute("y1", (ay * H).toFixed(1)); L.setAttribute("x2", (bx * W).toFixed(1)); L.setAttribute("y2", (by * H).toFixed(1)); L.setAttribute("stroke", ctx.col(0)); L.setAttribute("stroke-opacity", (1 - dist / linkD) * 0.6); }
          }
          for (; li < links.length; li++) links[li].setAttribute("stroke-opacity", "0");
        }
      };
    },

    /* kinetic intertitle text: set params.text per cue to tell a story */
    type: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "type",
        params: { text: opts.text || "", sub: opts.sub || "", family: opts.family || "inherit" },
        setup: function (ctx) {
          this.main = ctx.el("text", { "text-anchor": "middle", "dominant-baseline": "middle", "font-family": this.params.family, "font-weight": 800 });
          this.sub = ctx.el("text", { "text-anchor": "middle", "dominant-baseline": "middle", "font-family": this.params.family });
          this._shown = "";
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, size = ctx.min() * 0.12;
          this.main.textContent = this.params.text;
          this.main.setAttribute("x", W / 2); this.main.setAttribute("y", H / 2 - size * 0.1);
          this.main.setAttribute("font-size", size * (1 + s.onset * 0.06));
          this.main.setAttribute("fill", ctx.ink); this.main.setAttribute("opacity", 0.95);
          this.main.setAttribute("letter-spacing", (-size * 0.02 + s.energy * 2).toFixed(2));
          this.sub.textContent = this.params.sub;
          this.sub.setAttribute("x", W / 2); this.sub.setAttribute("y", H / 2 + size * 0.7);
          this.sub.setAttribute("font-size", size * 0.22);
          this.sub.setAttribute("fill", ctx.col(0)); this.sub.setAttribute("opacity", 0.8);
          this.sub.setAttribute("letter-spacing", (size * 0.06).toFixed(2));
        }
      };
    },

    /* =================================================================
       VJ / TECH-HOUSE PACK: peak-time Ibiza visuals
       tunnel · skyline · lasers · kick · strobe
       ================================================================= */

    /* TUNNEL: infinite rotating n-gon corridor rushing the viewer.
       speed rides energy + BPM, bass punches the walls, hue scrolls. */
    tunnel: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "tunnel",
        params: { sides: opts.sides || 6, spin: opts.spin || 1, speed: opts.speed || 1 },
        setup: function (ctx) {
          this.N = 28;
          this.rings = ctx.pool("path", this.N, { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" });
          this.phase = 0;
        },
        frame: function (ctx, s) {
          var P = this.params, N = this.N, W = ctx.W, H = ctx.H, cx = W / 2, cy = H / 2, t = s.t;
          var dt = s.dt || 0.016, sides = Math.max(3, P.sides | 0);
          var maxR = ctx.min() * (0.64 + s.bass * 0.16);
          var spd = (0.10 + s.energy * 0.55 + (s.bpm ? s.bpm / 900 : 0)) * P.speed;
          this.phase = (this.phase + spd * dt * 2.2) % 1;
          for (var i = 0; i < N; i++) {
            var z = ((i / N) + this.phase) % 1;            // 0 = far (centre) -> 1 = near (edge)
            var rr = maxR * z * z;                          // perspective acceleration
            var rot = z * 2.4 * P.spin + t * 0.35 + s.beat * 0.6;
            var d = "", k, ang, pp;
            for (k = 0; k <= sides; k++) {
              ang = rot + (k / sides) * TAU;
              pp = ctx.polar(cx, cy, rr, ang);
              d += (k ? "L" : "M") + pp[0].toFixed(1) + " " + pp[1].toFixed(1) + " ";
            }
            var op = Math.sin(z * Math.PI);                 // fade in/out at both ends
            var R = this.rings[i];
            R.setAttribute("d", d + "Z");
            R.setAttribute("stroke", ctx.hsl(z * 220 + t * 36 + s.treble * 120, 85, 58 + s.onset * 16, clamp(op * (0.5 + s.energy * 0.5), 0, 1)));
            R.setAttribute("stroke-width", (1 + z * 5).toFixed(2));
          }
        }
      };
    },

    /* SKYLINE: spectrum skyline + mirrored reflection over a Tron floor. */
    skyline: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "skyline",
        params: { bars: opts.bars || 36, floor: opts.floor || 1 },
        setup: function (ctx) {
          this.nb = Math.max(8, this.params.bars | 0);
          this.fH = ctx.pool("line", 14, {});            // floor (drawn first = behind)
          this.fV = ctx.pool("line", 18, {});
          this.refl = ctx.pool("rect", this.nb, {});
          this.bars = ctx.pool("rect", this.nb, {});     // skyline (drawn last = front)
          this.phase = 0;
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, t = s.t, dt = s.dt || 0.016, hy = H * 0.6, n = this.nb;
          var bw = W / n;
          for (var i = 0; i < n; i++) {
            var v = clamp(s.bands[i % s.bands.length], 0, 1);
            var h = v * hy * 1.35 * (1 + s.onset * 0.2);
            var x = i * bw, col = ctx.hsl((i / n) * 140 + 180 + t * 10, 82, 56 + s.energy * 10, 0.92);
            var B = this.bars[i];
            B.setAttribute("x", (x + bw * 0.1).toFixed(1)); B.setAttribute("y", (hy - h).toFixed(1));
            B.setAttribute("width", (bw * 0.8).toFixed(1)); B.setAttribute("height", h.toFixed(1));
            B.setAttribute("fill", col);
            var Rf = this.refl[i];
            Rf.setAttribute("x", (x + bw * 0.1).toFixed(1)); Rf.setAttribute("y", hy.toFixed(1));
            Rf.setAttribute("width", (bw * 0.8).toFixed(1)); Rf.setAttribute("height", (h * 0.45).toFixed(1));
            Rf.setAttribute("fill", col); Rf.setAttribute("opacity", 0.16);
          }
          this.phase = (this.phase + dt * (0.15 + s.energy * 0.4) * this.params.floor) % 1;
          var nh = this.fH.length, depthBot = H - hy, cxv = W / 2;
          for (var j = 0; j < nh; j++) {
            var p = ((j / nh) + this.phase) % 1, yk = hy + p * p * depthBot, L = this.fH[j];
            L.setAttribute("x1", 0); L.setAttribute("y1", yk.toFixed(1));
            L.setAttribute("x2", W); L.setAttribute("y2", yk.toFixed(1));
            L.setAttribute("stroke", ctx.col(0));
            L.setAttribute("stroke-width", (0.5 + p * 1.5).toFixed(2));
            L.setAttribute("opacity", clamp(p * 0.5, 0, 0.5).toFixed(2));
          }
          var nv = this.fV.length;
          for (var w = 0; w < nv; w++) {
            var fr = nv > 1 ? (w / (nv - 1)) * 2 - 1 : 0, V = this.fV[w];
            V.setAttribute("x1", cxv.toFixed(1)); V.setAttribute("y1", hy.toFixed(1));
            V.setAttribute("x2", (cxv + fr * W * 0.9).toFixed(1)); V.setAttribute("y2", H);
            V.setAttribute("stroke", ctx.col(1)); V.setAttribute("stroke-width", 0.6); V.setAttribute("opacity", 0.18);
          }
        }
      };
    },

    /* LASERS: overhead rig fanning sweeping beams; onset = white burst. */
    lasers: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "lasers",
        params: { beams: opts.beams || 32, spread: opts.spread || 1, sweep: opts.sweep || 1 },
        setup: function (ctx) {
          this.max = 64;
          this.beams = ctx.pool("line", this.max, { "stroke-linecap": "round" });
        },
        frame: function (ctx, s) {
          var P = this.params, W = ctx.W, H = ctx.H, t = s.t;
          var n = Math.min(this.max, Math.max(6, P.beams | 0));
          var ox = W / 2, oy = H * 0.1;                    // rig above the booth
          var sweep = Math.sin(t * 0.6 * P.sweep) * 0.45 + Math.sin(t * 0.23) * 0.18;
          var half = (0.45 + s.energy * 0.6 + s.onset * 0.5) * P.spread;
          var burst = s.onsetPulse, len = Math.sqrt(W * W + H * H) * 1.1;
          for (var i = 0; i < this.max; i++) {
            var B = this.beams[i];
            if (i >= n) { B.setAttribute("opacity", 0); continue; }
            var frac = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
            var ang = (Math.PI / 2) + sweep + frac * half + Math.sin(t * 6 + i * 1.3) * 0.04;
            var ex = ox + Math.cos(ang) * len, ey = oy + Math.sin(ang) * len;
            B.setAttribute("x1", ox.toFixed(1)); B.setAttribute("y1", oy.toFixed(1));
            B.setAttribute("x2", ex.toFixed(1)); B.setAttribute("y2", ey.toFixed(1));
            if (burst) { B.setAttribute("stroke", ctx.hsl(0, 0, 100, 0.9)); B.setAttribute("stroke-width", (1.5 + s.energy * 3).toFixed(2)); }
            else { B.setAttribute("stroke", ctx.col(i)); B.setAttribute("stroke-width", (0.8 + s.energy * 2).toFixed(2)); }
            B.setAttribute("opacity", clamp(0.32 + s.energy * 0.4 + (Math.abs(frac) < 0.08 ? 0.2 : 0), 0, 1).toFixed(2));
          }
        }
      };
    },

    /* KICK: every kick fires an expanding shockwave; core pumps on bass. */
    kick: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "kick",
        params: { burst: opts.burst || 1, decay: opts.decay || 1 },
        setup: function (ctx) {
          this.N = 22;
          this.rings = ctx.pool("circle", this.N, { fill: "none" });
          this.life = []; this.rad = []; this.hue = []; this.next = 0;
          for (var i = 0; i < this.N; i++) { this.life[i] = 0; this.rad[i] = 0; this.hue[i] = 0; }
          this.coreFill = ctx.el("circle", {});
          this.core = ctx.el("circle", { fill: "none", "stroke-width": 3 });
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, cx = W / 2, cy = H / 2, dt = s.dt || 0.016, m = ctx.min();
          if (s.onsetPulse) {
            var k = this.next % this.N; this.next++;
            this.life[k] = 1; this.rad[k] = m * 0.03; this.hue[k] = (s.t * 40) % 360;
          }
          for (var i = 0; i < this.N; i++) {
            var R = this.rings[i];
            if (this.life[i] > 0) {
              this.life[i] -= dt * 0.7 * this.params.decay;
              this.rad[i] += dt * m * (0.9 + s.energy * 1.2) * this.params.burst;
              R.setAttribute("cx", cx); R.setAttribute("cy", cy);
              R.setAttribute("r", Math.max(0, this.rad[i]).toFixed(1));
              R.setAttribute("stroke", ctx.hsl(this.hue[i] + s.treble * 80, 88, 60, clamp(this.life[i], 0, 1)));
              R.setAttribute("stroke-width", (1 + this.life[i] * 5).toFixed(2));
            } else { R.setAttribute("r", 0); R.setAttribute("stroke-width", 0); }
          }
          var cr = m * (0.045 + s.bass * 0.14 + s.onset * 0.05);
          this.coreFill.setAttribute("cx", cx); this.coreFill.setAttribute("cy", cy);
          this.coreFill.setAttribute("r", cr.toFixed(1));
          this.coreFill.setAttribute("fill", ctx.hsl(s.t * 30, 80, 58, (0.18 + s.onset * 0.3).toFixed(3)));
          this.core.setAttribute("cx", cx); this.core.setAttribute("cy", cy);
          this.core.setAttribute("r", (cr * 1.25).toFixed(1));
          this.core.setAttribute("stroke", ctx.col(0));
          this.core.setAttribute("opacity", (0.5 + s.onset * 0.5).toFixed(2));
        }
      };
    },

    /* STROBE: warehouse beat-flash + sweeping light columns. */
    strobe: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "strobe",
        params: { columns: opts.columns || 16, scan: opts.scan || 1 },
        setup: function (ctx) {
          this.flash = ctx.el("rect", { x: 0, y: 0 });   // back wash
          this.n = Math.max(4, this.params.columns | 0);
          this.cols = ctx.pool("rect", this.n, {});      // columns on top
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, t = s.t, n = this.n;
          this.flash.setAttribute("width", W); this.flash.setAttribute("height", H);
          this.flash.setAttribute("fill", ctx.ink);
          this.flash.setAttribute("opacity", clamp((s.onset - 0.35) * 0.9, 0, 0.55).toFixed(3));
          var cw = W / n;
          for (var i = 0; i < n; i++) {
            var bnd = s.bands[i % s.bands.length];
            var ph = ((i / n) + t * 0.12 * this.params.scan) % 1, x = ph * (W + cw) - cw, C = this.cols[i];
            C.setAttribute("x", x.toFixed(1)); C.setAttribute("y", 0);
            C.setAttribute("width", (cw * (0.18 + bnd * 0.6)).toFixed(1)); C.setAttribute("height", H);
            C.setAttribute("fill", ctx.col(i));
            C.setAttribute("opacity", clamp(0.06 + s.energy * 0.22 + bnd * 0.4, 0, 0.7).toFixed(3));
          }
        }
      };
    },

    /* GRID: seamless octave-zoom checkerboard, slowly rotating; beat flips it. */
    grid: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "grid",
        params: { speed: opts.speed || 1, spin: opts.spin || 1 },
        setup: function (ctx) {
          this.base = ctx.min() / 5;
          this.cols = Math.ceil(ctx.W / this.base) + 4;
          this.rows = Math.ceil(ctx.H / this.base) + 4;
          this.cells = ctx.pool("rect", this.cols * this.rows, {});
          this.phase = 0; this.par = 0;
        },
        resize: function (ctx) {
          if (!this.cells) return;
          this.base = ctx.min() / 5;
          var cols = Math.ceil(ctx.W / this.base) + 4, rows = Math.ceil(ctx.H / this.base) + 4;
          var need = cols * rows;
          if (need > this.cells.length) this.cells = this.cells.concat(ctx.pool("rect", need - this.cells.length, {}));
          this.cols = cols; this.rows = rows;
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, cx = W / 2, cy = H / 2, dt = s.dt || 0.016, t = s.t;
          this.phase += dt * (0.25 + s.energy * 0.6) * this.params.speed;
          while (this.phase >= 1) { this.phase -= 1; this.par ^= 1; }   // octave wrap flips parity -> seamless
          var cell = this.base * Math.pow(2, this.phase), cols = this.cols, rows = this.rows;
          var ox = cx - (cols / 2) * cell, oy = cy - (rows / 2) * cell;
          var flip = s.onset > 0.5 ? 1 : 0, hue = (t * 14) % 360, cells = this.cells, n = cells.length, idx = 0;
          for (var gj = 0; gj < rows && idx < n; gj++) {
            for (var gi = 0; gi < cols && idx < n; gi++) {
              var R = cells[idx++];
              if ((gi + gj + this.par + flip) & 1) {
                R.setAttribute("x", (ox + gi * cell).toFixed(1)); R.setAttribute("y", (oy + gj * cell).toFixed(1));
                R.setAttribute("width", cell.toFixed(1)); R.setAttribute("height", cell.toFixed(1));
                R.setAttribute("fill", ctx.hsl(hue + (gi + gj) * 4, 80, 56 + s.energy * 8, clamp(0.5 + s.energy * 0.4, 0, 0.95)));
              } else { R.setAttribute("width", 0); R.setAttribute("height", 0); }
            }
          }
          for (; idx < n; idx++) { cells[idx].setAttribute("width", 0); cells[idx].setAttribute("height", 0); }
          ctx.layer.setAttribute("transform", "rotate(" + (t * 6 * this.params.spin).toFixed(2) + " " + cx + " " + cy + ")");
        }
      };
    },

    /* WORDTUNNEL: words fly out of the vanishing point, growing toward you. */
    wordtunnel: function (opts) {
      opts = opts || {};
      var WORDS = opts.words || ["GROOVE", "LOW END", "SWING", "DUB", "REWIND", "ACID", "303", "909", "DROP", "RIDE", "PULSE", "HYPNOTIC", "LOCK IN", "DARK"];
      return {
        name: opts.name || "wordtunnel",
        params: { speed: opts.speed || 1, spread: opts.spread || 0.5, family: opts.family || "inherit" },
        setup: function (ctx) {
          this.M = 16; this.words = WORDS;
          this.texts = ctx.pool("text", this.M, { "text-anchor": "middle", "dominant-baseline": "middle", "font-weight": 800, "font-family": this.params.family });
          this.ang = []; for (var i = 0; i < this.M; i++) this.ang[i] = (i / this.M) * TAU;
          this.phase = 0;
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, cx = W / 2, cy = H / 2, dt = s.dt || 0.016, t = s.t, m = ctx.min();
          this.phase = (this.phase + dt * (0.18 + s.energy * 0.5 + (s.bpm ? s.bpm / 1200 : 0)) * this.params.speed) % 1;
          for (var i = 0; i < this.M; i++) {
            var z = ((i / this.M) + this.phase) % 1, T = this.texts[i];
            var size = m * 0.02 + z * z * m * 0.34, rr = z * z * m * this.params.spread;
            var a = this.ang[i] + t * 0.2 + s.beat * 0.5;
            var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            T.textContent = this.words[i % this.words.length];
            T.setAttribute("x", x.toFixed(1)); T.setAttribute("y", y.toFixed(1));
            T.setAttribute("font-size", size.toFixed(1));
            T.setAttribute("fill", ctx.hsl(z * 200 + t * 30 + s.treble * 100, 80, 60, clamp(Math.sin(z * Math.PI) * (0.5 + s.energy * 0.5), 0, 1)));
            T.setAttribute("transform", "rotate(" + (Math.sin(t + i) * 8).toFixed(1) + " " + x.toFixed(1) + " " + y.toFixed(1) + ")");
          }
        }
      };
    },

    /* MORPH: organic blobs breathing on bass; pure morphing objects. */
    morph: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "morph",
        params: { blobs: opts.blobs || 5, detail: opts.detail || 12, amp: opts.amp || 1 },
        setup: function (ctx) {
          this.K = Math.max(1, this.params.blobs | 0);
          this.paths = ctx.pool("path", this.K, { fill: "none", "stroke-width": 2, "stroke-linejoin": "round" });
          this.seed = []; var r = ctx.rng;
          for (var i = 0; i < this.K; i++) this.seed.push({ x: 0.2 + 0.6 * r(), y: 0.2 + 0.6 * r(), ph: r() * 6.283, sp: 0.5 + r() });
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, t = s.t, m = ctx.min(), P = Math.max(5, this.params.detail | 0);
          var baseR = m * 0.13 * (1 + s.bass * 0.5) * this.params.amp;
          for (var k = 0; k < this.K; k++) {
            var sd = this.seed[k];
            var ccx = sd.x * W + Math.cos(t * 0.3 * sd.sp + sd.ph) * m * 0.06;
            var ccy = sd.y * H + Math.sin(t * 0.27 * sd.sp + sd.ph) * m * 0.06;
            var pts = [], j;
            for (j = 0; j < P; j++) {
              var a = (j / P) * TAU;
              var wob = 1 + 0.35 * Math.sin(a * 3 + t * 1.2 + sd.ph + s.mid * 3) + 0.25 * Math.sin(a * 5 - t * 0.9) + s.onset * 0.2;
              var rr = baseR * (0.7 + 0.5 * k / this.K) * wob;
              pts.push(ccx + Math.cos(a) * rr); pts.push(ccy + Math.sin(a) * rr);
            }
            var nn = P, d = "M" + ((pts[0] + pts[(nn - 1) * 2]) / 2).toFixed(1) + " " + ((pts[1] + pts[(nn - 1) * 2 + 1]) / 2).toFixed(1);
            for (j = 0; j < nn; j++) {
              var px = pts[j * 2], py = pts[j * 2 + 1], nx = pts[((j + 1) % nn) * 2], ny = pts[((j + 1) % nn) * 2 + 1];
              d += " Q" + px.toFixed(1) + " " + py.toFixed(1) + " " + ((px + nx) / 2).toFixed(1) + " " + ((py + ny) / 2).toFixed(1);
            }
            var Pth = this.paths[k];
            Pth.setAttribute("d", d + "Z");
            Pth.setAttribute("stroke", ctx.hsl((k / this.K) * 120 + t * 20 + s.treble * 80, 80, 60, 0.85));
          }
        }
      };
    },

    /* TERRAIN: parallax morphing landscape + a rising sun; an environment. */
    terrain: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "terrain",
        params: { layers: opts.layers || 5, detail: opts.detail || 16, speed: opts.speed || 1 },
        setup: function (ctx) {
          this.L = Math.max(2, this.params.layers | 0);
          this.sun = ctx.el("circle", {});                 // sun first = behind ridges
          this.ridges = ctx.pool("path", this.L, { "stroke-width": 1.5 });
          this.scroll = 0;
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, t = s.t, nz = ctx.noise, m = ctx.min(), detail = Math.max(4, this.params.detail | 0);
          this.scroll += (s.dt || 0.016) * (0.05 + s.energy * 0.25) * this.params.speed;
          var sx = W * 0.5 + Math.sin(t * 0.1) * W * 0.1, sy = H * 0.32 - s.bass * m * 0.05;
          this.sun.setAttribute("cx", sx.toFixed(1)); this.sun.setAttribute("cy", sy.toFixed(1));
          this.sun.setAttribute("r", (m * 0.10 * (1 + s.onset * 0.15)).toFixed(1));
          this.sun.setAttribute("fill", "none"); this.sun.setAttribute("stroke", ctx.col(0));
          this.sun.setAttribute("stroke-width", 2); this.sun.setAttribute("opacity", 0.8);
          for (var li = 0; li < this.L; li++) {
            var depth = this.L > 1 ? li / (this.L - 1) : 0, baseY = H * (0.45 + depth * 0.5);
            var amp = m * (0.05 + depth * 0.16) * (1 + s.bass * 0.5), off = this.scroll * (0.3 + depth);
            var d = "M0 " + H.toFixed(1) + " L0 " + baseY.toFixed(1);
            for (var j = 0; j <= detail; j++) {
              var px = (j / detail) * W, py = baseY - nz(j * 0.3 + off, li * 2.7) * amp - Math.sin(j * 0.7 + t * 0.5 + li) * amp * 0.3;
              d += " L" + px.toFixed(1) + " " + py.toFixed(1);
            }
            d += " L" + W.toFixed(1) + " " + H.toFixed(1) + " Z";
            var R = this.ridges[li], lum = 22 + depth * 30;
            R.setAttribute("d", d);
            R.setAttribute("fill", ctx.hsl(210 + depth * 60 + t * 4, 60, lum, 0.55));
            R.setAttribute("stroke", ctx.hsl(210 + depth * 60, 70, lum + 20, 0.7));
          }
        }
      };
    },

    /* =================================================================
       SKETCH PACK: line-art that draws itself out of nothing, holds,
       then erases. "An animation of thinking." Uses ctx.sketch().
       think · ideate · contour
       ================================================================= */

    /* THINK: a geometric web sketched ring-by-ring from the inside out,
       holding, then dissolving at the rim as the centre redraws. */
    think: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "think",
        params: { rings: opts.rings || 5, spokes: opts.spokes || 12, speed: opts.speed || 1, spin: opts.spin || 1 },
        setup: function (ctx) {
          this.R = Math.max(2, this.params.rings | 0);
          this.S = Math.max(3, this.params.spokes | 0);
          this.lines = ctx.pool("path", this.R * this.S * 2, { fill: "none", "stroke-width": 1.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
          this.dots = ctx.pool("circle", this.R * this.S, { stroke: "none" });
          this.phase = 0;
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, cx = W / 2, cy = H / 2, t = s.t, dt = s.dt || 0.016;
          var R = this.R, S = this.S, maxR = ctx.min() * (0.44 + s.bass * 0.06);
          this.phase += dt * (0.12 + s.energy * 0.33) * this.params.speed;
          function pt(r, j) {
            var rad = (r + 1) / R * maxR, a = (j / S) * TAU + r * 0.28 + t * 0.04 * (1 + 0.4 * (r % 2 ? -1 : 1));
            return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
          }
          var li = 0, di = 0;
          for (var r = 0; r < R; r++) {
            for (var j = 0; j < S; j++) {
              var p0 = pt(r, j), p1 = pt(r, (j + 1) % S), life = this.phase - r * 0.14 - (j / S) * 0.05;
              var Lc = this.lines[li++];
              Lc.setAttribute("d", "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " L" + p1[0].toFixed(1) + " " + p1[1].toFixed(1));
              Lc.setAttribute("stroke", ctx.hsl(200 + r / R * 120 + t * 16 + s.treble * 60, 70, 64, 1));
              ctx.sketch(Lc, life, 0.38, 0.30);
              var inner = r === 0 ? [cx, cy] : pt(r - 1, j), Ls = this.lines[li++];
              Ls.setAttribute("d", "M" + inner[0].toFixed(1) + " " + inner[1].toFixed(1) + " L" + p0[0].toFixed(1) + " " + p0[1].toFixed(1));
              Ls.setAttribute("stroke", ctx.hsl(190 + r / R * 120 + t * 16, 60, 58, 0.9));
              ctx.sketch(Ls, life + 0.04, 0.34, 0.30);
              var lw = life - Math.floor(life), on = lw < 0.7 ? Math.min(1, lw * 6) : Math.max(0, 1 - (lw - 0.7) / 0.3), D = this.dots[di++];
              D.setAttribute("cx", p0[0].toFixed(1)); D.setAttribute("cy", p0[1].toFixed(1));
              D.setAttribute("r", (1.5 + on * 2).toFixed(2));
              D.setAttribute("fill", ctx.col(r)); D.setAttribute("opacity", (on * 0.9).toFixed(3));
            }
          }
        }
      };
    },

    /* IDEATE: a thought-graph on a golden spiral: nodes blink into being,
       links sketch between them, the cluster holds, then erases. */
    ideate: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "ideate",
        params: { nodes: opts.nodes || 16, speed: opts.speed || 1, link: opts.link || 2 },
        setup: function (ctx) {
          this.K = Math.max(3, this.params.nodes | 0);
          this.dots = ctx.pool("circle", this.K, { stroke: "none" });
          this.links = ctx.pool("path", this.K * 2, { fill: "none", "stroke-width": 1.1, "stroke-linecap": "round" });
          this.pos = []; this.phase = 0;
        },
        frame: function (ctx, s) {
          var self = this, W = ctx.W, H = ctx.H, cx = W / 2, cy = H / 2, t = s.t, dt = s.dt || 0.016, m = ctx.min();
          this.phase += dt * (0.10 + s.energy * 0.26) * this.params.speed;
          var K = this.K, GA = Math.PI * (3 - Math.sqrt(5));
          for (var i = 0; i < K; i++) {
            var rr = Math.sqrt((i + 0.5) / K) * m * 0.42, a = i * GA + t * 0.08;
            this.pos[i] = [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
          }
          var li = 0, step = Math.max(1, this.params.link | 0);
          for (var k = 0; k < K; k++) {
            var pa = this.pos[k], pb = this.pos[(k + step) % K], pc = this.pos[(k + 1) % K];
            var L = this.links[li++];
            L.setAttribute("d", "M" + pa[0].toFixed(1) + " " + pa[1].toFixed(1) + " L" + pb[0].toFixed(1) + " " + pb[1].toFixed(1));
            L.setAttribute("stroke", ctx.hsl(210 + (k / K) * 120 + t * 12, 60, 60, 0.8));
            ctx.sketch(L, self.phase - k * 0.05 + 0.1, 0.4, 0.3);
            var L2 = this.links[li++];
            L2.setAttribute("d", "M" + pa[0].toFixed(1) + " " + pa[1].toFixed(1) + " L" + pc[0].toFixed(1) + " " + pc[1].toFixed(1));
            L2.setAttribute("stroke", ctx.hsl(200 + (k / K) * 120, 55, 56, 0.6));
            ctx.sketch(L2, self.phase - k * 0.05 + 0.06, 0.4, 0.3);
          }
          for (i = 0; i < K; i++) {
            var lw = self.phase - i * 0.05; lw = lw - Math.floor(lw);
            var on = lw < 0.7 ? Math.min(1, lw * 6) : Math.max(0, 1 - (lw - 0.7) / 0.3), D = this.dots[i], p = this.pos[i];
            D.setAttribute("cx", p[0].toFixed(1)); D.setAttribute("cy", p[1].toFixed(1));
            D.setAttribute("r", (1.5 + on * 3 + s.onset * 1.5).toFixed(2));
            D.setAttribute("fill", ctx.col(i)); D.setAttribute("opacity", (on * 0.95).toFixed(3));
          }
        }
      };
    },

    /* CONTOUR: topographic rings emanating from the centre outward,
       each sketched on then erased as it expands. */
    contour: function (opts) {
      opts = opts || {};
      return {
        name: opts.name || "contour",
        params: { rings: opts.rings || 12, detail: opts.detail || 64, speed: opts.speed || 1, amp: opts.amp || 1 },
        setup: function (ctx) {
          this.R = Math.max(3, this.params.rings | 0);
          this.rings = ctx.pool("path", this.R, { fill: "none", "stroke-width": 1.4 });
          this.phase = 0;
        },
        frame: function (ctx, s) {
          var W = ctx.W, H = ctx.H, cx = W / 2, cy = H / 2, t = s.t, dt = s.dt || 0.016, nz = ctx.noise;
          var maxR = ctx.min() * 0.46, P = Math.max(8, this.params.detail | 0);
          this.phase += dt * (0.10 + s.energy * 0.28) * this.params.speed;
          for (var r = 0; r < this.R; r++) {
            var life = this.phase - r / this.R, grow = life - Math.floor(life);
            var rad = (0.06 + grow * 0.94) * maxR, amp = maxR * 0.06 * this.params.amp * (1 + s.bass * 0.6) * (1 - grow * 0.4);
            var d = "", j;
            for (j = 0; j <= P; j++) {
              var a = (j / P) * TAU, rr = rad + nz(Math.cos(a) * 1.5 + r, Math.sin(a) * 1.5 + t * 0.2) * amp;
              d += (j ? "L" : "M") + (cx + Math.cos(a) * rr).toFixed(1) + " " + (cy + Math.sin(a) * rr).toFixed(1) + " ";
            }
            var C = this.rings[r];
            C.setAttribute("d", d + "Z");
            C.setAttribute("stroke", ctx.hsl(180 + grow * 120 + t * 12 + s.treble * 50, 72, 62, 1));
            ctx.sketch(C, life, 0.42, 0.18);
          }
        }
      };
    }
  };

  /* =====================================================================
     DIRECTOR: cross-fades scenes along a timeline
     ===================================================================== */
  function makeDirector(app, story, mode, sceneDur, beatsPerScene) {
    return {
      story: story.slice(), mode: mode || "time", sceneDur: sceneDur || 12, beatsPerScene: beatsPerScene || 8,
      pos: 0, posTarget: 0, beatCount: 0, manual: false,
      go: function (name) { var idx = this.story.indexOf(name); if (idx >= 0) { this.manual = true; this.posTarget = idx; } },
      auto: function () { this.manual = false; },
      onBeat: function () { this.beatCount++; },
      update: function (s) {
        var len = this.story.length || 1;
        if (this.manual) { this.posTarget = this.posTarget; }
        else if (this.mode === "scroll") this.posTarget = s.scroll * (len - 1);
        else if (this.mode === "beat") this.posTarget = (this.beatCount / this.beatsPerScene) % len;
        else this.posTarget = (s.t / this.sceneDur) % len;
        // ease pos toward target (snappy for scroll, smooth otherwise)
        var k = this.mode === "scroll" ? 0.25 : Math.min(1, s.dt * 1.6);
        // shortest circular path for wrapping modes
        var diff = this.posTarget - this.pos;
        if (this.mode !== "scroll") { if (diff > len / 2) diff -= len; else if (diff < -len / 2) diff += len; }
        this.pos += diff * k;
        // assign opacities by triangular (circular) blend
        for (var i = 0; i < app._scenes.length; i++) {
          var sc = app._scenes[i], si = this.story.indexOf(sc.name), op = 0;
          if (si >= 0) { var dd = Math.abs(this.pos - si); if (this.mode !== "scroll") dd = Math.min(dd, len - dd); op = Math.max(0, 1 - dd); }
          sc._opacity = op;
        }
      }
    };
  }

  /* =====================================================================
     APP
     ===================================================================== */
  function create(opts) {
    opts = opts || {};
    var bandCount = opts.bands || 48, waveLen = opts.wave || 256;
    var app = {
      palette: (opts.palette || ["#f3a93c", "#5fe3d4", "#ff4f8b", "#9b7bff"]).slice(),
      W: 0, H: 0, enabled: true,
      _scenes: [], _inputs: [], _binds: [], _events: {}, _running: false,
      _noise: makeNoise(opts.seed || 1337), _rng: rng(opts.seed || 1337),
      bg: "#05060a", ink: "#ffffff", _mirrorN: 0,
      version: "1.0.0"
    };

    /* mount + root svg */
    var mount = typeof opts.mount === "string" ? (typeof document !== "undefined" ? document.querySelector(opts.mount) : null) : opts.mount;
    if (typeof document !== "undefined") {
      if (!mount) { mount = document.body; }
      var svg = el("svg", { xmlns: NS, preserveAspectRatio: "xMidYMid slice" });
      svg.style.cssText = "position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;";
      app.bg = opts.background || app.bg;
      app.ink = opts.ink || app.ink;
      svg.style.background = app.bg;
      create._n = (create._n || 0) + 1;
      var defs = el("defs", {}, svg);
      var wedge = el("clipPath", { id: "luma-wedge-" + create._n }, defs);
      var wedgePoly = el("polygon", { points: "0,0 0,0 0,0" }, wedge);
      var rootId = "luma-root-" + create._n;
      var root = el("g", { id: rootId }, svg); // all scene layers live here
      var mirror = el("g", {}, svg);           // kaleidoscope reflections (empty until enabled)
      mirror.style.display = "none";
      mount.appendChild(svg);
      app.svg = svg; app._root = root; app._mirror = mirror;
      app._wedgePoly = wedgePoly; app._wedgeId = "luma-wedge-" + create._n; app._rootId = rootId;
    }

    var signal = makeSignal(bandCount, waveLen);
    app.signal = signal;

    /* build scene layers + ctx */
    (opts.scenes || []).forEach(function (sc) {
      if (!sc || !sc.name) return;
      var layer = app._root ? el("g", { "data-scene": sc.name }, app._root) : null;
      if (layer) layer.style.opacity = "0";
      sc._layer = layer; sc._opacity = 0;
      sc._ctx = layer ? makeCtx(app, layer) : null;
      app._scenes.push(sc);
    });

    var story = opts.story && opts.story.length ? opts.story : app._scenes.map(function (s) { return s.name; });
    app.director = makeDirector(app, story, opts.storyMode, opts.sceneDur, opts.beatsPerScene);

    /* sizing */
    function resize() {
      if (!app.svg) { app.W = (typeof window !== "undefined" ? window.innerWidth : 1280); app.H = (typeof window !== "undefined" ? window.innerHeight : 720); return; }
      app.W = app.svg.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1280);
      app.H = app.svg.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 720);
      app.svg.setAttribute("viewBox", "0 0 " + app.W + " " + app.H);
      app._scenes.forEach(function (sc) { if (sc._ctx) { sc._ctx.W = app.W; sc._ctx.H = app.H; sc._ctx.cx = app.W / 2; sc._ctx.cy = app.H / 2; sc._ctx.ink = app.ink; sc._ctx.bg = app.bg; } if (sc.resize && sc._ctx) sc.resize(sc._ctx); });
      if (app._mirrorN) applyMirror(app._mirrorN);
    }
    function applyMirror(n) {
      app._mirrorN = n | 0;
      if (!app.svg || !app._mirror) return;
      var cx = app.W / 2, cy = app.H / 2, mir = app._mirror, root = app._root;
      while (mir.firstChild) mir.removeChild(mir.firstChild);
      if (app._mirrorN < 2) { root.removeAttribute("clip-path"); root.removeAttribute("transform"); mir.style.display = "none"; return; }
      mir.style.display = "";
      var seg = app._mirrorN, step = 360 / seg, R = Math.sqrt(app.W * app.W + app.H * app.H) * 1.2;
      var a0 = (-step / 2) * Math.PI / 180, a1 = (step / 2) * Math.PI / 180;
      app._wedgePoly.setAttribute("points",
        cx.toFixed(1) + "," + cy.toFixed(1) + " " +
        (cx + Math.cos(a0) * R).toFixed(1) + "," + (cy + Math.sin(a0) * R).toFixed(1) + " " +
        (cx + Math.cos(a1) * R).toFixed(1) + "," + (cy + Math.sin(a1) * R).toFixed(1));
      root.setAttribute("clip-path", "url(#" + app._wedgeId + ")");
      for (var k = 1; k < seg; k++) {
        var u = el("use", { transform: "rotate(" + (k * step).toFixed(3) + " " + cx + " " + cy + ")" }, mir);
        try { u.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + app._rootId); } catch (e) {}
        u.setAttribute("href", "#" + app._rootId);
      }
    }
    app.resize = resize;
    app.mirror = function (n) { applyMirror(n || 0); return app; };
    app.theme = function (mode) {
      var light = (mode === "light");
      app.bg = light ? "#f4f1ea" : "#05060a";
      app.ink = light ? "#0b0d12" : "#ffffff";
      if (app.svg) { app.svg.style.background = app.bg; app.svg.style.mixBlendMode = light ? "multiply" : "normal"; }
      resize();
      return app;
    };
    if (typeof ResizeObserver !== "undefined" && app.svg) { app._ro = new ResizeObserver(resize); app._ro.observe(app.svg); }
    else if (typeof window !== "undefined") { window.addEventListener("resize", resize); }
    resize();

    /* run scene setups now that sizes are known */
    app._scenes.forEach(function (sc) { if (sc.setup && sc._ctx) { try { sc.setup(sc._ctx); } catch (e) { if (global.console) console.warn("[cueVJ] setup", sc.name, e); } } });

    var RAF = (typeof requestAnimationFrame !== "undefined") ? requestAnimationFrame : function (cb) { return setTimeout(function () { cb(now()); }, 16); };
    var CAF = (typeof cancelAnimationFrame !== "undefined") ? cancelAnimationFrame : clearTimeout;
    var startT = 0, raf = 0;

    function emit(name, payload) { var l = app._events[name]; if (l) for (var i = 0; i < l.length; i++) l[i](payload, signal); }

    function tick(tNow) {
      if (!app._running) return;
      var elapsed = (tNow - startT) / 1000;
      signal.dt = Math.min(0.1, elapsed - signal.t); signal.t = elapsed; signal.frame++;
      // inputs feed the signal
      for (var i = 0; i < app._inputs.length; i++) { var src = app._inputs[i]; if (src.frame) { src._hasAudio = !!app._audioState; try { src.frame(signal, app); } catch (e) {} } }
      // beat event + director advance
      if (signal.onsetPulse) { app.director.onBeat(); emit("beat", signal.beat); }
      // declarative bindings
      for (i = 0; i < app._binds.length; i++) { var bd = app._binds[i]; try { bd.scene.params[bd.key] = bd.fn(signal); } catch (e) {} }
      // who is on screen
      var prevPos = app.director.pos | 0;
      app.director.update(signal);
      if ((app.director.pos | 0) !== prevPos) emit("scene", app.director.story[(app.director.pos | 0) % app.director.story.length]);
      // render visible scenes
      if (app.enabled) {
        for (i = 0; i < app._scenes.length; i++) {
          var sc = app._scenes[i];
          if (!sc._layer) continue;
          if (sc._opacity > 0.002) { sc._ctx.t = signal.t; try { sc.frame(sc._ctx, signal); } catch (e) {} sc._layer.style.opacity = sc._opacity.toFixed(3); sc._layer.style.display = ""; }
          else { sc._layer.style.display = "none"; }
        }
      }
      raf = RAF(tick);
    }

    /* public API */
    app.use = function (source) { if (!source) return app; app._inputs.push(source); if (app._running && source.start) { try { source.start(app); } catch (e) {} } return app; };
    app.remove = function (name) { app._inputs = app._inputs.filter(function (s) { if (s.name === name || s === name) { if (s.stop) try { s.stop(app); } catch (e) {} return false; } return true; }); return app; };
    app.useAudioMic = function () { var s = sources.audioMic(); app.use(s); return s.start ? Promise.resolve(s.start(app)) : Promise.resolve(); };
    app.useAudioFile = function (file) { app.remove("audio"); var s = sources.audioFile(file); app._inputs.push(s); return Promise.resolve(s.start(app)); };
    app.useAudioElement = function (mediaEl) { app.remove("audio"); var s = sources.audioElement(mediaEl); app._inputs.push(s); s.start(app); return s; };
    app.useMIDI = function () { var s = sources.midi(); app._inputs.push(s); return Promise.resolve(s.start(app)); };
    app.useScroll = function () { return app.use(sources.scroll()); };
    app.usePointer = function () { return app.use(sources.pointer()); };

    app.bind = function (target, fn) {
      var dot = target.indexOf("."), nm = target.slice(0, dot), key = target.slice(dot + 1);
      var sc = app._scenes.filter(function (s) { return s.name === nm; })[0];
      if (sc) app._binds.push({ scene: sc, key: key, fn: fn });
      return app;
    };
    app.scene = function (name) { app.director.go(name); return app; };
    app.story = function (arr, mode) { app.director.story = arr.slice(); if (mode) app.director.mode = mode; return app; };
    app.storyMode = function (mode) { app.director.mode = mode; return app; };
    app.cut = function (beats) { app.director.mode = "beat"; app.director.beatsPerScene = beats || 16; app.director.manual = false; return app; };
    app.paletteSet = function (arr) { app.palette = arr.slice(); app._scenes.forEach(function (s) { if (s._ctx) s._ctx.palette = arr.slice(); }); return app; };
    app.on = function (name, cb) { (app._events[name] = app._events[name] || []).push(cb); return app; };
    app.setEnabled = function (b) { app.enabled = !!b; if (!b && app._scenes) app._scenes.forEach(function (s) { if (s._layer) s._layer.style.opacity = "0"; }); return app; };
    app.getScene = function (name) { return app._scenes.filter(function (s) { return s.name === name; })[0]; };

    app.start = function () {
      if (app._running) return app;
      app._running = true;
      if (!app._inputs.length) app.use(sources.demo()); // never sit silent
      app._inputs.forEach(function (s) { if (s.start) try { s.start(app); } catch (e) {} });
      startT = now() - signal.t * 1000;
      raf = RAF(tick);
      return app;
    };
    app.stop = function () { app._running = false; if (raf) CAF(raf); return app; };
    app.destroy = function () { app.stop(); app._inputs.forEach(function (s) { if (s.stop) try { s.stop(app); } catch (e) {} }); if (app._ro) app._ro.disconnect(); if (app.svg && app.svg.parentNode) app.svg.parentNode.removeChild(app.svg); };

    if (opts.autostart) app.start();
    return app;
  }

  /* =====================================================================
     EXPORT
     ===================================================================== */
  var cueVJ = {
    version: "1.0.0",
    create: create,
    scenes: scenes,
    sources: sources,
    util: { clamp: clamp, lerp: lerp, mix: mix, rng: rng, makeNoise: makeNoise, el: el, hsl: hsl, TAU: TAU, poly: poly }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = cueVJ;
  /* the chrome/skin engine ships in this same file, so expose it as one namespace */
    if (global.__cueVJskin) { cueVJ.skin = global.__cueVJskin; try { delete global.__cueVJskin; } catch (e) { global.__cueVJskin = undefined; } }
    global.cueVJ = cueVJ;
})(typeof window !== "undefined" ? window : this);
