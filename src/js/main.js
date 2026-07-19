// ---- clock ----
function tickClock() {
  const utcEl = document.getElementById("clock");
  const localEl = document.getElementById("clock-local");
  const now = new Date();
  if (utcEl) utcEl.textContent = now.toUTCString().split(" ")[4] + " UTC";
  if (localEl) {
    localEl.textContent = now.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }
}
setInterval(tickClock, 1000);
tickClock();

// ---- live/fresh/stale indicator ----
// Assumes roughly-hourly fetch runs (adjust the two thresholds below if your
// CI schedule changes): fresh right after an update, normal for the rest of
// the expected window, stale once a run appears to have been missed.
const LIVE_FRESH_MS = 3 * 60 * 1000; // first 3 min after an update: heartbeat
const LIVE_STALE_MS = 90 * 60 * 1000; // past 90 min since update: flag as stale

function formatAge(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
}

function tickLiveIndicator() {
  const dot = document.getElementById("live-dot");
  const text = document.getElementById("live-text");
  const ageEl = document.getElementById("live-age");
  if (!dot || !text) return;

  const meta = readData("data-meta");
  const lastUpdated = meta && meta.lastUpdated ? new Date(meta.lastUpdated) : null;
  const wrapper = dot.closest(".sub") || dot.parentElement;

  if (!lastUpdated || isNaN(lastUpdated.getTime())) {
    wrapper.className = "sub live-stale";
    text.textContent = "NO DATA";
    if (ageEl) ageEl.textContent = "";
    return;
  }

  const age = Date.now() - lastUpdated.getTime();
  if (age < LIVE_FRESH_MS) {
    wrapper.className = "sub live-fresh";
    text.textContent = "LIVE";
    if (ageEl) ageEl.textContent = "";
  } else if (age < LIVE_STALE_MS) {
    wrapper.className = "sub live-normal";
    text.textContent = "LIVE";
    if (ageEl) ageEl.textContent = "";
  } else {
    wrapper.className = "sub live-stale";
    text.textContent = "DATA STALE";
    if (ageEl) ageEl.textContent = `— last update ${formatAge(age)} ago`;
  }
}
setInterval(tickLiveIndicator, 10000);
// runs after readData() is defined below, so call it once that's set up
setTimeout(tickLiveIndicator, 0);

// ---- starfield (static dots, seeded, no per-frame work — the container itself rotates via CSS) ----
function buildStarfield() {
  const container = document.getElementById("starfield");
  if (!container) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "none");

  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < 140; i++) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", `${rand() * 100}%`);
    c.setAttribute("cy", `${rand() * 100}%`);
    c.setAttribute("r", (rand() * 1.1 + 0.3).toFixed(2));
    c.setAttribute("fill", "#c7d2f0");
    c.setAttribute("opacity", (rand() * 0.6 + 0.25).toFixed(2));
    svg.appendChild(c);
  }
  container.appendChild(svg);
}
buildStarfield();

// ---- ground map ----
function readData(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    return [];
  }
}

