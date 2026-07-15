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
    QUANTITIES: "'20'", // range (delta, AU) & range-rate (deldot, km/s)
    CSV_FORMAT: "YES",
    START_TIME: "'now'",
    STOP_TIME: "'now+1d'",
    STEP_SIZE: "'1d'",
  });
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`;
}

function parseRangeAndRate(resultText) {
  // With CSV_FORMAT=YES, data lines between $$SOE and $$EOE are comma-separated:
  // date, delta (AU), deldot (km/s), possibly trailing empty fields.
  const soe = resultText.indexOf("$$SOE");
  const eoe = resultText.indexOf("$$EOE");
  if (soe === -1 || eoe === -1) return null;
  const block = resultText.slice(soe + 5, eoe).trim();
  const line = block.split("\n")[0];
  if (!line) return null;
  const cells = line.split(",").map((c) => c.trim());
  const nums = cells.filter((c) => /^-?\d+(\.\d+)?$/.test(c)).map(Number);
  if (nums.length < 2) return null;
  const rangeAu = nums[0];
  const rangeRateKms = nums[1];
  return { rangeAu, rangeRateKms };
}

async function fetchOne(target) {
  const res = await fetch(horizonsUrl(target.horizonsId));
  const raw = await res.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${target.name}: non-JSON response (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`${target.name}: HTTP ${res.status} — ${data.message || JSON.stringify(data).slice(0, 200)}`);
  }
  if (data.error) {
    throw new Error(`${target.name}: Horizons error — ${data.error}`);
  }

  const parsed = parseRangeAndRate(data.result || "");
  if (!parsed) {
    throw new Error(`${target.name}: could not find $$SOE/$$EOE data block. First 300 chars: ${(data.result || "").slice(0, 300)}`);
  }

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

  updates.forEach((u, i) => {
    if (u.status === "rejected") {
      console.warn(`FAILED — ${TARGETS[i].name}: ${u.reason.message}`);
    }
  });

  const merged = existing.map((entry) => {
    const idx = TARGETS.findIndex((t) => t.name === entry.name);
    const match = updates[idx];
    if (!match || match.status !== "fulfilled") return entry; // keep existing values if this one failed
    return { ...entry, ...match.value };
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2));
  const failedCount = updates.filter((u) => u.status === "rejected").length;
  if (failedCount) {
    console.warn(`${failedCount}/${TARGETS.length} spacecraft failed to update, kept old values for those (see FAILED lines above for why).`);
  }
  console.log(`Wrote ${merged.length} spacecraft to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("fetch-spacecraft.js failed, leaving existing data in place:", err.message);
  process.exit(0);
});