// Vercel serverless function — GET /api/floor-price
// Steam's priceoverview endpoint doesn't send CORS headers, so the browser
// can't call it directly; this proxies it server-side instead. Serverless
// functions are stateless (no in-memory cache survives between invocations),
// so freshness/rate-limiting is handled with Vercel's edge cache headers:
// a good result is cached at the edge for 10 minutes, a failure only briefly,
// so we retry soon without hammering Steam on every visitor.

const MARKET_HASH_NAME = "CS:GO Weapon Case";

module.exports = async (req, res) => {
  try {
    const url =
      "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=" +
      encodeURIComponent(MARKET_HASH_NAME);
    const steamRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(MARKET_HASH_NAME),
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!steamRes.ok) throw new Error(`steam responded ${steamRes.status}`);
    const data = await steamRes.json();
    const raw = data.lowest_price || data.median_price;
    const price = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    if (!price) throw new Error("no parseable price in response");

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({ ok: true, price, updatedAt: new Date().toISOString(), source: "steam", error: null });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    res.status(200).json({ ok: false, price: null, updatedAt: null, source: "steam", error: String(e.message || e) });
  }
};
