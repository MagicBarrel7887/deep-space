// Pulls NASA APOD (needs a free API key from api.nasa.gov) and the latest
// Mars rover photo (Perseverance, no key required for this endpoint at
// low volume — swap in your own NASA API key via env var for reliability).
//
// GOES/Himawari Earth imagery and JWST/Hubble releases don't have one clean
// "latest image" JSON endpoint the way APOD/rover photos do, so those two
// imagery slots stay manually curated for now — update the STATIC_EXTRAS
// list below when you want to swap them.

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "imagery.json");
const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";

const STATIC_EXTRAS = [
  { tag: "EARTH", title: "Full Disk — GOES-19", caption: "Western hemisphere, visible band" },
  { tag: "JUPITER", title: "JWST NIRCam", caption: "Great Red Spot region, near-infrared composite" },
];

async function fetchApod() {
  const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`);
  if (!res.ok) throw new Error(`APOD API returned ${res.status}`);
  const data = await res.json();
  return {
    tag: "APOD",
    title: data.title,
    caption: (data.explanation || "").split(".")[0] + ".",
    url: data.url,
  };
}

async function fetchLatestRoverPhoto() {
  // Mars Photos API (also under api.nasa.gov)
  const res = await fetch(
    `https://api.nasa.gov/mars-photos/api/v1/rovers/perseverance/latest_photos?api_key=${NASA_API_KEY}`
  );
  if (!res.ok) throw new Error(`Mars Photos API returned ${res.status}`);
  const data = await res.json();
  const photo = (data.latest_photos || [])[0];
  if (!photo) throw new Error("No rover photos returned");
  return {
    tag: `MARS · SOL ${photo.sol}`,
    title: `Perseverance — ${photo.camera.full_name}`,
    caption: `Jezero Crater, ${photo.earth_date}`,
    url: photo.img_src,
  };
}

async function main() {
  const results = await Promise.allSettled([fetchApod(), fetchLatestRoverPhoto()]);
  const live = results.filter((r) => r.status === "fulfilled").map((r) => r.value);

  if (live.length === 0) {
    console.warn("Both APOD and rover photo fetches failed, keeping existing imagery.json");
    return;
  }

  const merged = [...live, ...STATIC_EXTRAS];
  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${merged.length} imagery entries to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("fetch-imagery.js failed, leaving existing data in place:", err.message);
  process.exit(0);
});
