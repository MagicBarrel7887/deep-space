# deep-space

Live deep space dashboard: DSN Now, spacecraft distance tracker, mission events,
Earth + planetary imagery, and a ground map (DSN sites, ISS, Mars/Moon assets,
auto-rotating). Built for GitLab Pages, tuned to run cleanly on Xibo signage
players (GPU-light: no blur filters, minimal animation, static-friendly).

## Stack

- **Eleventy** — static site generator, reads JSON from `src/_data/` as global data
- **Alpine.js** — lightweight reactivity for expand/collapse and map rotation, no build step
- **Vanilla CSS** — design tokens below, no framework
- **Node fetch scripts** — run in CI, write JSON into `src/_data/`

## Structure

```
src/
  _data/          # JSON written by fetch scripts (gitignored except .gitkeep)
  _includes/       # Eleventy layouts/partials
  css/
  js/
  img/
  index.njk        # main dashboard page
scripts/
  fetch-dsn.js
  fetch-spacecraft.js
  fetch-iss.js
  fetch-events.js
  fetch-imagery.js
  fetch-news.js
.gitlab-ci.yml
.eleventy.js
```

## Data sources

| Panel | Source |
|---|---|
| DSN Now | DSN Now feed (eyes.nasa.gov/dsn) |
| Spacecraft tracker | JPL Horizons API |
| Spacecraft news dropdown | JPL/NASA RSS, filtered by keyword |
| ISS position | ISS tracking API (e.g. wheretheiss.at) |
| Mission events | manual/curated list + JPL feed |
| Imagery | NASA APOD API, GOES/Himawari Earth imagery, Mars rover raw image APIs, JWST/Hubble releases |

## Local dev

```
npm install
npm run fetch:all   # populates src/_data with real data
npm run serve
```

## CI/CD

Three stages: `fetch` → `build` → `deploy`. Set up a CI/CD schedule (e.g. every
15–30 min) to keep `fetch-data` running independently of commits, so the site
stays live even with no code changes. Pages job publishes `public/`.

## Design tokens

- Background: `#080a16` (near-black indigo)
- Panel: `#0e1225`, border `#232a49`
- Accent: `#8fb3e8` (labels/headers), `#7dd3c0` (active/positive), `#f2c14e` (ISS marker)
- Muted: `#5c6690`
- Font: monospace throughout (mission-control feel)
