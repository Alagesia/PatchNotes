/* Patch Notes - where a save actually lives.

   A finished game is not small. Two thousand simulated players, each
   carrying gear, bags, a purse and an opinion of you, is megabytes -
   and localStorage caps out around five of them, per origin, forever.
   No permission raises that cap: "persistent storage" is a promise the
   browser will not EVICT your data, not a bigger drawer.

   IndexedDB is the bigger drawer. It is handed a share of the disk -
   typically gigabytes - and the persistence permission then stops the
   browser reclaiming it when space runs short. So saves go there, and
   localStorage stays as the fallback for the file:// case where some
   browsers refuse IndexedDB an origin to open a database against.

   Everything here is callbacks rather than promises, because that is
   the idiom the rest of this codebase is written in.                */
(function (PN) {
  'use strict';

  var DB_NAME = 'patchnotes';
  var STORE = 'saves';
  var DB_VERSION = 1;

  var db = null;
  var backend = 'unknown';        /* indexeddb | localstorage | none */
  var opening = false;
  var waiting = [];

  function settle(name) {
    backend = name;
    opening = false;
    var list = waiting; waiting = [];
    list.forEach(function (fn) { fn(name); });
  }

  /* Open the database once; everybody who asked while it was opening
     gets the answer when it arrives. */
  function open(done) {
    done = done || function () {};
    if (backend !== 'unknown') return done(backend);
    waiting.push(done);
    if (opening) return;
    opening = true;

    var idb = null;
    try { idb = window.indexedDB; } catch (e) { idb = null; }
    if (!idb) return settle(hasLocal() ? 'localstorage' : 'none');

    var req;
    try { req = idb.open(DB_NAME, DB_VERSION); }
    catch (e) { return settle(hasLocal() ? 'localstorage' : 'none'); }

    /* A database that never answers is a database that is not there.
       Private windows and opaque file:// origins both do this. */
    var timer = setTimeout(function () {
      if (opening) settle(hasLocal() ? 'localstorage' : 'none');
    }, 4000);

    req.onupgradeneeded = function () {
      var d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = function () {
      clearTimeout(timer);
      if (!opening) { try { req.result.close(); } catch (e) {} return; }
      db = req.result;
      settle('indexeddb');
    };
    req.onerror = req.onblocked = function () {
      clearTimeout(timer);
      if (opening) settle(hasLocal() ? 'localstorage' : 'none');
    };
  }

  function hasLocal() {
    try { window.localStorage.setItem('__pn', '1');
          window.localStorage.removeItem('__pn'); return true; }
    catch (e) { return false; }
  }

  /* ------------------------------------------------------------ read -- */

  function get(key, done) {
    done = done || function () {};
    open(function (kind) {
      if (kind === 'indexeddb') {
        var tx, req;
        try {
          tx = db.transaction(STORE, 'readonly');
          req = tx.objectStore(STORE).get(key);
        } catch (e) { return done(localGet(key)); }
        req.onsuccess = function () {
          /* Nothing in the new drawer? Look in the old one - this is how
             a save written before any of this existed still opens. */
          var v = req.result;
          done(v === undefined || v === null ? localGet(key) : v);
        };
        req.onerror = function () { done(localGet(key)); };
        return;
      }
      done(kind === 'localstorage' ? localGet(key) : null);
    });
  }

  function localGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  /* ----------------------------------------------------------- write -- */

  /* done({ ok, backend, bytes, reason }). Bytes is what was written, so
     the caller can tell the player how big their game has got. */
  function set(key, value, done) {
    done = done || function () {};
    var bytes = value ? value.length : 0;
    open(function (kind) {
      if (kind === 'indexeddb') {
        var tx;
        try {
          tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
        } catch (e) {
          return done({ ok: false, backend: kind, bytes: bytes, reason: e.message });
        }
        tx.oncomplete = function () {
          /* The save now lives in IndexedDB, so the old localStorage copy
             is a stale duplicate eating the 5MB anybody else needs. */
          try { window.localStorage.removeItem(key); } catch (e) {}
          done({ ok: true, backend: kind, bytes: bytes });
        };
        tx.onerror = tx.onabort = function () {
          var err = tx.error || {};
          done({ ok: false, backend: kind, bytes: bytes,
                 quota: err.name === 'QuotaExceededError',
                 reason: err.message || 'the browser refused the write' });
        };
        return;
      }
      if (kind === 'localstorage') {
        try {
          window.localStorage.setItem(key, value);
          return done({ ok: true, backend: kind, bytes: bytes });
        } catch (e) {
          return done({ ok: false, backend: kind, bytes: bytes,
                        quota: e.name === 'QuotaExceededError',
                        reason: e.message });
        }
      }
      done({ ok: false, backend: 'none', bytes: bytes,
             reason: 'this browser will not let the page store anything' });
    });
  }

  function del(key, done) {
    done = done || function () {};
    try { window.localStorage.removeItem(key); } catch (e) {}
    open(function (kind) {
      if (kind !== 'indexeddb') return done(true);
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE)['delete'](key);
        tx.oncomplete = function () { done(true); };
        tx.onerror = function () { done(false); };
      } catch (e) { done(false); }
    });
  }

  /* ------------------------------------------------------------ room -- */

  /* How much room there is, and whether the browser has promised to keep
     what is in it. done({ supported, quota, usage, persisted }). */
  function estimate(done) {
    done = done || function () {};
    var s = navigator.storage;
    if (!s || !s.estimate) {
      return done({ supported: false, quota: 0, usage: 0, persisted: false });
    }
    s.estimate().then(function (est) {
      var out = { supported: true, quota: est.quota || 0, usage: est.usage || 0,
                  persisted: false };
      if (!s.persisted) return done(out);
      s.persisted().then(function (p) { out.persisted = !!p; done(out); },
                         function () { done(out); });
    }, function () {
      done({ supported: false, quota: 0, usage: 0, persisted: false });
    });
  }

  /* Ask the browser not to throw the save away when the disk fills up.
     Chrome grants this silently on a site the user actually uses;
     Firefox shows a prompt. Either way it does not make the drawer
     bigger, it stops somebody else emptying it.                     */
  function persist(done) {
    done = done || function () {};
    var s = navigator.storage;
    if (!s || !s.persist) return done(false);
    var finish = function (v) { done(!!v); };
    if (s.persisted) {
      s.persisted().then(function (already) {
        if (already) return done(true);
        s.persist().then(finish, function () { done(false); });
      }, function () { s.persist().then(finish, function () { done(false); }); });
      return;
    }
    s.persist().then(finish, function () { done(false); });
  }

  PN.store = {
    open: open, get: get, set: set, del: del,
    estimate: estimate, persist: persist,
    backend: function () { return backend; },
    LIMITS: { localStorage: 5 * 1024 * 1024 }
  };
})(PN);
