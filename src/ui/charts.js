/* Patch Notes - charts. Hand-rolled SVG, no dependencies.              */
(function (PN) {
  'use strict';
  var U = PN.util;

  var PALETTE = ['#5fb3ff', '#5fd6a0', '#ffc861', '#b79cff', '#ff8fc4',
                 '#52d9d0', '#ff7565', '#9db4d0', '#d4b483', '#7ee081'];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var n = v / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  /* series: [{name, color, data:[numbers], fmt}]  x is index-based.     */
  function line(series, opts) {
    opts = opts || {};
    var W = opts.width || 760, H = opts.height || 190;
    var padL = opts.padL === undefined ? 48 : opts.padL, padR = 10, padT = 10, padB = 22;
    var n = 0;
    series.forEach(function (s) { n = Math.max(n, s.data.length); });
    if (n < 2) return '<div class="faint small center" style="padding:28px">Not enough data yet.</div>';

    var lo = 0, hi = 0;
    series.forEach(function (s) {
      s.data.forEach(function (v) { if (isFinite(v)) { hi = Math.max(hi, v); lo = Math.min(lo, v); } });
    });
    if (opts.max !== undefined) hi = opts.max;
    if (opts.min !== undefined) lo = opts.min;
    if (hi === lo) hi = lo + 1;
    if (lo >= 0) { hi = niceMax(hi); lo = 0; }

    var iw = W - padL - padR, ih = H - padT - padB;
    var X = function (i) { return padL + (i / (n - 1)) * iw; };
    var Y = function (v) { return padT + ih - ((v - lo) / (hi - lo)) * ih; };
    var fmt = opts.fmt || U.fmtCompact;

    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">';
    /* grid */
    for (var g = 0; g <= 4; g++) {
      var v = lo + (hi - lo) * (g / 4), y = Y(v);
      out += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) +
             '" y2="' + y.toFixed(1) + '" stroke="#1f242f" stroke-width="1"/>';
      out += '<text x="' + (padL - 7) + '" y="' + (y + 3.5).toFixed(1) +
             '" fill="#626b80" font-size="9.5" text-anchor="end" font-family="ui-monospace,monospace">' +
             fmt(v) + '</text>';
    }
    /* zero line if we cross it */
    if (lo < 0 && hi > 0) {
      out += '<line x1="' + padL + '" y1="' + Y(0).toFixed(1) + '" x2="' + (W - padR) +
             '" y2="' + Y(0).toFixed(1) + '" stroke="#3a4256" stroke-width="1"/>';
    }

    series.forEach(function (s, si) {
      var col = s.color || PALETTE[si % PALETTE.length];
      var d = '', area = '', started = false;
      s.data.forEach(function (v, i) {
        if (!isFinite(v)) return;
        var x = X(i).toFixed(1), y = Y(v).toFixed(1);
        d += (started ? 'L' : 'M') + x + ' ' + y;
        started = true;
      });
      if (!started) return;
      if (opts.fill !== false && series.length === 1) {
        area = d + 'L' + X(s.data.length - 1).toFixed(1) + ' ' + Y(lo).toFixed(1) +
               'L' + X(0).toFixed(1) + ' ' + Y(lo).toFixed(1) + 'Z';
        out += '<path d="' + area + '" fill="' + col + '" opacity="0.10"/>';
      }
      out += '<path d="' + d + '" fill="none" stroke="' + col +
             '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
    });

    /* x labels */
    if (opts.xLabels) {
      [0, Math.floor((n - 1) / 2), n - 1].forEach(function (i, k) {
        out += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) +
               '" fill="#626b80" font-size="9.5" text-anchor="' +
               (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') +
               '" font-family="ui-monospace,monospace">' + esc(opts.xLabels(i)) + '</text>';
      });
    }
    out += '</svg>';

    if (opts.legend !== false && series.length > 1) {
      out += '<div class="legend">' + series.map(function (s, si) {
        return '<span><i style="background:' + (s.color || PALETTE[si % PALETTE.length]) + '"></i>' +
               esc(s.name) + '</span>';
      }).join('') + '</div>';
    }
    return '<div class="chartbox">' + out + '</div>';
  }

  /* Horizontal bars: [{name, value, color, note}] scaled to max.        */
  function bars(items, opts) {
    opts = opts || {};
    var max = opts.max !== undefined ? opts.max
            : Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); }).concat([1]));
    var fmt = opts.fmt || function (v) { return U.round(v, 1); };
    return '<div>' + items.map(function (it, i) {
      var pct = max > 0 ? U.clamp01(Math.abs(it.value) / max) * 100 : 0;
      var col = it.color || PALETTE[i % PALETTE.length];
      return '<div style="display:grid;grid-template-columns:minmax(0,' + (opts.labelW || 130) +
        'px) minmax(0,1fr) 52px;gap:9px;align-items:center;padding:3px 0">' +
        '<div class="small" style="color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          esc(it.name) + '">' + esc(it.name) + '</div>' +
        '<div class="bar"><i style="width:' + pct.toFixed(1) + '%;background:' + col + '"></i></div>' +
        '<div class="mono small right">' + fmt(it.value) + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* Radar for the ten need axes. values/ideals are {axisId: 0-100}.     */
  function radar(axisIds, values, ideals, opts) {
    opts = opts || {};
    var size = opts.size || 250, cx = size / 2, cy = size / 2, R = size / 2 - 34;
    var n = axisIds.length;
    var pt = function (i, r) {
      var a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    var out = '<svg viewBox="0 0 ' + size + ' ' + size + '" role="img">';
    /* rings */
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var pts = [];
      for (var i = 0; i < n; i++) { var p = pt(i, R * f); pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1)); }
      out += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="#1f242f" stroke-width="1"/>';
    });
    for (var i = 0; i < n; i++) {
      var p = pt(i, R);
      out += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) +
             '" stroke="#1f242f" stroke-width="1"/>';
    }
    /* ideal shape */
    if (ideals) {
      var ip = [];
      for (var j = 0; j < n; j++) {
        var q = pt(j, R * U.clamp01((ideals[axisIds[j]] || 0) / 100));
        ip.push(q[0].toFixed(1) + ',' + q[1].toFixed(1));
      }
      out += '<polygon points="' + ip.join(' ') + '" fill="none" stroke="#ff8fc4" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.8"/>';
    }
    /* actual shape */
    var vp = [];
    for (var k = 0; k < n; k++) {
      var r = pt(k, R * U.clamp01((values[axisIds[k]] || 0) / 100));
      vp.push(r[0].toFixed(1) + ',' + r[1].toFixed(1));
    }
    out += '<polygon points="' + vp.join(' ') + '" fill="#5fb3ff" fill-opacity="0.17" stroke="#5fb3ff" stroke-width="1.9"/>';
    /* labels */
    for (var m = 0; m < n; m++) {
      var lp = pt(m, R + 17);
      var anchor = lp[0] > cx + 4 ? 'start' : lp[0] < cx - 4 ? 'end' : 'middle';
      out += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 3).toFixed(1) + '" fill="#939cb1" font-size="9.5" text-anchor="' +
             anchor + '">' + esc(PN.tax.AXIS_BY_ID[axisIds[m]].name) + '</text>';
    }
    out += '</svg>';
    return '<div class="chartbox">' + out + '</div>';
  }

  /* Tiny inline trend line. */
  function spark(data, opts) {
    opts = opts || {};
    if (!data || data.length < 2) return '';
    var W = opts.width || 90, H = opts.height || 22;
    var lo = Math.min.apply(null, data), hi = Math.max.apply(null, data);
    if (hi === lo) hi = lo + 1;
    var d = data.map(function (v, i) {
      return (i ? 'L' : 'M') + ((i / (data.length - 1)) * W).toFixed(1) + ' ' +
             (H - ((v - lo) / (hi - lo)) * H).toFixed(1);
    }).join('');
    var col = opts.color || (data[data.length - 1] >= data[0] ? '#5fd6a0' : '#ff7565');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'px;height:' + H +
      'px;display:inline-block;vertical-align:middle"><path d="' + d + '" fill="none" stroke="' +
      col + '" stroke-width="1.5"/></svg>';
  }

  /* Stacked composition bar: [{name, value, color}] */
  function stack(items, opts) {
    opts = opts || {};
    var total = U.sum(items, function (i) { return Math.max(0, i.value); });
    if (total <= 0) return '<div class="bar"></div>';
    var out = '<div style="display:flex;height:' + (opts.height || 9) +
      'px;border-radius:5px;overflow:hidden;background:var(--panel-3)">';
    items.forEach(function (it, i) {
      var pct = (Math.max(0, it.value) / total) * 100;
      if (pct < 0.2) return;
      out += '<div title="' + esc(it.name) + ': ' + U.fmtPct(pct) + '" style="width:' + pct.toFixed(2) +
        '%;background:' + (it.color || PALETTE[i % PALETTE.length]) + '"></div>';
    });
    return out + '</div>';
  }

  PN.chart = { line: line, bars: bars, radar: radar, spark: spark, stack: stack,
               PALETTE: PALETTE, esc: esc };
})(PN);
