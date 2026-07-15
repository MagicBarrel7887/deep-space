// Pulls current DSN dish status from the public DSN Now feed and writes
// src/_data/dsn.json in the same shape the template expects.
//
// DSN Now publishes a live XML feed at:
//   https://eyes.nasa.gov/dsn/data/dsn.xml
//
// That feed's exact field names can shift, so this script is written
// defensively: if the fetch or parse fails for any reason, it leaves
// the existing src/_data/dsn.json alone rather than breaking the build.

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "dsn.json");
const FEED_URL = "https://eyes.nasa.gov/dsn/data/dsn.xml";

// Known dish -> site/diameter lookup, since the feed gives dish IDs but not
// this metadata directly. Extend as needed if new dishes come online.
const DISH_INFO = {
  "DSS14": { site: "Goldstone", diameter: "70m" },
  "DSS24": { site: "Goldstone", diameter: "34m" },
  "DSS25": { site: "Goldstone", diameter: "34m" },
  "DSS26": { site: "Goldstone", diameter: "34m" },
  "DSS34": { site: "Canberra", diameter: "34m" },
  "DSS35": { site: "Canberra", diameter: "34m" },
  "DSS36": { site: "Canberra", diameter: "34m" },
  "DSS43": { site: "Canberra", diameter: "70m" },
  "DSS54": { site: "Madrid", diameter: "34m" },
  "DSS55": { site: "Madrid", diameter: "34m" },
  "DSS56": { site: "Madrid", diameter: "34m" },
  "DSS63": { site: "Madrid", diameter: "70m" },
};

function extractTagAttrs(xml, tag) {
  // Minimal attribute-only XML reader — avoids pulling in a full XML
  // dependency for a handful of self-closing tags.
  const re = new RegExp(`<${tag}\\b([^>]*)\\/?>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrStr = m[1];
    const attrs = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let am;
    while ((am = attrRe.exec(attrStr)) !== null) {
      attrs[am[1]] = am[2];
    }
    out.push(attrs);
  }
  return out;
}

async function main() {
  const res = await fetch(FEED_URL, { headers: { "User-Agent": "deep-space-dashboard/1.0" } });
  if (!res.ok) throw new Error(`DSN feed returned ${res.status}`);
  const xml = await res.text();

  const dishes = extractTagAttrs(xml, "dish");
  const targets = extractTagAttrs(xml, "target"); // nested per-dish in the real feed; treated leniently here

  const result = dishes.map((d) => {
    const id = (d.name || "").toUpperCase();
    const info = DISH_INFO[id] || { site: "Unknown", diameter: "?" };
    const isDown = d.isMSPA === "false" && d.isArray === "false" && !d.downSince === false;
    return {
      id: id.replace("DSS", "DSS-"),
      site: info.site,
      diameter: info.diameter,
      target: d.target || "—",
      band: d.band || "—",
      status: d.target ? "active" : "idle",
      note: d.target ? undefined : "no scheduled pass in feed",
    };
  });

  if (result.length === 0) throw new Error("Parsed zero dishes from DSN feed — check feed format");

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(`Wrote ${result.length} dishes to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("fetch-dsn.js failed, leaving existing data in place:", err.message);
  // Exit 0 so a flaky feed doesn't fail the whole pipeline — the build
  // will just use whatever src/_data/dsn.json already has committed.
  process.exit(0);
});
