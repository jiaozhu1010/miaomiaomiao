const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

const sw = read('sw.js');
const packageJson = JSON.parse(read('package.json'));

assert(
    !sw.includes("'/server.js'") && !sw.includes('"/server.js"'),
    'service worker must not precache blocked server source files'
);
assert(
    !sw.includes("'/tools.html'") && !sw.includes('"/tools.html"') &&
    !sw.includes("'/knowledge.html'") && !sw.includes('"/knowledge.html"'),
    'service worker must not precache legacy redirect URLs'
);
assert(
    /request\.mode === 'navigate'/.test(sw) &&
    /networkFirstPage\(event\.request\)/.test(sw) &&
    /function\s+networkFirstPage\s*\(\s*request\s*\)[\s\S]*fetch\(request\)/.test(sw),
    'service worker must use a network-first path for page navigations'
);
assert(
    !Object.prototype.hasOwnProperty.call(packageJson.dependencies || {}, 'compression'),
    'package.json must not keep unused compression dependency'
);

const weatherEntries = fs.readdirSync(path.join(root, 'lib', 'weather'));
const invalidWeatherEntries = weatherEntries.filter(name => !/^(?:w\d+|\d{2}[dn])\.png$/.test(name));
assert.deepStrictEqual(
    invalidWeatherEntries,
    [],
    'lib/weather must contain only weather icon PNG assets'
);

console.log('project hygiene checks passed');
