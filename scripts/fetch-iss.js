// Pulls current ISS lat/lon and writes src/_data/iss.json.
// Primary: wheretheiss.at (no key required). Falls back to Open Notify if
// the primary fails for any reason (DNS blip, outage, etc.) — both are
// small free community-run APIs, so having a backup avoids losing this
// panel's data over a single provider hiccup.

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "iss.json");

async function fromWhereTheIss() {
  console.log("Trying wheretheiss.at ...");
  const res = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
  if (!res.ok) throw new Error(`wheretheiss.at returned HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data.latitude !== "number" || typeof data.longitude !== "number") {
    throw new Error(`wheretheiss.at response missing lat/lon. Got keys: ${Object.keys(data).join(", ")}`);
  }
  return { lat: data.latitude, lon: data.longitude };
}

async function fromOpenNotify() {
  console.log("Trying open-notify.org fallback ...");
  const res = await fetch("http://api.open-notify.org/iss-now.json");
  if (!res.ok) throw new Error(`open-notify returned HTTP ${res.status}`);
  const data = await res.json();
  const pos = data.iss_position;
  if (!pos || !pos.latitude || !pos.longitude) {
    throw new Error(`open-notify response missing lat/lon. Got: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { lat: parseFloat(pos.latitude), lon: parseFloat(pos.longitude) };
}

async function main() {
  let result;
  try {
    result = await fromWhereTheIss();
    console.log("wheretheiss.at succeeded");
  } catch (err) {
    console.warn(`wheretheiss.at failed: ${err.message}`);
    result = await fromOpenNotify();
    console.log("open-notify fallback succeeded");
  }

  const out = {
    lat: Math.round(result.lat * 10) / 10,
    lon: Math.round(result.lon * 10) / 10,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`Wrote ISS position to ${OUT_PATH}:`, out);
}

main().catch((err) => {
  console.error("fetch-iss.js failed (both providers), leaving existing data in place:", err.message);
  process.exit(0);
});