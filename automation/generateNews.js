<<<<<<< HEAD
require("dotenv").config()

const cron = require("node-cron")
const Parser = require("rss-parser")
const axios = require("axios")
const xml2js = require("xml2js")
// const db = require("../lib/firebase")
const db = require("../lib/firebase").default

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_ARTICLES_PER_RUN = 5  // Only 5 sports articles per run

// ─── Sports keywords filter ───────────────────────────────────────────────────
// An article must contain at least one of these keywords (case-insensitive)
// in its title or summary to be considered a sports article.
const SPORTS_KEYWORDS = [
  "cricket", "match", "test match", "odi", "t20", "ipl", "world cup",
  "wicket", "batting", "bowling", "innings", "over", "run", "century",
  "fifa", "football", "soccer", "goal", "league", "tournament",
  "tennis", "wimbledon", "grand slam", "serve", "set",
  "basketball", "nba", "dunk", "three-pointer",
  "hockey", "puck", "penalty",
  "athletics", "sprint", "marathon", "olympics",
  "sports", "sport", "player", "team", "squad", "fixture",
  "champion", "trophy", "final", "semifinal", "playoff",
  "coach", "captain", "transfer", "debut", "injury",
  "score", "win", "loss", "draw", "victory", "defeat",
]

// ─── RSS Parser ───────────────────────────────────────────────────────────────
const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent"],
      ["description", "description"],
    ],
  },
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  xml2js: {
    strict: false,
    normalize: true,
    normalizeTags: true,
    explicitArray: false,
  },
  timeout: 15000,
})

// ─── RSS Feed URLs ────────────────────────────────────────────────────────────
const CRICKET_FEEDS = [
  "https://www.espncricinfo.com/rss/content/story/feeds/0.xml"
]

const FOOTBALL_FEEDS = [
  "https://www.espn.com/espn/rss/soccer/news",
  "https://feeds.bbci.co.uk/sport/football/rss.xml"
]
async function fetchCricketArticles() {
  let items = []

  for (const url of CRICKET_FEEDS) {
    const feedItems = await fetchFeedItems(url)
    items.push(...feedItems)
  }

  return items.slice(0, 2)
}

async function fetchFootballArticles() {
  let items = []

  for (const url of FOOTBALL_FEEDS) {
    const feedItems = await fetchFeedItems(url)
    items.push(...feedItems)
  }

  return items.slice(0, 3)
}
// ─── Strip HTML tags from text ────────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return ""
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim()
}

// ─── Sports relevance filter ──────────────────────────────────────────────────
// Returns true if the article title or summary mentions any sports keyword.
function isSportsArticle(item) {
  const rawSummary =
    item.contentSnippet ||
    item.contentEncoded ||
    item.content ||
    item.description ||
    ""

  const text = `${item.title || ""} ${stripHtml(rawSummary)}`.toLowerCase()

  return SPORTS_KEYWORDS.some((kw) => text.includes(kw))
}

// ─── Fetch raw XML ────────────────────────────────────────────────────────────
async function fetchRawXML(url) {
  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    responseType: "text",
  })
  return response.data
}

// ─── Manual XML parse ─────────────────────────────────────────────────────────
async function parseXMLManually(xmlString) {
  const xmlParser = new xml2js.Parser({
    strict: false,
    normalize: true,
    normalizeTags: true,
    explicitArray: false,
    mergeAttrs: true,
  })

  const result = await xmlParser.parseStringPromise(xmlString)
  let items = []

  if (result.rss && result.rss.channel) {
    const channel = Array.isArray(result.rss.channel)
      ? result.rss.channel[0]
      : result.rss.channel
    items = channel.item || []
  } else if (result["rdf:rdf"]) {
    items = result["rdf:rdf"].item || []
  } else if (result.feed && result.feed.entry) {
    items = result.feed.entry || []
  }

  if (!Array.isArray(items)) items = [items]

  return items
    .filter((i) => i)
    .map((item) => ({
      title:
        item.title && typeof item.title === "object"
          ? item.title._
          : item.title || "",
      link:
        item.link && typeof item.link === "object"
          ? item.link.href || item.link._
          : item.link || item.guid || "",
      contentSnippet:
        item.description && typeof item.description === "object"
          ? item.description._
          : item.description || item["content:encoded"] || item.summary || "",
      pubDate: item.pubdate || item.published || item.updated || "",
    }))
    .filter((i) => i.title)
}

