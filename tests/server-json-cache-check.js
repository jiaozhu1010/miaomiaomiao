const assert = require('assert');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

assert(
    /function\s+readJSONCached\s*\(/.test(server),
    'server.js must expose a cached JSON reader for large read-mostly data files'
);
assert(
    /function\s+invalidateJSONCache\s*\(/.test(server),
    'server.js must expose JSON cache invalidation'
);
assert(
    /invalidateJSONCache\(file\)/.test(server),
    'writeJSON must invalidate cached JSON after writes'
);

const performanceSensitiveRoutes = [
    /app\.get\('\/api\/admin\/stats'[\s\S]*?readJSONCached\(KNOWLEDGE_FILE/,
    /app\.get\('\/api\/wiki\/categories'[\s\S]*?readJSONCached\(KNOWLEDGE_FILE/,
    /app\.get\('\/api\/wiki\/tags'[\s\S]*?readJSONCached\(KNOWLEDGE_FILE/,
    /app\.get\('\/api\/wiki'[\s\S]*?readJSONCached\(KNOWLEDGE_FILE/,
];

for (const routePattern of performanceSensitiveRoutes) {
    assert(routePattern.test(server), 'read-only knowledge routes must use readJSONCached');
}

console.log('server json cache checks passed');
