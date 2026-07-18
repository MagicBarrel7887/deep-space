// Pulls current DSN dish status and writes src/_data/dsn.json.
//
// Feed schema confirmed against russss/pydsn (an open-source parser for
// this exact feed): dishes are <dish name="DSS14" azimuthAngle="..."
// elevationAngle="..." windSpeed="..." isMSPA="..." isArray="..." isDDOR="...">
// containing nested <target name="VGR1" id="31" uplegRange="..."
// downlegRange="..." rtlt="..."/> and <upSignal>/<downSignal
// spacecraft="..." signalType="..." power="..." frequency="..."
// dataRate="..."/> child elements. A target named "DSN" means the dish
// is idle/out of service.
//
// Correct feed domain is eyes.jpl.nasa.gov (NOT eyes.nasa.gov, which was
// wrong in an earlier version of this script).

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "dsn.json");
const CONFIG_URL = "https://eyes.jpl.nasa.gov/dsn/config.xml";
const dsnUrl = () => `https://eyes.jpl.nasa.gov/dsn/data/dsn.xml?r=${Math.floor(Date.now() / 5000)}`;

const DISH_INFO = {
  DSS13: { site: "Goldstone", diameter: "34m" },
  DSS14: { site: "Goldstone", diameter: "70m" },
  DSS15: { site: "Goldstone", diameter: "34m" },
  DSS24: { site: "Goldstone", diameter: "34m" },
  DSS25: { site: "Goldstone", diameter: "34m" },
  DSS26: { site: "Goldstone", diameter: "34m" },
  DSS27: { site: "Goldstone", diameter: "34m" },
  DSS34: { site: "Canberra", diameter: "34m" },
  DSS35: { site: "Canberra", diameter: "34m" },
  DSS36: { site: "Canberra", diameter: "34m" },
  DSS43: { site: "Canberra", diameter: "70m" },
  DSS45: { site: "Canberra", diameter: "34m" },
  DSS54: { site: "Madrid", diameter: "34m" },
  DSS55: { site: "Madrid", diameter: "34m" },
  DSS56: { site: "Madrid", diameter: "34m" },
  DSS63: { site: "Madrid", diameter: "70m" },
  DSS65: { site: "Madrid", diameter: "34m" },
};

function getAttrs(tagInner) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tagInner)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

function extractSelfClosing(xml, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*)\\/>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(getAttrs(m[1]));
  return out;
}

function bandFromFrequencyHz(freq) {
  const f = Number(freq);
  if (!f) return null;
  if (f >= 2.5e10) return "Ka";
  if (f >= 7e9) return "X";
  if (f >= 2e9) return "S";
  return null;
}

function formatDataRate(bps) {
  const n = Number(bps);
  if (!n || n <= 0) return null;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} Mbps`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kbps`;
  return `${Math.round(n)} bps`;
}

function formatRtlt(seconds) {
  const s = Number(seconds);
  if (!s || s <= 0) return null;
  const hours = Math.floor(s / 3600);
  const mins = Math.round((s % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
}

async function fetchSpacecraftNames() {
  console.log(`Fetching spacecraft name map from ${CONFIG_URL} ...`);
  try {
    const res = await fetch(CONFIG_URL);
    if (!res.ok) {
      console.warn(`config.xml returned HTTP ${res.status} — will show raw target codes instead of friendly names`);
      return {};
    }
    const xml = await res.text();
    const map = {};
    extractSelfClosing(xml, "spacecraft").forEach((attrs) => {
      if (attrs.name) map[attrs.name] = attrs.friendlyName || attrs.name;
    });
    console.log(`Got ${Object.keys(map).length} spacecraft names from config.xml`);
    return map;
  } catch (err) {
    console.warn(`config.xml fetch threw (${err.message}) — will show raw target codes instead of friendly names`);
    return {};
  }
}

async function main() {
  console.log(`Fetching DSN status from ${dsnUrl()} ...`);
  const [dsnRes, nameMap] = await Promise.all([
    fetch(dsnUrl(), { headers: { "User-Agent": "deep-space-dashboard/1.0" } }),
    fetchSpacecraftNames(),
  ]);
  if (!dsnRes.ok) throw new Error(`DSN feed returned ${dsnRes.status}`);
  const xml = await dsnRes.text();
  console.log(`DSN feed responded OK, ${xml.length} bytes, parsing dish blocks...`);

  const dishBlockRe = /<dish\b([^>]*)>([\s\S]*?)<\/dish>/g;
  const results = [];
  let unknownDishIds = [];
  let m;
  while ((m = dishBlockRe.exec(xml)) !== null) {
    const dishAttrs = getAttrs(m[1]);
    const body = m[2];
    const id = dishAttrs.name; // e.g. "DSS14"
    if (!id) continue;
    const info = DISH_INFO[id];
    if (!info) unknownDishIds.push(id);
    const resolvedInfo = info || { site: "Unknown", diameter: "?" };

    const targets = extractSelfClosing(body, "target").filter((t) => t.name && t.name !== "DSN" && t.name !== "DSS");
    const downSignals = extractSelfClosing(body, "downSignal");

    if (targets.length === 0) {
      results.push({
        id: id.replace("DSS", "DSS-"),
        site: resolvedInfo.site,
        diameter: resolvedInfo.diameter,
        target: "—",
        band: "—",
        status: "idle",
        note: "no active target in feed right now",
      });
      continue;
    }

    const target = targets[0];
    const friendly = nameMap[target.name] || target.name;
    const signal = downSignals.find(
      (s) => s.spacecraft === target.name && s.signalType && s.signalType !== "none"
    );

    results.push({
      id: id.replace("DSS", "DSS-"),
      site: resolvedInfo.site,
      diameter: resolvedInfo.diameter,
      target: friendly,
      band: signal ? bandFromFrequencyHz(signal.frequency) || "—" : "—",
      status: "active",
      signalType: signal ? signal.signalType : null, // "data", "carrier", or "ranging"
      dataRate: signal ? formatDataRate(signal.dataRate) : null,
      rtlt: formatRtlt(target.rtlt), // round-trip light time — how long a signal takes there and back
    });
  }

  if (unknownDishIds.length > 0) {
    console.warn(`Dish IDs not in DISH_INFO lookup table (shown as "Unknown"): ${unknownDishIds.join(", ")} — add these to DISH_INFO if they keep appearing`);
  }

  if (results.length === 0) throw new Error("Parsed zero dishes from DSN feed — check feed format");

  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} dishes to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("fetch-dsn.js failed, leaving existing data in place:", err.message);
  process.exit(0);
});