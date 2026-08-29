// Vercel Serverless Function
// Routes public Roblox user-search and avatar-thumbnail requests.
// This is for public-data lookup only; it does not transfer Robux
// or handle Roblox credentials, cookies, tokens, or payments.

export default async function handler(req, res) {
  const action = String(req.query?.action || "").toLowerCase();

  // Basic CORS support. The frontend normally calls this same origin.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (action === "search") {
    const keyword = String(req.query?.keyword || "").trim();
    let limit = Number.parseInt(String(req.query?.limit || "10"), 10);

    if (!keyword) {
      return res.status(400).json({ error: "keyword is required" });
    }

    if (keyword.length > 30) {
      return res.status(400).json({ error: "keyword is too long" });
    }

    if (!Number.isFinite(limit)) limit = 10;
    limit = Math.max(1, Math.min(10, limit));

    const url = new URL("https://users.roblox.com/v1/users/search");
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("limit", String(limit));

    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Roblox-UI-Demo/1.0"
        }
      });

      const text = await response.text();

      res.status(response.status);
      res.setHeader("Content-Type", "application/json; charset=utf-8");

      try {
        return res.send(JSON.parse(text));
      } catch {
        return res.send(text);
      }
    } catch (error) {
      console.error("Roblox search error:", error);
      return res.status(502).json({
        error: "Could not connect to Roblox",
        details: String(error?.message || error)
      });
    }
  }

  if (action === "avatar") {
    const userIds = String(req.query?.userIds || "").trim();
    const size = String(req.query?.size || "48x48");
    const format = String(req.query?.format || "Png");
    const isCircular = String(req.query?.isCircular || "true");

    if (!/^[0-9,]+$/.test(userIds)) {
      return res.status(400).json({
        error: "A valid userIds value is required"
      });
    }

    const url = new URL(
      "https://thumbnails.roblox.com/v1/users/avatar-headshot"
    );

    url.searchParams.set("userIds", userIds);
    url.searchParams.set("size", size);
    url.searchParams.set("format", format);
    url.searchParams.set("isCircular", isCircular);

    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Roblox-UI-Demo/1.0"
        }
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({
          error: "Roblox thumbnail API returned an error",
          details: text
        });
      }

      const data = await response.json();
      const imageUrl = data?.data?.[0]?.imageUrl;

      if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
        return res.status(502).json({
          error: "Roblox did not return an avatar image"
        });
      }

      // The <img> element receives the actual CDN image after this redirect.
      res.setHeader("Location", imageUrl);
      return res.status(302).end();
    } catch (error) {
      console.error("Roblox avatar error:", error);
      return res.status(502).json({
        error: "Could not connect to Roblox",
        details: String(error?.message || error)
      });
    }
  }

  return res.status(400).json({
    error: "Invalid action. Use action=search or action=avatar."
  });
}
