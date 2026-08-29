// api/roblox.js
// Vercel Serverless Function
// Public Roblox username search + avatar proxy with retry/backoff for 429s.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const url = new URL(req.url || "/api/roblox", `https://${req.headers.host}`);
  const action = (url.searchParams.get("action") || "").trim().toLowerCase();

  if (action === "ping") {
    return res.status(200).json({ ok: true, message: "Roblox API proxy is working", timestamp: new Date().toISOString() });
  }

  if (action === "search") {
    const keyword = (url.searchParams.get("keyword") || "").trim();
    let limit = Number(url.searchParams.get("limit") || "10");

    if (!keyword) return res.status(400).json({ error: "keyword is required" });
    if (keyword.length > 30) return res.status(400).json({ error: "keyword is too long" });
    if (!Number.isFinite(limit) || limit < 1) limit = 10;
    limit = Math.min(Math.floor(limit), 10);

    const robloxUrl = new URL("https://users.roblox.com/v1/users/search");
    robloxUrl.searchParams.set("keyword", keyword);
    robloxUrl.searchParams.set("limit", String(limit));

    // Roblox can temporarily rate-limit shared server IPs.
    // Retry only on 429, using Retry-After when Roblox supplies it.
    let lastResponse = null;
    let lastText = "";

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(robloxUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; RobloxUserSearch/1.0)"
          }
        });

        const text = await response.text();
        lastResponse = response;
        lastText = text;

        if (response.status !== 429) {
          if (!response.ok) {
            return res.status(response.status).json({
              error: "Roblox API returned an error",
              status: response.status,
              details: text
            });
          }

          let data;
          try {
            data = JSON.parse(text);
          } catch {
            return res.status(502).json({ error: "Roblox returned invalid JSON" });
          }

          // Keep the frontend response shape stable.
          return res.status(200).json({
            data: Array.isArray(data?.data) ? data.data : []
          });
        }

        if (attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 5000)
            : 1000 * (attempt + 1);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      } catch (error) {
        if (attempt === 2) {
          return res.status(502).json({
            error: "Unable to connect to Roblox",
            details: error?.message || String(error)
          });
        }
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }

    return res.status(429).json({
      error: "Roblox is temporarily rate-limiting username searches. Please wait a few seconds and try again.",
      status: 429,
      retryAfter: lastResponse?.headers?.get("retry-after") || null
    });
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
      return res.status(502).json({ error: "Unable to connect to Roblox", details: error?.message || String(error) });
    }
  }

  return res.status(400).json({ error: "Invalid action", availableActions: ["ping", "search", "avatar"] });
}
