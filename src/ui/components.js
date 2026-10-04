/* Patch Notes - UI components.
   Views render HTML strings; controls declare a data-bind path into the
   game state and app.js wires them up with one delegated listener.      */
(function (PN) {
  'use strict';
  var U = PN.util, esc = PN.chart.esc;

  /* -------------------------------------------------------- path access */
  function get(root, path) {
    var parts = String(path).split('.'), o = root;
    for (var i = 0; i < parts.length && o != null; i++) o = o[parts[i]];
    return o;
  }
  function set(root, path, value) {
    var parts = String(path).split('.'), o = root;
    for (var i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }

  /* ------------------------------------------------------------ widgets */

  /* A slider AND a number box, both bound to the same value. Drag for
     feel, type for precision.                                          */
  function slider(o) {
    var v = o.value;
    var step = o.step || 1;
    var min = o.min || 0;
    var max = o.max === undefined ? 100 : o.max;
    var raw = U.round(v, step < 1 ? 2 : 0);
    var shown = o.fmt ? o.fmt(v) : '';
    var bind = esc(o.path);
    return '<div class="field">' +
      '<label><span class="name">' + esc(o.label) + '</span>' +
      '<span class="spacer"></span>' +
      (shown ? '<span class="valfmt">' + esc(shown) + '</span>' : '') +
      '<input class="valnum" type="number" data-bind="' + bind + '" data-kind="num"' +
        ' min="' + min + '" max="' + max + '" step="' + step + '" value="' + raw + '">' +
      '</label>' +
      '<input type="range" data-bind="' + bind + '" data-kind="num"' +
      ' min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '">' +
      (o.desc ? '<div class="desc">' + esc(o.desc) + '</div>' : '') +
      '</div>';
  }

  function select(o) {
    var opts = o.options.map(function (x) {
      var id = x.id !== undefined ? x.id : x.value;
      var nm = x.name !== undefined ? x.name : x.label;
      return '<option value="' + esc(id) + '"' + (id === o.value ? ' selected' : '') + '>' +
             esc(nm) + '</option>';
    }).join('');
    var current = null;
    o.options.forEach(function (x) { if ((x.id !== undefined ? x.id : x.value) === o.value) current = x; });
    var desc = o.desc || (current && current.desc) || '';
    return '<div class="field">' +
      '<label><span class="name">' + esc(o.label) + '</span></label>' +
      '<select data-bind="' + esc(o.path) + '" data-kind="str">' + opts + '</select>' +
      (desc ? '<div class="desc">' + esc(desc) + '</div>' : '') +
      '</div>';
  }

  function toggle(o) {
    return '<div class="field" style="margin-bottom:9px">' +
      '<div class="toggle' + (o.value ? ' on' : '') + '" data-bind="' + esc(o.path) + '" data-kind="bool">' +
      '<span class="box"></span><span class="lbl">' + esc(o.label) + '</span></div>' +
      (o.desc ? '<div class="desc" style="margin-left:43px">' + esc(o.desc) + '</div>' : '') +
      '</div>';
  }

  function number(o) {
    return '<div class="field">' +
      '<label><span class="name">' + esc(o.label) + '</span></label>' +
      '<input type="number" data-bind="' + esc(o.path) + '" data-kind="num" value="' + o.value +
      '"' + (o.min !== undefined ? ' min="' + o.min + '"' : '') +
      (o.max !== undefined ? ' max="' + o.max + '"' : '') +
      (o.step !== undefined ? ' step="' + o.step + '"' : '') + '>' +
      (o.desc ? '<div class="desc">' + esc(o.desc) + '</div>' : '') + '</div>';
  }

  function text(o) {
    return '<div class="field">' +
      '<label><span class="name">' + esc(o.label) + '</span></label>' +
      '<input type="text" data-bind="' + esc(o.path) + '" data-kind="str" value="' + esc(o.value || '') + '">' +
      (o.desc ? '<div class="desc">' + esc(o.desc) + '</div>' : '') + '</div>';
  }

  /* An inline range + typed box for the controls that dispatch an action
     instead of binding a state path. Same rule as slider(): every single
     number in this game must be typeable, not just draggable.          */
  function rangeAct(o) {
    var min = o.min === undefined ? 0 : o.min;
    var max = o.max === undefined ? 100 : o.max;
    var step = o.step || 1;
    var v = o.value;
    var act = esc(o.act), val = esc(String(o.val === undefined ? '' : o.val));
    return '<div class="rowact' + (o.cls ? ' ' + o.cls : '') + '">' +
      '<span class="faint tiny rowact-k"' + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' +
        esc(o.label) + '</span>' +
      '<input type="range" min="' + min + '" max="' + max + '" step="' + step +
        '" value="' + v + '" data-act="' + act + '" data-val="' + val + '">' +
      '<input class="valnum" type="number" min="' + min + '" max="' + max + '" step="' + step +
        '" value="' + U.round(v, step < 1 ? 2 : 0) + '" data-act="' + act + '" data-val="' + val + '">' +
      (o.suffix ? '<span class="faint tiny rowact-s">' + esc(o.suffix) + '</span>' : '') +
      '</div>';
  }

  /* ------------------------------------------------------------- layout */

  function panel(title, body, o) {
    o = o || {};
    return '<div class="panel' + (o.cls ? ' ' + o.cls : '') + '"' +
      (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' +
      (title !== null ? '<header><h2>' + esc(title) + '</h2>' +
        (o.hint ? '<span class="hint">' + esc(o.hint) + '</span>' : '') +
        '<span class="spacer"></span>' + (o.actions || '') + '</header>' : '') +
      '<div class="body' + (o.tight ? ' tight' : '') + '">' + body + '</div></div>';
  }

  function stat(k, v, d, cls) {
    return '<div class="stat"><div class="k">' + esc(k) + '</div>' +
      '<div class="v' + (cls ? ' ' + cls : '') + '">' + v + '</div>' +
      (d ? '<div class="d">' + d + '</div>' : '') + '</div>';
  }

  function chip(label, cls, attrs) {
    return '<span class="chip' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '>' + esc(label) + '</span>';
  }

  function tabs(items, current, act) {
    return '<div class="tabs">' + items.map(function (t) {
      return '<button data-act="' + esc(act) + '" data-val="' + esc(t.id) + '"' +
        (t.id === current ? ' class="on"' : '') + '>' + esc(t.name) +
        (t.badge ? ' <span class="faint mono tiny">' + esc(t.badge) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  /* Follow a player. The same control on the leaderboard, in the
     players table and on the character sheet, because it is the same
     decision in all three places. */
  function favStar(id, on, big) {
    return '<span class="favstar' + (on ? ' on' : '') + (big ? ' big' : '') +
      '" data-act="player.fav" data-val="' + esc(String(id)) + '" title="' +
      (on ? 'Following - click to stop' : 'Follow this player') + '">' +
      (on ? '★' : '☆') + '</span>';
  }

  function empty(msg, sub) {
    return '<div class="center faint" style="padding:34px 18px">' +
      '<div style="font-size:13px">' + esc(msg) + '</div>' +
      (sub ? '<div class="tiny" style="margin-top:6px;max-width:420px;margin-left:auto;margin-right:auto;line-height:1.6">' +
        esc(sub) + '</div>' : '') + '</div>';
  }

  /* Colour for a 0-100 quality score. */
  function scoreColour(v) {
    return v >= 72 ? 'var(--good)' : v >= 48 ? 'var(--warn)' : 'var(--bad)';
  }
  function scoreClass(v) { return v >= 72 ? 'good' : v >= 48 ? 'warn' : 'bad'; }

  /* One need-axis row with its ideal marker, clickable for the breakdown. */
  function axisRow(axisId, value, ideal, opts) {
    opts = opts || {};
    var def = PN.tax.AXIS_BY_ID[axisId];
    var col = opts.color || (ideal === undefined ? 'var(--accent)'
      : value >= ideal - 8 ? 'var(--good)' : value >= ideal - 22 ? 'var(--warn)' : 'var(--bad)');
    return '<div class="axisrow"' + (opts.act ? ' data-act="' + esc(opts.act) + '" data-val="' + esc(axisId) + '"' : '') + '>' +
      '<div class="nm">' + esc(def.name) + '</div>' +
      '<div class="track"><i style="width:' + U.clamp(value, 0, 100).toFixed(1) + '%;background:' + col + '"></i>' +
      (ideal !== undefined ? '<span class="ideal" style="left:' + U.clamp(ideal, 0, 100).toFixed(1) + '%"></span>' : '') +
      '</div>' +
      '<div class="num">' + Math.round(value) + '</div></div>';
  }

  /* Contribution list used by the causal-chain view. */
  function parts(list, limit) {
    var arr = (list || []).slice(0, limit || 10);
    if (!arr.length) return '<div class="faint small">Nothing contributing.</div>';
    var max = Math.max.apply(null, arr.map(function (p) { return Math.abs(p.delta); }).concat([1]));
    return '<div>' + arr.map(function (p) {
      var w = (Math.abs(p.delta) / max) * 100;
      var pos = p.delta > 0;
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) 92px 48px;gap:10px;align-items:center;padding:3px 0">' +
        '<div class="small" style="color:var(--dim)">' + esc(p.label) + '</div>' +
        '<div class="bar" style="background:var(--panel-3)"><i style="width:' + w.toFixed(1) +
          '%;background:' + (pos ? 'var(--good)' : 'var(--bad)') + '"></i></div>' +
        '<div class="mono small right ' + (pos ? 'good' : 'bad') + '">' + U.fmtSigned(p.delta) + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* Modal plumbing -------------------------------------------------------*/
  var modalHost = null;
  function modal(o) {
    close();
    modalHost = document.createElement('div');
    modalHost.className = 'modalwrap';
    modalHost.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '">' +
      '<header><h2>' + esc(o.title) + '</h2>' +
      (o.sub ? '<div class="sub">' + esc(o.sub) + '</div>' : '') + '</header>' +
      '<div class="body">' + o.body + '</div>' +
      (o.footer === null ? '' : '<footer>' + (o.footer ||
        '<button data-act="modal.close">Close</button>') + '</footer>') +
      '</div>';
    document.body.appendChild(modalHost);
    if (o.dismissable !== false) {
      modalHost.addEventListener('click', function (e) { if (e.target === modalHost) close(); });
    }
    if (o.onMount) o.onMount(modalHost);
    return modalHost;
  }
  function close() {
    if (modalHost && modalHost.parentNode) modalHost.parentNode.removeChild(modalHost);
    modalHost = null;
  }

  /* Floating tooltip ---------------------------------------------------- */
  var tipEl = null;
  function showTip(html, x, y) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tipbox';
      document.body.appendChild(tipEl);
    }
    tipEl.innerHTML = html;
    tipEl.style.display = 'block';
    var r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.min(x + 14, window.innerWidth - r.width - 12) + 'px';
    tipEl.style.top = Math.min(y + 14, window.innerHeight - r.height - 12) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  PN.ui = {
    get: get, set: set, esc: esc,
    slider: slider, select: select, toggle: toggle, number: number, text: text,
    rangeAct: rangeAct,
    panel: panel, stat: stat, chip: chip, tabs: tabs, empty: empty,
    favStar: favStar,
    axisRow: axisRow, parts: parts, scoreColour: scoreColour, scoreClass: scoreClass,
    modal: modal, closeModal: close, showTip: showTip, hideTip: hideTip
  };
})(PN);
