// api/roblox.js
//
// Vercel Serverless Function
// Handles public Roblox user search and avatar thumbnails.
//
// No Roblox credentials, cookies, authentication tokens,
// payments, or Robux transfers are handled here.

export default async function handler(req, res) {
    // ============================================================
    // RESPONSE HEADERS
    // ============================================================

    res.setHeader("Access-Control-Allow-Origin", "*");

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept"
    );

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    // ============================================================
    // OPTIONS / CORS PREFLIGHT
    // ============================================================

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    // ============================================================
    // ONLY ALLOW GET
    // ============================================================

    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    // ============================================================
    // READ URL
    // ============================================================

    let requestUrl;

    try {
        requestUrl = new URL(
            req.url || "/api/roblox",
            `https://${req.headers.host}`
        );
    } catch (error) {
        return res.status(400).json({
            error: "Invalid request URL"
        });
    }

    const action =
        requestUrl.searchParams
            .get("action")
            ?.trim()
            .toLowerCase() || "";

    // ============================================================
    // PING / HEALTH CHECK
    // ============================================================

    if (action === "ping") {
        return res.status(200).json({
            ok: true,
            message: "Roblox API proxy is working",
            timestamp: new Date().toISOString()
        });
    }

    // ============================================================
    // SEARCH ROBLOX USERS
    // ============================================================

    if (action === "search") {
        const keyword =
            requestUrl.searchParams
                .get("keyword")
                ?.trim() || "";

        let limit = Number(
            requestUrl.searchParams
                .get("limit") || "10"
        );

        // -----------------------------
        // Validate keyword
        // -----------------------------

        if (!keyword) {
            return res.status(400).json({
                error: "keyword is required"
            });
        }

        if (keyword.length > 30) {
            return res.status(400).json({
                error: "keyword is too long"
            });
        }

        // -----------------------------
        // Validate limit
        // -----------------------------

        if (
            !Number.isFinite(limit) ||
            limit < 1
        ) {
            limit = 10;
        }

        limit = Math.min(
            Math.floor(limit),
            10
        );

        // -----------------------------
        // Build Roblox API request
        // -----------------------------

        const robloxUrl = new URL(
            "https://users.roblox.com/v1/users/search"
        );

        robloxUrl.searchParams.set(
            "keyword",
            keyword
        );

        robloxUrl.searchParams.set(
            "limit",
            String(limit)
        );

        console.log(
            "Searching Roblox:",
            robloxUrl.toString()
        );

        try {
            const response = await fetch(
                robloxUrl.toString(),
                {
                    method: "GET",

                    headers: {
                        "Accept": "application/json",
                        "User-Agent":
                            "Mozilla/5.0"
                    }
                }
            );

            const text =
                await response.text();

            console.log(
                "Roblox search status:",
                response.status
            );

            // -----------------------------
            // Roblox returned an error
            // -----------------------------

            if (!response.ok) {
                return res.status(
                    response.status
                ).json({
                    error:
                        "Roblox API returned an error",
                    status:
                        response.status,
                    details:
                        text
                });
            }

            // -----------------------------
            // Parse JSON
            // -----------------------------

            let data;

            try {
                data = JSON.parse(text);
            } catch (error) {
                return res.status(502).json({
                    error:
                        "Roblox returned invalid JSON",
                    raw:
                        text
                });
            }

            // -----------------------------
            // Return Roblox response
            // -----------------------------

            return res.status(200).json(
                data
            );

        } catch (error) {
            console.error(
                "Roblox search error:",
                error
            );

            return res.status(502).json({
                error:
                    "Unable to connect to Roblox",
                details:
                    error?.message ||
                    String(error)
            });
        }
    }

    // ============================================================
    // ROBLOX AVATAR HEADSHOT
    // ============================================================

    if (action === "avatar") {
        const userIds =
            requestUrl.searchParams
                .get("userIds")
                ?.trim() || "";

        const size =
            requestUrl.searchParams
                .get("size") ||
            "48x48";

        const format =
            requestUrl.searchParams
                .get("format") ||
            "Png";

        const isCircular =
            requestUrl.searchParams
                .get("isCircular") ||
            "true";

        // -----------------------------
        // Validate user IDs
        // -----------------------------

        if (
            !userIds ||
            !/^[0-9]+(?:,[0-9]+)*$/.test(
                userIds
            )
        ) {
            return res.status(400).json({
                error:
                    "Invalid Roblox user ID"
            });
        }

        // -----------------------------
        // Build thumbnail API URL
        // -----------------------------

        const robloxUrl = new URL(
            "https://thumbnails.roblox.com/v1/users/avatar-headshot"
        );

        robloxUrl.searchParams.set(
            "userIds",
            userIds
        );

        robloxUrl.searchParams.set(
            "size",
            size
        );

        robloxUrl.searchParams.set(
            "format",
            format
        );

        robloxUrl.searchParams.set(
            "isCircular",
            isCircular
        );

        console.log(
            "Getting Roblox avatar:",
            robloxUrl.toString()
        );

        try {
            const response = await fetch(
                robloxUrl.toString(),
                {
                    method: "GET",

                    headers: {
                        "Accept": "application/json",
                        "User-Agent":
                            "Mozilla/5.0"
                    }
                }
            );

            const text =
                await response.text();

            console.log(
                "Roblox avatar status:",
                response.status
            );

            // -----------------------------
            // API error
            // -----------------------------

            if (!response.ok) {
                return res.status(
                    response.status
                ).json({
                    error:
                        "Roblox thumbnail API returned an error",
                    status:
                        response.status,
                    details:
                        text
                });
            }

            // -----------------------------
            // Parse response
            // -----------------------------

            let data;

            try {
                data = JSON.parse(text);
            } catch (error) {
                return res.status(502).json({
                    error:
                        "Roblox returned invalid thumbnail JSON",
                    raw:
                        text
                });
            }

            // -----------------------------
            // Get image URL
            // -----------------------------

            const imageUrl =
                data?.data?.[0]?.imageUrl;

            if (
                !imageUrl ||
                !/^https?:\/\//i.test(
                    imageUrl
                )
            ) {
                return res.status(404).json({
                    error:
                        "Roblox did not return an avatar image",
                    response:
                        data
                });
            }

            // -----------------------------
            // Redirect browser to image
            // -----------------------------

            res.setHeader(
                "Location",
                imageUrl
            );

            return res.status(302).end();

        } catch (error) {
            console.error(
                "Roblox avatar error:",
                error
            );

            return res.status(502).json({
                error:
                    "Unable to connect to Roblox",
                details:
                    error?.message ||
                    String(error)
            });
        }
    }

    // ============================================================
    // INVALID ACTION
    // ============================================================

    return res.status(400).json({
        error: "Invalid action",
        availableActions: [
            "ping",
            "search",
            "avatar"
        ]
    });
}