// ─── Fetch with 3 fallback strategies ────────────────────────────────────────
async function fetchFeedItems(url) {
  try {
    const feed = await parser.parseURL(url)
    if (feed.items && feed.items.length > 0) {
      console.log(`✅ rss-parser succeeded: ${feed.items.length} items`)
      return feed.items
    }
  } catch (e) {
    console.log(`⚠️  rss-parser failed: ${e.message}`)
  }

  try {
    const rawXML = await fetchRawXML(url)
    const items = await parseXMLManually(rawXML)
    if (items.length > 0) {
      console.log(`✅ Manual parse succeeded: ${items.length} items`)
      return items
    }
  } catch (e) {
    console.log(`⚠️  Manual parse failed: ${e.message}`)
  }

  try {
    const rawXML = await fetchRawXML(url)
    const cleaned = rawXML.replace(/^\uFEFF/, "").trim()
    const feed = await parser.parseString(cleaned)
    if (feed.items && feed.items.length > 0) {
      console.log(`✅ parseString fallback succeeded: ${feed.items.length} items`)
      return feed.items
    }
  } catch (e) {
    console.log(`⚠️  parseString fallback failed: ${e.message}`)
  }

  return []
}

// ─── Collect items across all feeds until we have enough sports articles ──────
// async function fetchSportsArticles() {
//   const sportsItems = []

//   for (const url of RSS_FEEDS) {
//     if (sportsItems.length >= MAX_ARTICLES_PER_RUN) break

//     console.log(`📡 Trying: ${url}`)
//     try {
//       const items = await fetchFeedItems(url)
//       if (items.length === 0) continue

//       // Filter to sports-only from this feed
//       const filtered = items.filter(isSportsArticle)
//       console.log(
//         `🏅 Sports articles from feed: ${filtered.length} / ${items.length} total`
//       )

//       for (const item of filtered) {
//         if (sportsItems.length >= MAX_ARTICLES_PER_RUN) break
//         sportsItems.push(item)
//       }
//     } catch (e) {
//       console.log(`❌ Feed failed: ${e.message}`)
//     }
//   }

//   return sportsItems
// }

// ─── Build article — exact shape the frontend expects ────────────────────────
//
//  Field map (Frontend NewsArticle type → what we store):
//  title      → item.title                  (string)
//  summary    → stripped RSS contentSnippet (string, plain text, no HTML)
//  tag        → "Cricket"                   (string)
//  source     → "ESPN CricInfo"             (string)  ← shown as "source • date"
//  url        → item.link                   (string)  ← external link
//  createdAt  → Date.now()                  (number ms timestamp)
//  likes      → 0                           (number)  ← frontend reads this
//  cdn_url    → ""                          (string)  ← no image from RSS; frontend falls back to default
//
function buildArticle(item, sport) {

  const rawSummary =
    item.contentSnippet ||
    item.contentEncoded ||
    item.content ||
    item.description ||
    ""

  return {
    title: item.title || "Sports Update",

    summary: stripHtml(rawSummary),

    tag: sport,

    source:
      sport === "Football"
        ? "ESPN FC"
        : "ESPN CricInfo",

    url: item.link || item.url || "#",

    createdAt: Date.now(),

    likes: 0,

    cdn_url: ""
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
async function processRSSNews() {
  try {
    console.log("\n🚀 Running RSS Automation — Sports Filter Active")
    console.log("=".repeat(55))

    const cricketItems =
await fetchCricketArticles()

const footballItems =
await fetchFootballArticles()

const sportsItems = [

  ...cricketItems.map(item => ({
    ...item,
    sport: "Cricket"
  })),

  ...footballItems.map(item => ({
    ...item,
    sport: "Football"
  }))
]

    if (sportsItems.length === 0) {
      console.log("❌ No sports articles found. Aborting.")
      return
    }

    console.log(
      `\n📰 Processing ${sportsItems.length} sports article(s) (limit: ${MAX_ARTICLES_PER_RUN})\n`
    )

    let inserted = 0
    let skipped = 0

    for (const item of sportsItems) {
      try {
        if (!item.title) continue

        // Dedup by title
        const existing = await db
          .collection("news")
          .where("title", "==", item.title)
          .get()

        if (!existing.empty) {
          console.log(`⏭️  Duplicate: ${item.title.slice(0, 60)}`)
          skipped++
          continue
        }

        const article =
buildArticle(
  item,
  item.sport
)
        await db.collection("news").add(article)

        console.log(`✅ Inserted: ${article.title.slice(0, 60)}`)
        inserted++

      } catch (err) {
        console.log(`❌ Item error: ${err.message}`)
      }
    }

    console.log("\n" + "=".repeat(55))
    console.log(`✅ Done — Inserted: ${inserted} | Skipped (duplicate): ${skipped}`)

  } catch (err) {
    console.log(`❌ Automation Error: ${err.message}`)
  }
}

// ─── Cron: every day at 12:00 PM ──────────────────────────────────────────────
cron.schedule("05 12 * * *", async () => {
  await processRSSNews()
})

console.log("⚽ Sports Automation Started")
console.log("🕐 Scheduled: Every day at 12:05 PM")

processRSSNews()
=======
require("dotenv").config()

const cron = require("node-cron")
const Parser = require("rss-parser")
const axios = require("axios")
const xml2js = require("xml2js")
// const db = require("../lib/firebase")
const db = require("../lib/firebase").default

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_ARTICLES_PER_RUN = 5  // Only 5 sports articles per run

// ─── Sports keywords filter ───────────────────────────────────────────────────
// An article must contain at least one of these keywords (case-insensitive)
// in its title or summary to be considered a sports article.
const SPORTS_KEYWORDS = [
  "cricket", "match", "test match", "odi", "t20", "ipl", "world cup",
  "wicket", "batting", "bowling", "innings", "over", "run", "century",
  "fifa", "football", "soccer", "goal", "league", "tournament",
  "tennis", "wimbledon", "grand slam", "serve", "set",
  "basketball", "nba", "dunk", "three-pointer",
  "hockey", "puck", "penalty",
  "athletics", "sprint", "marathon", "olympics",
  "sports", "sport", "player", "team", "squad", "fixture",
  "champion", "trophy", "final", "semifinal", "playoff",
  "coach", "captain", "transfer", "debut", "injury",
  "score", "win", "loss", "draw", "victory", "defeat",
]

// ─── RSS Parser ───────────────────────────────────────────────────────────────
const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent"],
      ["description", "description"],
    ],
  },
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  xml2js: {
    strict: false,
    normalize: true,
    normalizeTags: true,
    explicitArray: false,
  },
  timeout: 15000,
})

