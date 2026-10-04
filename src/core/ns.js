/* Patch Notes - core namespace, math helpers, deterministic RNG, formatting.
   Plain classic script: no modules, no build step, runs from file://          */
var PN = (function () {
  'use strict';

  var U = {};

  /* ---------------------------------------------------------- math ------ */
  U.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  U.clamp01 = function (v) { return U.clamp(v, 0, 1); };
  U.clamp100 = function (v) { return U.clamp(v, 0, 100); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.inv = function (v, lo, hi) { return hi === lo ? 0 : (v - lo) / (hi - lo); };
  U.round = function (v, dp) { var m = Math.pow(10, dp || 0); return Math.round(v * m) / m; };

  /* Smooth saturating curve: 0 -> 0, k -> ~0.63, infinity -> 1. Used
     everywhere we want "more helps, but with diminishing returns".         */
  U.saturate = function (v, k) { return k <= 0 ? 0 : 1 - Math.exp(-Math.max(0, v) / k); };

  /* Logistic. Midpoint m, steepness s. */
  U.sigmoid = function (v, m, s) { return 1 / (1 + Math.exp(-(v - m) / (s || 1))); };

  U.sum = function (arr, fn) {
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += fn ? fn(arr[i], i) : arr[i];
    return t;
  };
  U.avg = function (arr, fn) { return arr.length ? U.sum(arr, fn) / arr.length : 0; };
  U.mean = U.avg;

  U.weightedAvg = function (arr, valFn, wFn) {
    var tw = 0, tv = 0;
    for (var i = 0; i < arr.length; i++) {
      var w = wFn(arr[i], i); tw += w; tv += valFn(arr[i], i) * w;
    }
    return tw > 0 ? tv / tw : 0;
  };

  U.stdev = function (arr, fn) {
    if (arr.length < 2) return 0;
    var m = U.avg(arr, fn), t = 0;
    for (var i = 0; i < arr.length; i++) { var d = (fn ? fn(arr[i], i) : arr[i]) - m; t += d * d; }
    return Math.sqrt(t / arr.length);
  };

  /* Gini coefficient - used for class representation skew and wealth spread */
  U.gini = function (values) {
    var v = values.slice().sort(function (a, b) { return a - b; });
    var n = v.length; if (n === 0) return 0;
    var total = U.sum(v); if (total === 0) return 0;
    var cum = 0;
    for (var i = 0; i < n; i++) cum += (i + 1) * v[i];
    return (2 * cum) / (n * total) - (n + 1) / n;
  };

  /* --------------------------------------------------- deterministic RNG */
  /* mulberry32 - small, fast, good enough, fully reproducible from a seed. */
  U.Rng = function (seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  };
  U.Rng.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    var t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  U.Rng.prototype.range = function (lo, hi) { return lo + this.next() * (hi - lo); };
  U.Rng.prototype.int = function (lo, hi) { return Math.floor(this.range(lo, hi + 1)); };
  U.Rng.prototype.chance = function (p) { return this.next() < p; };
  U.Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  U.Rng.prototype.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  /* Box-Muller normal, clamped to +/- 3 sigma so nothing goes insane. */
  U.Rng.prototype.normal = function (mean, sd) {
    var u = 1 - this.next(), v = this.next();
    var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + U.clamp(z, -3, 3) * sd;
  };
  U.Rng.prototype.weighted = function (items, wFn) {
    var total = U.sum(items, wFn); if (total <= 0) return items[0];
    var r = this.next() * total;
    for (var i = 0; i < items.length; i++) { r -= wFn(items[i], i); if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };

  /* ------------------------------------------------------------ objects - */
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ------------------------------------------------------------ memoise -
     Several design-wide numbers - the top item level, how much crafting
     exists, what share of the catalogue is tradeable - are read once per
     agent per week and are expensive to recompute. They are also derived
     purely from the design, so they can be cached against it.

     Caching on object identity alone goes stale the moment somebody edits
     an item, because the design object is mutated in place. So the cache
     is keyed on the design AND a revision counter that every edit bumps:
     stale answers are impossible, and a tick that touches nothing pays
     for one computation instead of thousands.                          */
  U.designRev = function (design) {
    return design && design.__rev ? design.__rev : 0;
  };
  U.bumpDesign = function (design) {
    if (design) design.__rev = (design.__rev || 0) + 1;
  };
  U.memoDesign = function (fn) {
    /* Eight slots. The draft and the shipped design were always both
       live at once; a roadmap adds one design per planned release -
       what the game looks like before it and after it - and four slots
       thrashed the moment a producer had three releases on the board. */
    var slots = [];
    return function (design) {
      var rev = U.designRev(design);
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].d === design && slots[i].r === rev) return slots[i].v;
      }
      var v = fn(design);
      slots.push({ d: design, r: rev, v: v });
      if (slots.length > 8) slots.shift();
      return v;
    };
  };

  U.merge = function (base, over) {
    var out = U.clone(base);
    (function walk(a, b) {
      for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) {
        if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) &&
            a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) walk(a[k], b[k]);
        else a[k] = b[k] && typeof b[k] === 'object' ? U.clone(b[k]) : b[k];
      }
    })(out, over || {});
    return out;
  };

  var _idc = 0;
  U.id = function (prefix) { _idc++; return (prefix || 'id') + '_' + _idc.toString(36) + Date.now().toString(36).slice(-4); };

  U.byId = function (arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  };
  U.indexById = function (arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return i;
    return -1;
  };
  U.removeById = function (arr, id) {
    var i = U.indexById(arr, id); if (i >= 0) arr.splice(i, 1); return arr;
  };
  U.keys = function (o) { return Object.keys(o || {}); };
  U.values = function (o) { return U.keys(o).map(function (k) { return o[k]; }); };
  U.mapObj = function (o, fn) {
    var out = {}; U.keys(o).forEach(function (k) { out[k] = fn(o[k], k); }); return out;
  };

  /* ------------------------------------------------------------ format -- */
  U.fmtInt = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  U.fmtCompact = function (n) {
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e9) return s + U.round(a / 1e9, 2) + 'B';
    if (a >= 1e6) return s + U.round(a / 1e6, 2) + 'M';
    if (a >= 1e3) return s + U.round(a / 1e3, 1) + 'K';
    return s + U.round(a, 0);
  };
  /* Sizes on disk, where the unit is the point - a save is not "9.1M"
     characters to somebody deciding whether it will fit. */
  U.fmtBytes = function (n) {
    var a = Math.abs(n || 0);
    if (a >= 1073741824) return U.round(a / 1073741824, 2) + ' GB';
    if (a >= 1048576) return U.round(a / 1048576, 1) + ' MB';
    if (a >= 1024) return U.round(a / 1024, 0) + ' KB';
    return Math.round(a) + ' B';
  };
  U.fmtMoney = function (n) { return (n < 0 ? '-$' : '$') + U.fmtCompact(Math.abs(n)); };
  U.fmtMoneyFull = function (n) { return (n < 0 ? '-$' : '$') + U.fmtInt(Math.abs(n)); };
  /* Small money, where the cents are the whole story - a weekly figure
     per player is pennies, and rounding it to dollars hides the model. */
  U.fmtCents = function (n) {
    var s = Math.abs(n) < 10 ? Math.abs(n).toFixed(2) : U.fmtInt(Math.abs(n));
    return (n < 0 ? "-$" : "$") + s;
  };
  U.fmtPct = function (n, dp) { return U.round(n, dp === undefined ? 1 : dp) + '%'; };
  /* "2nd", not "2th". Small, but it is the difference between a
     sentence that was written and one that was concatenated. */
  U.ordinal = function (n) {
    n = Math.round(n);
    var r100 = Math.abs(n) % 100, r10 = Math.abs(n) % 10;
    return n + ((r100 >= 11 && r100 <= 13) ? 'th'
      : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th');
  };
  U.fmtSigned = function (n, dp) { var v = U.round(n, dp === undefined ? 1 : dp); return (v > 0 ? '+' : '') + v; };
  /* "a, b and c" - for notes written out of a list of what shipped. */
  U.listJoin = function (arr) {
    var a = (arr || []).filter(function (x) { return x !== null && x !== undefined && x !== ""; });
    if (!a.length) return "";
    if (a.length === 1) return String(a[0]);
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  };

  /* Week index -> in-fiction date label. Week 0 is the campaign start. */
  U.weekLabel = function (week, startYear) {
    var y = (startYear || 2004) + Math.floor(week / 52);
    var w = (week % 52) + 1;
    return 'Y' + (Math.floor(week / 52) + 1) + ' W' + w + '  ·  ' + y;
  };
  U.weekToQuarter = function (week) { return 'Q' + (Math.floor((week % 52) / 13) + 1); };

  U.slug = function (s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };
  U.titleCase = function (s) {
    return String(s).replace(/[_-]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  };

  /* ------------------------------------------------------------ events -- */
  function Bus() { this.h = {}; }
  Bus.prototype.on = function (ev, fn) {
    (this.h[ev] = this.h[ev] || []).push(fn);
    return this;
  };
  Bus.prototype.off = function (ev, fn) {
    if (!this.h[ev]) return this;
    this.h[ev] = this.h[ev].filter(function (f) { return f !== fn; });
    return this;
  };
  Bus.prototype.emit = function (ev, payload) {
    var list = (this.h[ev] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload); }
      catch (e) { if (typeof console !== 'undefined') console.error('[bus:' + ev + ']', e); }
    }
    return this;
  };

  return { util: U, Bus: Bus, bus: new Bus(), version: '0.1.0' };
})();
