// Pulls current ISS lat/lon and writes src/_data/iss.json.
// Uses the free wheretheiss.at API (no key required).
// Docs: https://wheretheiss.at/w/developer

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "iss.json");
const URL = "https://api.wheretheiss.at/v1/satellites/25544";

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`ISS API returned ${res.status}`);
  const data = await res.json();

  if (typeof data.latitude !== "number" || typeof data.longitude !== "number") {
    throw new Error("ISS API response missing lat/lon");
  }

  const out = {
    lat: Math.round(data.latitude * 10) / 10,
    lon: Math.round(data.longitude * 10) / 10,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`Wrote ISS position to ${OUT_PATH}:`, out);
}

main().catch((err) => {
  console.error("fetch-iss.js failed, leaving existing data in place:", err.message);
  process.exit(0);
});
