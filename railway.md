# Railway deployment

Two backend services to deploy as separate Railway services. The Studio
is a static SPA and is best deployed separately on Vercel or Netlify.

## Services

| Service | Port | Dockerfile | Required env |
|---------|------|------------|--------------|
| `clawforger-facilitator` | 3701 | `packages/x402-facilitator/Dockerfile` | `DEPLOYER_PRIVATE_KEY` (signs receipts) |
| `clawforger-market` | 3700 | `packages/x402-skill-market/Dockerfile` | `DEPLOYER_PRIVATE_KEY`, `KEEPERHUB_API_KEY`, `X402_FACILITATOR_URL` |

Both share the repo root as build context (the Dockerfiles `COPY` the
whole workspace because Bun needs `package.json` workspace resolution).

## Step-by-step

### 1. Push everything

```bash
git push origin main
```

Confirm `Dockerfile`s are present at:
- `packages/x402-facilitator/Dockerfile`
- `packages/x402-skill-market/Dockerfile`

### 2. Create the **facilitator** service on Railway

1. Railway dashboard → **New Project** → **Deploy from GitHub Repo** → pick `ClawForger/clawforger`
2. **Settings** → **Build**:
   - **Builder**: `Dockerfile`
   - **Dockerfile Path**: `packages/x402-facilitator/Dockerfile`
   - **Build Context**: `/` (repo root)
3. **Settings** → **Variables**:
   ```
   DEPLOYER_PRIVATE_KEY = 0x... (same key from your local .env)
   PORT                 = 3701
   ZG_GALILEO_RPC       = https://evmrpc-testnet.0g.ai
   ```
4. **Settings** → **Networking** → **Generate Public Domain**
   You'll get something like `clawforger-facilitator-production.up.railway.app`
5. Wait for first build (~2 min). Verify:
   ```bash
   curl https://<your-facilitator-url>/health
   # → {"ok":true,"facilitator":"0x...","network":"0g-galileo-testnet"}
   ```

### 3. Create the **market** service

Same project (or new project), separate service:
1. **+ New** → **GitHub Repo** → same repo
2. **Settings** → **Build**:
   - **Builder**: `Dockerfile`
   - **Dockerfile Path**: `packages/x402-skill-market/Dockerfile`
   - **Build Context**: `/`
3. **Settings** → **Variables**:
   ```
   DEPLOYER_PRIVATE_KEY    = 0x... (same key)
   KEEPERHUB_API_KEY       = kh_...
   KEEPERHUB_MCP_URL       = https://app.keeperhub.com/api
   X402_FACILITATOR_URL    = https://<facilitator-url>   ← from step 2.4
   PORT                    = 3700
   ZG_GALILEO_RPC          = https://evmrpc-testnet.0g.ai
   ```
4. **Networking** → **Generate Public Domain** → e.g. `clawforger-market-production.up.railway.app`
5. Verify:
   ```bash
   curl https://<your-market-url>/health
   ```

### 4. Point the Studio at the deployed services

Edit `apps/studio/.env.production` (or set as env vars in your static
host):

```
VITE_X402_MARKET_URL=https://<your-market-url>
VITE_DEFAULT_CHAIN=0g-galileo-testnet
VITE_WALLETCONNECT_PROJECT_ID=<get from cloud.walletconnect.com>
```

Then deploy the studio:

```bash
# Option A: Vercel (recommended for SPAs)
cd apps/studio
vercel --prod

# Option B: Railway (also works — add a Dockerfile or use buildpack)
```

Wire `clawforger.xyz` (or your domain) to the Studio's URL via
DNS / your DNS provider.

## Security notes — read before deploying

1. **`DEPLOYER_PRIVATE_KEY` is sensitive.** Railway env vars are encrypted
   at rest, but anyone with project access can read them. For a hackathon
   testnet wallet this is fine. For production: rotate to a dedicated
   facilitator key, enable Railway team RBAC, and never reuse the
   deployer wallet for other purposes.
2. **`KEEPERHUB_API_KEY`** — same drill. The one in this transcript was
   shared earlier; rotate before going public.
3. **CORS** — both servers use `cors({ origin: '*' })` for hackathon ease.
   For production, restrict to your studio's domain:
   `cors({ origin: 'https://clawforger.xyz' })`.
4. **No persistent storage needed** — the market server's `LocalSkillIndex`
   auto-syncs from chain on every request. Server can restart any time
   without state loss. Don't bother with Railway volumes.

## Healthcheck recommendation

Both services expose `GET /health`. Add to Railway's service settings:

- **Healthcheck Path**: `/health`
- **Healthcheck Timeout**: 30s
- **Restart Policy**: On Failure
- **Max Retries**: 5

## Checking it works end-to-end after deploy

1. Studio loads at your domain
2. Connect wallet, mint mUSDC, mint an agent
3. Run `examples/researcher` locally pointing at the deployed market:
   ```
   X402_MARKET_URL=https://<market-url> bun run examples/researcher/src/index.ts
   ```
   (The example currently doesn't read this var — just for reference;
   you'd update the examples to use VITE-style env if you want them to
   hit the deployed market.)
4. `/market` should show the published skill
5. Click **try it** → **pay 0.05 mUSDC & run** — expect a settle tx in <30s

## Cost estimate

Railway Hobby tier ($5/month + usage) easily covers two always-on Bun
services for a demo. Each service uses < 100 MB RAM and < 1 vCPU under
demo load. Expected monthly bill if you keep it up: $5–10.
