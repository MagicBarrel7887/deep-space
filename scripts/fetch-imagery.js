// Pulls NASA APOD and the latest Mars rover photo, DOWNLOADS the actual
// image bytes into src/img/, and points imagery.json at the local file
// (e.g. "/img/apod.jpg") instead of NASA's own URL. Hotlinking their URLs
// directly wasn't loading reliably on the live site — likely hotlink/CORS
// protection on their image hosts — so storing a local copy each run is
// more reliable, especially for something running unattended on signage.
//
// GOES/Himawari Earth imagery and JWST/Hubble releases don't have one clean
// "latest image" JSON endpoint, so those two slots stay manually curated —
// update STATIC_EXTRAS below when you want to swap them, and drop a matching
// image into src/img/ by hand.

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "src", "_data", "imagery.json");
const IMG_DIR = path.join(__dirname, "..", "src", "img");
const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";

const STATIC_EXTRAS = [
  { tag: "EARTH", title: "Full Disk — GOES-19", caption: "Western hemisphere, visible band" },
  { tag: "JUPITER", title: "JWST NIRCam", caption: "Great Red Spot region, near-infrared composite" },
];

function extFromContentType(ct) {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("webp")) return "webp";
  return "jpg";
}

async function downloadImage(url, baseName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed (${res.status}): ${url}`);
  const contentType = res.headers.get("content-type") || "";
  const ext = extFromContentType(contentType);
  const buf = Buffer.from(await res.arrayBuffer());
  const filename = `${baseName}.${ext}`;
  fs.mkdirSync(IMG_DIR, { recursive: true });
  fs.writeFileSync(path.join(IMG_DIR, filename), buf);
  return `/img/${filename}`;
}

async function fetchApod() {
  const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`);
  if (!res.ok) throw new Error(`APOD API returned ${res.status}`);
  const data = await res.json();
  if (data.media_type !== "image") throw new Error("APOD today is a video, not an image — skipping");
  const localUrl = await downloadImage(data.url, "apod");
  return {
    tag: "APOD",
    title: data.title,
    caption: (data.explanation || "").split(".")[0] + ".",
    url: localUrl,
  };
}

async function fetchLatestRoverPhoto() {
  // Perseverance first, fall back to Curiosity — this is a community-maintained
  // API (not run by NASA directly) with occasional reliability hiccups on
  // individual rover endpoints.
  for (const rover of ["perseverance", "curiosity"]) {
    try {
      const res = await fetch(
        `https://rovers.nebulum.one/api/v1/rovers/${rover}/latest_photos`
      );
      if (!res.ok) {
        console.warn(`Mars Photos API (${rover}) returned ${res.status}, trying next rover if any`);
        continue;
      }
      const data = await res.json();
      const photo = (data.latest_photos || [])[0];
      if (!photo) {
        console.warn(`No photos returned for ${rover}, trying next rover if any`);
        continue;
      }
      const localUrl = await downloadImage(photo.img_src, "mars-latest");
      return {
        tag: `MARS · SOL ${photo.sol}`,
        title: `${rover[0].toUpperCase()}${rover.slice(1)} — ${photo.camera.full_name}`,
        caption: `${photo.rover.name === "Perseverance" ? "Jezero Crater" : "Gale Crater"}, ${photo.earth_date}`,
        url: localUrl,
      };
    } catch (err) {
      console.warn(`${rover} fetch threw: ${err.message}, trying next rover if any`);
    }
  }
  throw new Error("All rover endpoints failed");
}

async function main() {
  const results = await Promise.allSettled([fetchApod(), fetchLatestRoverPhoto()]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const label = i === 0 ? "APOD" : "Mars rover photo";
      console.warn(`FAILED — ${label}: ${r.reason.message}`);
    }
  });

  const live = results.filter((r) => r.status === "fulfilled").map((r) => r.value);

  if (live.length === 0) {
    console.warn("Both APOD and rover photo fetches failed, keeping existing imagery.json");
    return;
  }

  const merged = [...live, ...STATIC_EXTRAS];
  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${merged.length} imagery entries to ${OUT_PATH} (${live.length} with freshly downloaded local images)`);
}

main().catch((err) => {
  console.error("fetch-imagery.js failed, leaving existing data in place:", err.message);
  process.exit(0);
});