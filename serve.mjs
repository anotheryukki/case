import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

/* ===== floor price proxy =====
   Steam's priceoverview endpoint doesn't send CORS headers, so a browser
   can't call it directly from a static page. We fetch it here server-side
   (no CORS restriction on server-to-server requests) on an interval and
   cache the result, then serve it same-origin at /api/floor-price. */

const MARKET_HASH_NAME = "CS:GO Weapon Case";
const STEAM_REFRESH_MS = 10 * 60 * 1000; // steady-state refresh once we have a good price
const RETRY_MS = 20 * 1000; // fast retry while we don't have a price yet / after a failure

let floorCache = { ok: false, price: null, updatedAt: null, source: "steam", error: "not fetched yet" };

async function fetchFloorPrice() {
  try {
    const url =
      "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=" +
      encodeURIComponent(MARKET_HASH_NAME);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(MARKET_HASH_NAME),
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!res.ok) throw new Error(`steam responded ${res.status}`);
    const data = await res.json();
    const raw = data.lowest_price || data.median_price;
    const price = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    if (!price) throw new Error("no parseable price in response");
    floorCache = { ok: true, price, updatedAt: new Date().toISOString(), source: "steam", error: null };
    console.log(`[floor-price] updated: $${price.toFixed(2)}`);
  } catch (e) {
    floorCache = { ...floorCache, ok: false, error: String(e.message || e) };
    console.log("[floor-price] fetch failed:", e.message || e);
  } finally {
    setTimeout(fetchFloorPrice, floorCache.ok ? STEAM_REFRESH_MS : RETRY_MS);
  }
}

fetchFloorPrice();

http
  .createServer((req, res) => {
    const reqUrlPath = req.url.split("?")[0];

    if (reqUrlPath === "/api/floor-price") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(floorCache));
      return;
    }

    let reqPath = decodeURIComponent(reqUrlPath);
    if (reqPath === "/") reqPath = "/index.html";
    const filePath = path.join(root, reqPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.stat(filePath, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = types[ext] || "application/octet-stream";
      const range = req.headers.range;

      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        if (start >= stat.size || end >= stat.size || start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          "Content-Type": contentType,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath).pipe(res);
    });
  })
  .listen(port, () => {
    console.log(`Serving ${root} at http://localhost:${port}`);
  });
