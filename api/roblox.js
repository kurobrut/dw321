// api/roblox.js
// Vercel Serverless Function
// Partial Roblox username search + avatar proxy.
// Uses short-lived in-memory caching and a 429-safe fallback.

const SEARCH_CACHE_TTL = 60 * 1000;
const searchCache = globalThis.__robloxSearchCache || new Map();
const searchInflight = globalThis.__robloxSearchInflight || new Map();
globalThis.__robloxSearchCache = searchCache;
globalThis.__robloxSearchInflight = searchInflight;

function cacheKey(keyword, limit) {
  return keyword.trim().toLowerCase() + ":" + limit;
}

function normalizeUsers(data) {
  const users = Array.isArray(data?.data) ? data.data : [];
  return users
    .filter(u => u && u.id != null && (u.name || u.displayName))
    .map(u => ({
      id: u.id,
      name: u.name || "",
      displayName: u.displayName || u.name || ""
    }));
}

async function fetchSearch(keyword, limit) {
  const robloxUrl = new URL("https://users.roblox.com/v1/users/search");
  robloxUrl.searchParams.set("keyword", keyword);
  robloxUrl.searchParams.set("limit", String(limit));

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(robloxUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; RobloxUserSearch/1.0)"
      }
    });

    const text = await response.text();

    if (response.status === 429) {
      if (attempt === 0) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 2500)
          : 900;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      const error = new Error("ROBLOX_RATE_LIMITED");
      error.status = 429;
      error.retryAfter = Number(response.headers.get("retry-after")) || 5;
      throw error;
    }

    if (!response.ok) {
      const error = new Error("Roblox API returned an error");
      error.status = response.status;
      error.details = text;
      throw error;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error("Roblox returned invalid JSON");
      error.status = 502;
      throw error;
    }

    return normalizeUsers(data);
  }
}

async function getSearchResults(keyword, limit) {
  const key = cacheKey(keyword, limit);
  const now = Date.now();
  const cached = searchCache.get(key);

  if (cached && now - cached.time < SEARCH_CACHE_TTL) {
    return { users: cached.users, cached: true };
  }

  if (searchInflight.has(key)) {
    const users = await searchInflight.get(key);
    return { users, cached: false };
  }

  const promise = fetchSearch(keyword, limit);
  searchInflight.set(key, promise);

  try {
    const users = await promise;
    searchCache.set(key, { time: Date.now(), users });
    return { users, cached: false };
  } finally {
    searchInflight.delete(key);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const url = new URL(req.url || "/api/roblox", `https://${req.headers.host}`);
  const action = (url.searchParams.get("action") || "").trim().toLowerCase();

  if (action === "ping") {
    return res.status(200).json({
      ok: true,
      message: "Roblox API proxy is working",
      timestamp: new Date().toISOString()
    });
  }

  if (action === "search") {
    const keyword = (url.searchParams.get("keyword") || "").trim();
    let limit = Number(url.searchParams.get("limit") || "10");

    if (!keyword) return res.status(400).json({ error: "keyword is required" });
    if (keyword.length > 30) return res.status(400).json({ error: "keyword is too long" });
    if (!Number.isFinite(limit) || limit < 1) limit = 10;
    limit = Math.min(Math.floor(limit), 10);

    try {
      const result = await getSearchResults(keyword, limit);
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
      return res.status(200).json({ data: result.users, cached: result.cached });
    } catch (error) {
      if (error?.status === 429 || error?.message === "ROBLOX_RATE_LIMITED") {
        const key = cacheKey(keyword, limit);
        const stale = searchCache.get(key);

        if (stale?.users) {
          res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=30");
          return res.status(200).json({
            data: stale.users,
            cached: true,
            stale: true,
            message: "Roblox is rate-limiting searches; showing the last cached result."
          });
        }

        return res.status(429).json({
          error: "Roblox is temporarily rate-limiting username searches.",
          message: "Please wait a few seconds and try again.",
          status: 429,
          retryAfter: Number(error.retryAfter) || 5
        });
      }

      return res.status(error?.status || 502).json({
        error: error?.message || "Unable to search Roblox users",
        details: error?.details || null
      });
    }
  }

  if (action === "avatar") {
    const userIds = (url.searchParams.get("userIds") || "").trim();
    const size = url.searchParams.get("size") || "48x48";
    const format = url.searchParams.get("format") || "Png";
    const isCircular = url.searchParams.get("isCircular") || "true";

    if (!/^[0-9]+(?:,[0-9]+)*$/.test(userIds)) {
      return res.status(400).json({ error: "Invalid Roblox user ID" });
    }

    const robloxUrl = new URL("https://thumbnails.roblox.com/v1/users/avatar-headshot");
    robloxUrl.searchParams.set("userIds", userIds);
    robloxUrl.searchParams.set("size", size);
    robloxUrl.searchParams.set("format", format);
    robloxUrl.searchParams.set("isCircular", isCircular);

    try {
      const response = await fetch(robloxUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }
      });
      const text = await response.text();

      if (!response.ok) {
        return res.status(response.status).json({
          error: "Roblox thumbnail API returned an error",
          status: response.status,
          details: text
        });
      }

      const data = JSON.parse(text);
      const imageUrl = data?.data?.[0]?.imageUrl;
      if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
        return res.status(404).json({ error: "Roblox did not return an avatar image" });
      }

      res.setHeader("Location", imageUrl);
      return res.status(302).end();
    } catch (error) {
      return res.status(502).json({
        error: "Unable to connect to Roblox",
        details: error?.message || String(error)
      });
    }
  }

  return res.status(400).json({
    error: "Invalid action",
    availableActions: ["ping", "search", "avatar"]
  });
}
