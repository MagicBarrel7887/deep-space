// Pulls JPL's news RSS feed and filters headlines by keyword match against
// each tracked spacecraft, merging the top matches into that spacecraft's
// "news" array in src/_data/spacecraft.json (launched/status/distance
// fields are left untouched — this only updates news).
//
// JPL news feed: https://www.jpl.nasa.gov/feeds/news/

const fs = require("fs");
const path = require("path");

const SC_PATH = path.join(__dirname, "..", "src", "_data", "spacecraft.json");
const FEED_URL = "https://www.jpl.nasa.gov/feeds/news/";
const MAX_NEWS_PER_CRAFT = 2;

// Keywords to match per spacecraft, since headlines don't always say the
// exact display name.
const KEYWORDS = {
  "Voyager 1": ["voyager 1", "voyager"],
  "Voyager 2": ["voyager 2", "voyager"],
  "New Horizons": ["new horizons"],
  "Parker Solar Probe": ["parker solar probe", "parker"],
};

function parseRssItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
    items.push({
      title: title.replace("<![CDATA[", "").replace("]]>", "").trim(),
      date: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : "",
    });
  }
  return items;
}

async function main() {
  console.log(`Fetching JPL news feed from ${FEED_URL} ...`);
  const res = await fetch(FEED_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; deep-space-dashboard/1.0; +https://gitlab.ponder.net)",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`JPL feed returned HTTP ${res.status}. First 300 chars of body: ${raw.slice(0, 300)}`);
  }
  const items = parseRssItems(raw);
  if (items.length === 0) throw new Error(`Parsed zero items from JPL feed. First 300 chars: ${raw.slice(0, 300)}`);
  console.log(`Feed OK, ${items.length} items found. Matching against ${Object.keys(KEYWORDS).length} tracked spacecraft...`);

  const spacecraft = JSON.parse(fs.readFileSync(SC_PATH, "utf8"));

  const updated = spacecraft.map((entry) => {
    const keywords = KEYWORDS[entry.name] || [entry.name.toLowerCase()];
    const matches = items
      .filter((item) => keywords.some((k) => item.title.toLowerCase().includes(k)))
      .slice(0, MAX_NEWS_PER_CRAFT)
      .map((item) => ({ date: item.date, headline: item.title }));

    if (matches.length === 0) {
      console.log(`${entry.name}: no matching headlines this run, kept existing news`);
      return entry;
    }
    console.log(`${entry.name}: ${matches.length} matching headline(s) found`);
    return { ...entry, news: matches };
  });

  fs.writeFileSync(SC_PATH, JSON.stringify(updated, null, 2));
  console.log(`Wrote updated news to ${SC_PATH}`);
}

main().catch((err) => {
  console.error("fetch-news.js failed, leaving existing data in place:", err.message);
  process.exit(0);
});