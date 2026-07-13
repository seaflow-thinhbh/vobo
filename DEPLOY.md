# Deploying Vobo

Vobo is two deployables that must be hosted differently:

| Package | Host | Why |
|---|---|---|
| `apps/web` (Next.js) | **Vercel** (serverless) | Static/SSR frontend — Vercel's home turf. |
| `apps/server` (Socket.IO) | **Railway / Render / Fly.io** (persistent Node) | Stateful, always-on, holds rooms in RAM + long-lived WebSockets + turn timers. **Cannot** run on Vercel serverless. |

Deploy the **server first**, note its public URL, then deploy the **web** pointing at it.

---

## 1. Server → Railway (or Render / Fly.io / any Docker host)

The repo root has a `Dockerfile` (builds the server + its `@vobo/game-engine` workspace dep), plus `railway.json` and `render.yaml`.

**Railway**
1. New Project → Deploy from GitHub repo → pick this repo. Railway detects the `Dockerfile`.
2. Once deployed, open Settings → Networking → **Generate Domain** → copy the URL (e.g. `https://vobo-server-production.up.railway.app`).
3. Variables → add `WEB_ORIGIN` = your web URL (set after step 2 of the web deploy; e.g. `https://vobo.vercel.app`). Leave unset to allow all origins.
4. `PORT` is injected automatically; the server reads `process.env.PORT`.

**Render** — New → Blueprint → this repo (uses `render.yaml`), or New → Web Service → Docker. Set `WEB_ORIGIN` the same way. Health check path is `/healthz`.

**Verify:** open `https://<server-url>/healthz` in a browser → should print `vobo-server ok`.

---

## 2. Web → Vercel

`apps/web` has **no workspace dependency** (it re-declares the client types), so it deploys cleanly on its own.

1. Vercel → Add New → Project → import this repo.
2. **Root Directory: `apps/web`** (Vercel then auto-detects Next.js; a `vercel.json` is included).
3. Environment Variables → add:
   ```
   NEXT_PUBLIC_SERVER_URL = https://<your-server-url>
   ```
   This is **required** on Vercel — the LAN auto-detect (`window.location.hostname:3001`) only applies locally; here the client must point at the separately-hosted server. The env var takes priority over the auto-detect.
4. Deploy. Then go back to the server host and set `WEB_ORIGIN` to this Vercel URL, and redeploy the server.

---

## Notes

- **Rooms are in-memory:** a server restart/redeploy drops in-progress games (acceptable for a casual game; documented in the spec). To survive restarts or scale to multiple instances later, add a Redis-backed `RoomStore` + the Socket.IO Redis adapter — the `RoomStore` interface is the seam for that; no game logic changes.
- **CORS:** the server allows all origins unless `WEB_ORIGIN` is set. Always set it in production.
- **Local dev is unchanged:** `pnpm dev` runs both (server on :3001, web on :3000) with no env config needed.