// ─── RSS Feed URLs ────────────────────────────────────────────────────────────
const CRICKET_FEEDS = [
  "https://www.espncricinfo.com/rss/content/story/feeds/0.xml"
]

const FOOTBALL_FEEDS = [
  "https://www.espn.com/espn/rss/soccer/news",
  "https://feeds.bbci.co.uk/sport/football/rss.xml"
]
async function fetchCricketArticles() {
  let items = []

  for (const url of CRICKET_FEEDS) {
    const feedItems = await fetchFeedItems(url)
    items.push(...feedItems)
  }

  return items.slice(0, 2)
}

async function fetchFootballArticles() {
  let items = []

  for (const url of FOOTBALL_FEEDS) {
    const feedItems = await fetchFeedItems(url)
    items.push(...feedItems)
  }

  return items.slice(0, 3)
}
// ─── Strip HTML tags from text ────────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return ""
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim()
}

// ─── Sports relevance filter ──────────────────────────────────────────────────
// Returns true if the article title or summary mentions any sports keyword.
function isSportsArticle(item) {
  const rawSummary =
    item.contentSnippet ||
    item.contentEncoded ||
    item.content ||
    item.description ||
    ""

  const text = `${item.title || ""} ${stripHtml(rawSummary)}`.toLowerCase()

  return SPORTS_KEYWORDS.some((kw) => text.includes(kw))
}

// ─── Fetch raw XML ────────────────────────────────────────────────────────────
async function fetchRawXML(url) {
  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    responseType: "text",
  })
  return response.data
}

// ─── Manual XML parse ─────────────────────────────────────────────────────────
async function parseXMLManually(xmlString) {
  const xmlParser = new xml2js.Parser({
    strict: false,
    normalize: true,
    normalizeTags: true,
    explicitArray: false,
    mergeAttrs: true,
  })

  const result = await xmlParser.parseStringPromise(xmlString)
  let items = []

  if (result.rss && result.rss.channel) {
    const channel = Array.isArray(result.rss.channel)
      ? result.rss.channel[0]
      : result.rss.channel
    items = channel.item || []
  } else if (result["rdf:rdf"]) {
    items = result["rdf:rdf"].item || []
  } else if (result.feed && result.feed.entry) {
    items = result.feed.entry || []
  }

  if (!Array.isArray(items)) items = [items]

  return items
    .filter((i) => i)
    .map((item) => ({
      title:
        item.title && typeof item.title === "object"
          ? item.title._
          : item.title || "",
      link:
        item.link && typeof item.link === "object"
          ? item.link.href || item.link._
          : item.link || item.guid || "",
      contentSnippet:
        item.description && typeof item.description === "object"
          ? item.description._
          : item.description || item["content:encoded"] || item.summary || "",
      pubDate: item.pubdate || item.published || item.updated || "",
    }))
    .filter((i) => i.title)
}

