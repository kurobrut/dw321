// api/roblox.js
// Vercel Serverless Function
// Roblox username lookup + avatar proxy.

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
    return res.status(200).json({
      ok: true,
      message: "Roblox API proxy is working",
      timestamp: new Date().toISOString()
    });
  }

  if (action === "search") {
    const keyword = (url.searchParams.get("keyword") || "").trim();

    if (!keyword) return res.status(400).json({ error: "keyword is required" });
    if (keyword.length > 30) return res.status(400).json({ error: "keyword is too long" });

    // IMPORTANT:
    // users.roblox.com/v1/users/search is extremely restrictive and can return
    // HTTP 429 even for the first request from a hosted/serverless IP.
    // For a username field, use Roblox's username lookup endpoint instead.
    // It accepts multiple exact usernames in one POST and is intended for this use.
    const robloxUrl = "https://users.roblox.com/v1/usernames/users";

    try {
      const response = await fetch(robloxUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; RobloxUserLookup/1.0)"
        },
        body: JSON.stringify({
          usernames: [keyword],
          excludeBannedUsers: false
        })
      });

      const text = await response.text();

      if (!response.ok) {
        return res.status(response.status).json({
          error: "Roblox API returned an error",
          status: response.status,
          details: text,
          retryAfter: response.headers.get("retry-after") || null
        });
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(502).json({ error: "Roblox returned invalid JSON" });
      }

      // Convert the username-lookup response to the shape expected by the page.
      const users = Array.isArray(data?.data) ? data.data : [];
      const results = users.map(user => ({
        id: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        hasVerifiedBadge: !!user.hasVerifiedBadge
      }));

      return res.status(200).json({ data: results });
    } catch (error) {
      return res.status(502).json({
        error: "Unable to connect to Roblox",
        details: error?.message || String(error)
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
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0"
        }
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
