// scripts/fetch-news.mjs
import fs from "node:fs";
import path from "node:path";

const KEYWORDS = [
  "TEAC","TEAR","TS","Tribunal Supremo","Audiencia Nacional","TJUE","CJEU",
  "IRPF","LIRPF","7p","Beckham","impatriados","IRNR","LIRNR","LIS","IS","IVA","LIVA",
  "inspección","comprobación","sanción","LGT","Modelo 210","Modelo 720","VAT","direct taxation"
];

const FEEDS = [
  // TS - En Portada
  { id: "TS", url: "https://www.poderjudicial.es/cgpj/es/Poder-Judicial/Tribunal-Supremo/ch.En-Portada.formato1/" },

  // AN - En Portada
  { id: "AN", url: "https://www.poderjudicial.es/cgpj/es/Poder-Judicial/Audiencia-Nacional/ch.En-Portada.formato1/" },

  // TJUE / CURIA - Press Releases (RSS oficial)
  // Puedes añadir más RSS de CURIA desde su página RSS:
  // https://curia.europa.eu/jcms/jcms/Jo2_7032/en/
  { id: "TJUE", url: "https://curia.europa.eu/jcms/rss/press-releases/en.xml" }
];

function matchesKeywords(text) {
  const hay = (text || "").toLowerCase();
  return KEYWORDS.some(k => hay.includes(k.toLowerCase()));
}

// Parser RSS simple (sin librerías) para RSS 2.0 típico
function parseRss(xml) {
  const items = [];
  const itemBlocks = xml.split("<item>").slice(1);
  for (const block of itemBlocks) {
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? "").trim();

    const link = (block.match(/<link>(.*?)<\/link>/)?.[1] ?? "").trim();

    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "").trim();

    const description = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
      ?? block.match(/<description>([\s\S]*?)<\/description>/)?.[1]
      ?? "").trim();

    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }
  return items;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "news-bot/1.0" } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

function toISO(pubDate) {
  const d = new Date(pubDate);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function stripHtml(html) {
  return (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

(async () => {
  const all = [];

  for (const feed of FEEDS) {
    try {
      const xml = await fetchText(feed.url);
      const items = parseRss(xml);

      for (const it of items) {
        const plainDesc = stripHtml(it.description);
        const blob = `${it.title} ${plainDesc}`;

        if (matchesKeywords(blob)) {
          all.push({
            source: feed.id,
            title: it.title,
            url: it.link,
            date: toISO(it.pubDate) || null,
            excerpt: plainDesc.slice(0, 180) + (plainDesc.length > 180 ? "…" : "")
          });
        }
      }
    } catch (e) {
      console.error(`[${feed.id}] ${e.message}`);
    }
  }

  // Dedup por URL
  const dedup = [];
  const seen = new Set();
  for (const n of all) {
    if (!seen.has(n.url)) {
      seen.add(n.url);
      dedup.push(n);
    }
  }

  // Orden: más reciente primero (null al final)
  dedup.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });

  const out = {
    generatedAt: new Date().toISOString(),
    count: dedup.length,
    items: dedup.slice(0, 30) // límite razonable para Home
  };

  const outPath = path.join(process.cwd(), "data", "news.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");

  console.log(`OK news.json -> ${out.items.length} items`);
})();
