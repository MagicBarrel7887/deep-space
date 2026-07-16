// Pulls NASA APOD and the latest Mars rover photo, DOWNLOADS the actual
// image bytes into src/img/, and points imagery.json at the local file
// (e.g. "/img/apod.jpg") instead of NASA's own URL. Hotlinking their URLs
// directly wasn't loading reliably on the live site — likely hotlink/CORS
// protection on their image hosts — so storing a local copy each run is
// more reliable, especially for something running unattended on signage.
//
// Mars images come from NASA's own official raw-images feed at
// mars.nasa.gov/rss/api — the community-run mars-photos API this used to
// call has been archived (per NASA's own deprecation notice).
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

const MARS_SOURCES = [
  { category: "mars2020", rover: "Perseverance", site: "Jezero Crater" },
  { category: "msl", rover: "Curiosity", site: "Gale Crater" },
];

function marsFeedUrl(category) {
  const params = new URLSearchParams({
    category,
    feed: "raw_images",
    feedtype: "json",
    num: "1",
    page: "0",
    order: "sol desc",
  });
  return `https://mars.nasa.gov/rss/api/?${params.toString()}`;
}

async function fetchLatestRoverPhoto() {
  // Try NASA's own official raw-images feed first (the community-run
  // mars-photos API this used to call has been archived). If that fails
  // for both rovers, fall back to a third-party wrapper as a last resort.
  for (const src of MARS_SOURCES) {
    try {
      const res = await fetch(marsFeedUrl(src.category));
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        console.warn(`${src.rover}: non-JSON response (HTTP ${res.status}): ${raw.slice(0, 200)}`);
        continue;
      }

      const images = data.images || data.items || [];
      if (!images.length) {
        console.warn(`${src.rover}: zero images in response. Top-level keys: ${Object.keys(data).join(", ")}`);
        continue;
      }

      const img = images[0];
      const imgUrl =
        (img.image_files && (img.image_files.large || img.image_files.full_res || img.image_files.medium)) ||
        img.img_src ||
        img.url;
      if (!imgUrl) {
        console.warn(`${src.rover}: could not find an image URL field. Sample record: ${JSON.stringify(img).slice(0, 300)}`);
        continue;
      }

      const localUrl = await downloadImage(imgUrl, "mars-latest");
      const cameraName =
        (img.camera && (img.camera.instrument || img.camera.camera_model_name)) || img.instrument || "rover camera";
      const dateTaken = img.date_taken_mars || img.date_taken_utc || img.date_taken || "";

      return {
        tag: `MARS · SOL ${img.sol ?? "?"}`,
        title: `${src.rover} — ${cameraName}`,
        caption: `${src.site}${dateTaken ? ", " + dateTaken : ""}`,
        url: localUrl,
      };
    } catch (err) {
      console.warn(`${src.rover} official feed threw: ${err.message}`);
    }
  }

  // Last resort: a third-party wrapper API (not NASA-run, so no uptime
  // guarantee either, but it's an independent source from the official
  // feed above, so worth trying before giving up entirely).
  for (const rover of ["perseverance", "curiosity"]) {
    try {
      const res = await fetch(`https://rovers.nebulum.one/api/v1/rovers/${rover}/latest_photos`);
      if (!res.ok) {
        console.warn(`nebulum.one (${rover}) returned ${res.status}`);
        continue;
      }
      const data = await res.json();
      const photo = (data.latest_photos || [])[0];
      if (!photo) {
        console.warn(`nebulum.one (${rover}): no photos in response`);
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
      console.warn(`nebulum.one (${rover}) threw: ${err.message}`);
    }
  }

  throw new Error("All Mars image sources failed (official feed x2 + nebulum.one x2)");
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