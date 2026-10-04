/* Load the sim (everything but the UI) into Node, so the roadmap, the
   economy and a live week can be measured without a browser in the way.
   Same file list and same order as the bundler. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const BS = String.fromCharCode(92);

const ORDER = fs.readFileSync(path.join(root, 'tools', 'build.ps1'), 'utf8')
  .split(/\r?\n/)
  .map(l => (l.match(/^\s*'(src[^']+)'/) || [])[1])
  .filter(Boolean)
  .map(p => p.split(BS).join('/'));

function load(opts) {
  opts = opts || {};
  const files = ORDER.filter(f => opts.ui ? true : !/^src\/ui\//.test(f));
  const sandbox = { console, Math, Date, JSON, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    try { vm.runInContext(src, sandbox, { filename: f }); }
    catch (e) { throw new Error(f + ': ' + e.message); }
  }
  return sandbox;
}

module.exports = { load, ORDER };
