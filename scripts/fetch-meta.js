// Writes the current UTC timestamp to src/_data/meta.json. Run this LAST
// in the fetch chain (see package.json) so it reflects when this whole
// batch of data finished updating, not when it started.
//
// The client (main.js) reads this to show a freshness indicator: pulsing
// red right after a fetch, settling to normal once things are a few
// minutes old, and switching to a distinct "stale" color plus an elapsed
// time counter if too long has passed since the last successful update
// (e.g. the CI schedule stopped running, or every recent run failed
// outright before reaching this step).

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "meta.json");

const out = { lastUpdated: new Date().toISOString() };
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`Wrote build timestamp to ${OUT_PATH}: ${out.lastUpdated}`);
