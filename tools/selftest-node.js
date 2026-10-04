/* Run the self test in Node.

   It is the same script the browser page runs - extracted from
   tools/selftest.html and given the two browser things it touches, a
   `document.getElementById().innerHTML` to write into and a `window`
   that is already the sandbox. Polling a browser tab for a quarter of
   an hour becomes one command that can be piped, which is the
   difference between running the suite after every change and running
   it at the end. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { load } = require('./nodeload.js');
const root = path.resolve(__dirname, '..');
const NL = String.fromCharCode(10);

const html = fs.readFileSync(path.join(root, 'tools', 'selftest.html'), 'utf8');
const open = html.indexOf('<script>');
const shut = html.lastIndexOf('</script>');
if (open < 0 || shut < 0) { console.error('no script in selftest.html'); process.exit(2); }
const script = html.slice(open + '<script>'.length, shut);

const w = load();
const out = { innerHTML: '' };
w.document = { getElementById: function () { return out; } };

const t0 = Date.now();
/* Watch it run. Seventeen minutes of nothing is indistinguishable
   from a hang, and one of those is worth knowing about. */
if (process.argv.indexOf('--quiet') < 0) {
  var lastAt = t0;
  w.PN.onSection = function (name) {
    var now = Date.now();
    process.stderr.write('  [' + ((now - t0) / 1000).toFixed(0) + 's +' +
      ((now - lastAt) / 1000).toFixed(0) + 's] ' + name + NL);
    lastAt = now;
  };
}
try { vm.runInContext(script, w, { filename: 'selftest.html' }); }
catch (e) { console.error('THREW: ' + e.stack); process.exit(2); }

const text = out.innerHTML
  .split('<h2').join(NL + NL + '<h2')
  .split('<div').join(NL + '<div')
  .replace(/<h2[^>]*>/g, '== ')
  .replace(/<div class="bad">/g, '  >> ')
  .replace(/<div[^>]*>/g, '     ')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const r = w.__RESULT__ || { checks: 0, fails: 1 };
const only = process.argv.indexOf('--failures') >= 0;
text.split(NL).forEach(function (l) {
  if (!l.trim()) return;
  if (!only || /^(==|\s*>>)/.test(l)) console.log(l);
});

console.log(NL + (r.fails ? r.fails + ' FAILURES' : 'ALL PASS') +
            '  (' + r.checks + ' checks, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
process.exit(r.fails ? 1 : 0);
