# Robux UI Demo — Vercel

## Files

- `index.html` — the frontend
- `api/roblox.js` — Vercel serverless proxy for Roblox public user search/avatar thumbnails
- `package.json` — minimal project metadata
- `vercel.json` — Vercel function configuration

## Deploy

1. Create a GitHub repository.
2. Upload all files/folders from this project.
3. Import the repository into Vercel.
4. Deploy with the default settings.
5. The site will use `/api/roblox` automatically.

## Test

After deployment, test:

`https://YOUR-VERCEL-DOMAIN.vercel.app/api/roblox?action=search&keyword=hann&limit=10`

The avatar endpoint is:

`https://YOUR-VERCEL-DOMAIN.vercel.app/api/roblox?action=avatar&userIds=1`

This project is a visual simulation. It does not transfer Robux or collect Roblox passwords, cookies, authentication codes, or payment information.
