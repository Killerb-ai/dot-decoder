const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApp(source) {
  const nodes = new Map();
  const canvas = new Proxy({}, { get: (obj, key) => obj[key] ?? (() => {}) });
  function node() {
    const classes = new Set();
    return {
      value: '', textContent: '', innerHTML: '', disabled: false, style: {}, children: [],
      classList: { add: c => classes.add(c), remove: c => classes.delete(c),
        contains: c => classes.has(c), toggle: c => classes.has(c) ? classes.delete(c) : classes.add(c) },
      listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; },
      appendChild(child) { this.children.push(child); },
      setAttribute() {}, getContext: () => canvas,
    };
  }
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    createElement: node,
  };
  const html = source || fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const match of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g)) {
    document.getElementById(match[1]).value = match[2];
  }
  const timers = [];
  const sandbox = vm.createContext({ document, console, setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout(id) { timers[id - 1] = null; }, alert() {} });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], sandbox);
  return { run: code => vm.runInContext(code, sandbox), sandbox, nodes,
    flush() { for (const fn of timers.splice(0)) if (fn) fn(); } };
}

module.exports = { loadApp };
