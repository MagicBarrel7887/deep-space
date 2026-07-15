// Mission/celestial events don't have one clean unified API, so this script
// keeps a manually-curated list as the base (edit MANUAL_EVENTS below as
// things come up) and just re-writes it with any that have passed removed.
// If you find a good events feed later (e.g. JPL's close-approach API for
// asteroids), this is the place to wire it in.

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "events.json");

// Edit this list directly to add/update events. Keep dates roughly sorted.
const MANUAL_EVENTS = [
  { date: "Jul 18", label: "Europa Clipper — Mars gravity assist trajectory check" },
  { date: "Jul 24", label: "Asteroid 2026 JF1 close approach, 0.03 AU" },
  { date: "Aug 02", label: "Perseid meteor shower peak" },
  { date: "Aug 09", label: "New Horizons KBO candidate observation window" },
];

async function fetchAsteroidCloseApproaches() {
  // JPL's Close Approach Data API — no key required.
  // Docs: https://ssd-api.jpl.nasa.gov/doc/cad.html
  try {
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const today = new Date();
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const res = await fetch(
      `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${fmt(today)}&date-max=${fmt(in30Days)}&dist-max=0.05&sort=date`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.data) return [];
    return data.data.slice(0, 3).map((row) => {
      // fields per data.fields: des, orbit_id, jd, cd (calendar date), dist, ...
      const fields = data.fields;
      const rec = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
      const dateStr = (rec.cd || "").split(" ")[0]; // e.g. "2026-Jul-24"
      const parts = dateStr.split("-");
      const shortDate = parts.length === 3 ? `${parts[1]} ${parts[2]}` : dateStr;
      return {
        date: shortDate,
        label: `Asteroid ${rec.des} close approach, ${parseFloat(rec.dist).toFixed(2)} AU`,
      };
    });
  } catch {
    return [];
  }
}

async function main() {
  const live = await fetchAsteroidCloseApproaches();
  // Merge: manual entries that aren't asteroid close-approaches, plus fresh live ones
  const manualNonAsteroid = MANUAL_EVENTS.filter((e) => !e.label.startsWith("Asteroid"));
  const merged = [...manualNonAsteroid, ...live]
    .slice(0, 6);

  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${merged.length} events to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("fetch-events.js failed, leaving existing data in place:", err.message);
  process.exit(0);
});