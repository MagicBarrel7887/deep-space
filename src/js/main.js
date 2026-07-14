// ---- clock ----
function tickClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toUTCString().split(" ")[4] + " UTC";
}
setInterval(tickClock, 1000);
tickClock();

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
  const bg = body === "mars" ? "#170f0a" : body === "moon" ? "#101014" : "#0a0e1e";
  const grid = body === "mars" ? "#2e1e14" : body === "moon" ? "#1e1e24" : "#1c2340";
  const markerColor = body === "mars" ? "#e0a06a" : body === "moon" ? "#c7d2f0" : "#7dd3c0";

  let points = [];
  if (body === "mars") {
    points = data.mars.map((a) => ({ ...a, sub: a.note }));
  } else if (body === "moon") {
    points = data.moon.map((a) => ({ ...a, sub: a.note }));
  } else {
    points = data.sites.map((s) => {
      const dishesHere = data.dsn.filter((d) => d.site === s.name);
      const activeCount = dishesHere.filter((d) => d.status === "active").length;
      return { ...s, sub: `${activeCount}/${dishesHere.length}`, active: activeCount > 0 };
    });
  }

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
      const color = p.active === false ? "#4b5578" : markerColor;
      const label = `${p.name}${p.sub ? " · " + p.sub : ""}`;
      return `
        <circle cx="${x}" cy="${y}" r="5" fill="${color}" />
        <circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${color}" stroke-width="1" opacity="0.5" />
        <text x="${x + 12}" y="${y + 4}" fill="#c7d2f0" font-size="10" font-family="monospace">${label}</text>
      `;
    })
    .join("");

  let issMarker = "";
  if (body === "earth" && data.iss) {
    const [x, y] = project(data.iss.lat, data.iss.lon, w, h);
    issMarker = `
      <circle cx="${x}" cy="${y}" r="4" fill="#f2c14e" />
      <text x="${x + 10}" y="${y + 4}" fill="#f2c14e" font-size="10" font-family="monospace">ISS</text>
    `;
  }

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:100%;">
      <rect x="0" y="0" width="${w}" height="${h}" fill="${bg}" />
      ${gridLines.join("")}
      <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${grid}" stroke-width="1.4" />
      ${markers}
      ${issMarker}
    </svg>
  `;
}

function initMapRotator() {
  const mapEl = document.getElementById("map-svg");
  const labelEl = document.getElementById("map-label");
  if (!mapEl) return;

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
    mapEl.innerHTML = renderMap(views[index].id, data);
    if (labelEl) labelEl.textContent = views[index].label;
  }
  draw();

  // Auto-cycles on its own — no seconds field to configure, just a fixed sensible pace.
  setInterval(() => {
    mapEl.style.opacity = 0;
    setTimeout(() => {
      index = (index + 1) % views.length;
      draw();
      mapEl.style.opacity = 1;
    }, 600);
  }, 120000);
}
initMapRotator();