function project(lat, lon, w, h) {
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

function renderMap(body, data) {
  const w = 600, h = 260;
  const bg = body === "mars" ? "#1c1108" : "#16161e";
  const grid = body === "mars" ? "#3a2818" : "#26262f";
  const markerColor = body === "mars" ? "#e0a06a" : "#c7d2f0";

  const source = body === "mars" ? data.mars : data.moon;
  const points = source.filter((a) => a.type !== "orbit").map((a) => ({ ...a, sub: a.note }));
  const orbiters = source.filter((a) => a.type === "orbit");

  const gridLines = [];
  for (let i = 0; i <= 6; i++) {
    gridLines.push(`<line x1="${(w / 6) * i}" y1="0" x2="${(w / 6) * i}" y2="${h}" stroke="${grid}" stroke-width="1" />`);
  }
  for (let i = 0; i <= 3; i++) {
    gridLines.push(`<line x1="0" y1="${(h / 3) * i}" x2="${w}" y2="${(h / 3) * i}" stroke="${grid}" stroke-width="1" />`);
  }

  const markers = points
    .map((p) => {
      const [x, y] = project(p.lat, p.lon, w, h);
      const label = `${p.name}${p.sub ? " · " + p.sub : ""}`;
      return `
        <circle cx="${x}" cy="${y}" r="5" fill="${markerColor}" />
        <circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${markerColor}" stroke-width="1" opacity="0.5" />
        <text x="${x + 12}" y="${y + 4}" fill="#c7d2f0" font-size="10" font-family="monospace">${label}</text>
      `;
    })
    .join("");

  return {
    svg: `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:100%;">
        <rect x="0" y="0" width="${w}" height="${h}" fill="${bg}" />
        ${gridLines.join("")}
        <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${grid}" stroke-width="1.4" />
        ${markers}
      </svg>
    `,
    orbiters,
  };
}

// ---- Earth view: real Leaflet map with actual geography, not the stylized grid above ----
let leafletMap = null;
let leafletMarkers = [];
let lastFitPoints = [];

function initLeafletMap() {
  if (leafletMap || typeof L === "undefined") return;
  leafletMap = L.map("map-leaflet", {
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
  }).setView([15, 20], 1); // temporary — drawLeafletMarkers() below fits real bounds once markers exist

  // CartoDB's free dark basemap — no API key required, matches the dashboard's palette
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(leafletMap);
}

function drawLeafletMarkers(data) {
  if (!leafletMap) return;
  leafletMarkers.forEach((m) => leafletMap.removeLayer(m));
  leafletMarkers = [];
  const points = []; // for fitBounds

  data.sites.forEach((s) => {
    const dishesHere = data.dsn.filter((d) => d.site === s.name);
    const activeCount = dishesHere.filter((d) => d.status === "active").length;
    const color = activeCount > 0 ? "#7dd3c0" : "#4b5578";
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: 7,
      color,
      fillColor: color,
      fillOpacity: 0.9,
      weight: 2,
    })
      .bindTooltip(`${s.name} · ${activeCount}/${dishesHere.length}`, {
        permanent: true,
        direction: "right",
        offset: [8, 0],
        className: "map-tooltip",
      })
      .addTo(leafletMap);
    leafletMarkers.push(marker);
    points.push([s.lat, s.lon]);
  });

  if (data.iss && typeof data.iss.lat === "number") {
    const issMarker = L.circleMarker([data.iss.lat, data.iss.lon], {
      radius: 5,
      color: "#f2c14e",
      fillColor: "#f2c14e",
      fillOpacity: 1,
      weight: 2,
    })
      .bindTooltip("ISS", { permanent: true, direction: "right", offset: [8, 0], className: "map-tooltip" })
      .addTo(leafletMap);
    leafletMarkers.push(issMarker);
    points.push([data.iss.lat, data.iss.lon]);
  }

  // Fixed zoom/center previously cut off sites spread far apart in longitude
  // (Goldstone/Madrid/Canberra span nearly the whole globe) — fit to whatever
  // points actually exist instead of guessing a center/zoom that works for all cases.
  if (points.length > 0) {
    lastFitPoints = points;
    leafletMap.fitBounds(points, { padding: [30, 30], maxZoom: 3 });
  }
}

function initMapRotator() {
  const mapEl = document.getElementById("map-svg");
  const leafletEl = document.getElementById("map-leaflet");
  const labelEl = document.getElementById("map-label");
  const orbitEl = document.getElementById("map-orbit-note");
  if (!mapEl || !leafletEl) return;

  const data = {
    sites: readData("data-sites"),
    iss: readData("data-iss"),
    dsn: readData("data-dsn"),
    mars: readData("data-mars"),
    moon: readData("data-moon"),
  };

  const views = [
    { id: "earth", label: "GROUND STATIONS + ISS" },
    { id: "mars", label: "MARS ASSETS" },
    { id: "moon", label: "LUNAR ASSETS" },
  ];

  let index = 0;
  function draw() {
    const view = views[index];
    if (labelEl) labelEl.textContent = view.label;

    if (view.id === "earth") {
      mapEl.classList.add("hidden");
      leafletEl.classList.add("visible");
      initLeafletMap();
      drawLeafletMarkers(data);
      // container was hidden (display:none) when Leaflet first measured it —
      // force a re-check of its size now that it's visible, then re-fit bounds
      // using the corrected size, or the very first render can be mis-zoomed
      setTimeout(() => {
        if (!leafletMap) return;
        leafletMap.invalidateSize();
        if (lastFitPoints.length > 0) {
          leafletMap.fitBounds(lastFitPoints, { padding: [30, 30], maxZoom: 3 });
        }
      }, 50);
      if (orbitEl) orbitEl.textContent = "";
    } else {
      leafletEl.classList.remove("visible");
      mapEl.classList.remove("hidden");
      const { svg, orbiters } = renderMap(view.id, data);
      mapEl.innerHTML = svg;
      if (orbitEl) {
        orbitEl.textContent = orbiters.length
          ? `In orbit (no fixed ground position): ${orbiters.map((o) => `${o.name} (${o.note})`).join(" · ")}`
          : "";
      }
    }
  }
  draw();

  // Auto-cycles on its own — no seconds field to configure, just a fixed sensible pace.
  setInterval(() => {
    mapEl.style.opacity = 0;
    leafletEl.style.opacity = 0;
    mapEl.classList.add("transitioning");
    leafletEl.classList.add("transitioning");
    setTimeout(() => {
      index = (index + 1) % views.length;
      draw();
      mapEl.style.opacity = 1;
      leafletEl.style.opacity = 1;
      setTimeout(() => {
        mapEl.classList.remove("transitioning");
        leafletEl.classList.remove("transitioning");
      }, 400);
    }, 600);
  }, 120000);
}
initMapRotator();
