// Pulls current distance-from-Earth and speed for each tracked spacecraft
// from JPL's Horizons API, and merges it into the static fields (launched,
// status blurb, news) that already live in src/_data/spacecraft.json.
//
// Horizons API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
//
// NOTE: Horizons target IDs below are the commonly used ones for these
// spacecraft as of this writing — double check against
// https://ssd.jpl.nasa.gov/horizons/app.html#/ if any come back empty,
// naming/IDs occasionally shift.

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "spacecraft.json");

const TARGETS = [
  { name: "Voyager 1", horizonsId: "-31" },
  { name: "Voyager 2", horizonsId: "-32" },
  { name: "New Horizons", horizonsId: "-98" },
  { name: "Parker Solar Probe", horizonsId: "-96" },
];

const AU_KM = 149597870.7;

function horizonsUrl(id) {
  const params = new URLSearchParams({
    format: "json",
    COMMAND: `'${id}'`,
    OBJ_DATA: "NO",
    MAKE_EPHEM: "YES",
    EPHEM_TYPE: "OBSERVER",
    CENTER: "'500@399'", // geocentric — distance from Earth
    QUANTITIES: "'20,21'", // 20 = range & range-rate, 21 = range-rate
    START_TIME: "'now'",
    STOP_TIME: "'now+1d'",
    STEP_SIZE: "'1d'",
  });
  return `https://ssd-api.jpl.nasa.gov/horizons.api?${params.toString()}`;
}

function parseRangeAndRate(resultText) {
  // Data lines sit between $$SOE and $$EOE, columns are whitespace-separated:
  // date, range (AU), range-rate (km/s) roughly — verify against a sample
  // response if this stops matching.
  const soe = resultText.indexOf("$$SOE");
  const eoe = resultText.indexOf("$$EOE");
  if (soe === -1 || eoe === -1) return null;
  const block = resultText.slice(soe + 5, eoe).trim();
  const line = block.split("\n")[0];
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  // Last two numeric fields are typically range (AU) and range-rate (km/s)
  const nums = parts.filter((p) => /^-?\d+(\.\d+)?$/.test(p));
  if (nums.length < 2) return null;
  const rangeAu = parseFloat(nums[nums.length - 2]);
  const rangeRateKms = parseFloat(nums[nums.length - 1]);
  return { rangeAu, rangeRateKms };
}

async function fetchOne(target) {
  const res = await fetch(horizonsUrl(target.horizonsId));
  if (!res.ok) throw new Error(`Horizons returned ${res.status} for ${target.name}`);
  const data = await res.json();
  const parsed = parseRangeAndRate(data.result || "");
  if (!parsed) throw new Error(`Could not parse Horizons result for ${target.name}`);

  const lightSeconds = (parsed.rangeAu * AU_KM) / 299792.458;
  const hours = Math.floor(lightSeconds / 3600);
  const mins = Math.round((lightSeconds % 3600) / 60);

  return {
    name: target.name,
    distanceAu: Math.round(parsed.rangeAu * 10) / 10,
    lightTime: hours > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${mins}m`,
    speed: `${Math.abs(parsed.rangeRateKms).toFixed(1)} km/s`,
  };
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));

  const updates = await Promise.allSettled(TARGETS.map(fetchOne));

  const merged = existing.map((entry) => {
    const match = updates.find(
      (u, i) => u.status === "fulfilled" && TARGETS[i].name === entry.name
    );
    if (!match) return entry; // keep existing values if this one failed
    return { ...entry, ...match.value };
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2));
  const failed = updates.filter((u) => u.status === "rejected");
  if (failed.length) {
    console.warn(`${failed.length}/${TARGETS.length} spacecraft failed to update, kept old values for those.`);
  }
  console.log(`Wrote ${merged.length} spacecraft to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("fetch-spacecraft.js failed, leaving existing data in place:", err.message);
  process.exit(0);
});