// ─── Fetch with 3 fallback strategies ────────────────────────────────────────
async function fetchFeedItems(url) {
  try {
    const feed = await parser.parseURL(url)
    if (feed.items && feed.items.length > 0) {
      console.log(`✅ rss-parser succeeded: ${feed.items.length} items`)
      return feed.items
    }
  } catch (e) {
    console.log(`⚠️  rss-parser failed: ${e.message}`)
  }

  try {
    const rawXML = await fetchRawXML(url)
    const items = await parseXMLManually(rawXML)
    if (items.length > 0) {
      console.log(`✅ Manual parse succeeded: ${items.length} items`)
      return items
    }
  } catch (e) {
    console.log(`⚠️  Manual parse failed: ${e.message}`)
  }

  try {
    const rawXML = await fetchRawXML(url)
    const cleaned = rawXML.replace(/^\uFEFF/, "").trim()
    const feed = await parser.parseString(cleaned)
    if (feed.items && feed.items.length > 0) {
      console.log(`✅ parseString fallback succeeded: ${feed.items.length} items`)
      return feed.items
    }
  } catch (e) {
    console.log(`⚠️  parseString fallback failed: ${e.message}`)
  }

  return []
}

// ─── Collect items across all feeds until we have enough sports articles ──────
// async function fetchSportsArticles() {
//   const sportsItems = []

//   for (const url of RSS_FEEDS) {
//     if (sportsItems.length >= MAX_ARTICLES_PER_RUN) break

//     console.log(`📡 Trying: ${url}`)
//     try {
//       const items = await fetchFeedItems(url)
//       if (items.length === 0) continue

//       // Filter to sports-only from this feed
//       const filtered = items.filter(isSportsArticle)
//       console.log(
//         `🏅 Sports articles from feed: ${filtered.length} / ${items.length} total`
//       )

//       for (const item of filtered) {
//         if (sportsItems.length >= MAX_ARTICLES_PER_RUN) break
//         sportsItems.push(item)
//       }
//     } catch (e) {
//       console.log(`❌ Feed failed: ${e.message}`)
//     }
//   }

//   return sportsItems
// }

// ─── Build article — exact shape the frontend expects ────────────────────────
//
//  Field map (Frontend NewsArticle type → what we store):
//  title      → item.title                  (string)
//  summary    → stripped RSS contentSnippet (string, plain text, no HTML)
//  tag        → "Cricket"                   (string)
//  source     → "ESPN CricInfo"             (string)  ← shown as "source • date"
//  url        → item.link                   (string)  ← external link
//  createdAt  → Date.now()                  (number ms timestamp)
//  likes      → 0                           (number)  ← frontend reads this
//  cdn_url    → ""                          (string)  ← no image from RSS; frontend falls back to default
//
function buildArticle(item, sport) {

  const rawSummary =
    item.contentSnippet ||
    item.contentEncoded ||
    item.content ||
    item.description ||
    ""

  return {
    title: item.title || "Sports Update",

    summary: stripHtml(rawSummary),

    tag: sport,

    source:
      sport === "Football"
        ? "ESPN FC"
        : "ESPN CricInfo",

    url: item.link || item.url || "#",

    createdAt: Date.now(),

    likes: 0,

    cdn_url: ""
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
async function processRSSNews() {
  try {
    console.log("\n🚀 Running RSS Automation — Sports Filter Active")
    console.log("=".repeat(55))

    const cricketItems =
await fetchCricketArticles()

const footballItems =
await fetchFootballArticles()

const sportsItems = [

  ...cricketItems.map(item => ({
    ...item,
    sport: "Cricket"
  })),

  ...footballItems.map(item => ({
    ...item,
    sport: "Football"
  }))
]

    if (sportsItems.length === 0) {
      console.log("❌ No sports articles found. Aborting.")
      return
    }

    console.log(
      `\n📰 Processing ${sportsItems.length} sports article(s) (limit: ${MAX_ARTICLES_PER_RUN})\n`
    )

    let inserted = 0
    let skipped = 0

    for (const item of sportsItems) {
      try {
        if (!item.title) continue

        // Dedup by title
        const existing = await db
          .collection("news")
          .where("title", "==", item.title)
          .get()

        if (!existing.empty) {
          console.log(`⏭️  Duplicate: ${item.title.slice(0, 60)}`)
          skipped++
          continue
        }

        const article =
buildArticle(
  item,
  item.sport
)
        await db.collection("news").add(article)

        console.log(`✅ Inserted: ${article.title.slice(0, 60)}`)
        inserted++

      } catch (err) {
        console.log(`❌ Item error: ${err.message}`)
      }
    }

    console.log("\n" + "=".repeat(55))
    console.log(`✅ Done — Inserted: ${inserted} | Skipped (duplicate): ${skipped}`)

  } catch (err) {
    console.log(`❌ Automation Error: ${err.message}`)
  }
}

// ─── Cron: every day at 12:00 PM ──────────────────────────────────────────────
cron.schedule("05 12 * * *", async () => {
  await processRSSNews()
})

console.log("⚽ Sports Automation Started")
console.log("🕐 Scheduled: Every day at 12:05 PM")

processRSSNews()
>>>>>>> ce4aa7a11232170e56360f819c7475e9ca2ef4ff
