# Market Desk Pro

A private, installable web app for tracking and analysing an Indian equity portfolio:

- **Market core**: a live 3D breadth globe of 50 large-cap NSE stocks, with A/D ratio, TRIN, breadth momentum, % above 50/200-DMA, 52-week highs/lows, sector breadth, movers and an event tape.
- **Command**: portfolio vs Nifty 50, drawdown, allocation, risk alerts and **Ask Claude**.
- **Risk**: VaR/CVaR, historical VaR, tracking error, risk contribution, correlation matrix and sector exposure, all computed from real daily prices.
- **Stress**: COVID-2020, 2008, rate-hike, crude, rupee and election scenarios, a custom Nifty shock and a Monte Carlo projection.
- **Optimizer**: an efficient frontier of the user's own holdings.
- **Derivatives & hedge**: an options payoff lab with Greeks, plus a portfolio hedge desk (futures vs puts).
- **Alpha lab**: a signal scanner (RSI, z-score, momentum, MACD, SMA trend), pair-trading z-score and Kelly sizing.
- **Positions**: per-stock flags (Safe / Watch / Risky) with the reasons.
- **Tools**: position sizing and SIP calculators.
- **Connect**: Upstox and Zerodha (official logins, read-only), CSV import for any broker, and manual entry.

The app **only reads data. It cannot place orders**, and it never sees broker passwords: users log in on the broker's own page.
Until a broker is connected it shows a clearly labelled demo portfolio and a simulated market.

---

## What you need (about 30 minutes, one time)

| Account | Why | Cost |
|---|---|---|
| GitHub | Holds the code | Free |
| Vercel | Hosts the app at `https://your-name.vercel.app` | Free Hobby plan (personal use) |
| Upstox developer app *(recommended)* | Holdings, live quotes and price history | Upstox lists its APIs as free |
| Zerodha Kite Connect app *(if he uses Zerodha)* | Holdings (free Personal plan); live data and history need the paid Connect plan | ₹0 or ₹500 per month |
| Anthropic API key *(optional)* | Free-form "Ask Claude" questions | Pay per use (small) |

Talha should create the broker developer apps **from his own broker accounts**, because broker API apps are tied to the account that owns them.

---

## Step 1: Put the code on GitHub

1. Create a free account at github.com and click **New repository**. Name it `market-desk-pro` and make it **Private**.
2. Click **uploading an existing file**, drag in **everything inside this folder** (not the folder itself), and click **Commit changes**.
   - Don't upload a `.env` file. It holds secrets, and `.gitignore` already excludes it.

## Step 2: Deploy on Vercel

1. Sign in at vercel.com with GitHub, choose **Add New → Project**, and import `market-desk-pro`.
2. Leave **Framework Preset** as **Other**. The build settings come from `vercel.json`, so there's nothing to change.
3. Open **Environment Variables** and add:

| Name | Value |
|---|---|
| `APP_PASSWORD` | The password Talha will use to open the app |
| `SESSION_SECRET` | A random string of at least 32 characters (e.g. from a password manager) |
| `PUBLIC_URL` | Your app address, e.g. `https://market-desk-pro.vercel.app` (add after the first deploy if you don't know it yet) |

4. Click **Deploy**. Open the URL and log in with `APP_PASSWORD`. The demo portfolio will show.

Any time you change environment variables, go to **Deployments → ⋯ → Redeploy**.

## Step 3: Connect Upstox (recommended: free live data)

1. Log in to the Upstox developer portal with Talha's Upstox account and create a new app.
2. Set the **Redirect URL** to exactly `https://YOUR-APP.vercel.app/api/upstox-callback`
3. Copy the **API Key** and **API Secret** into Vercel as `UPSTOX_API_KEY` and `UPSTOX_API_SECRET`, then redeploy.
4. In the app, go to **Connect → Connect Upstox** and log in on Upstox's page. Holdings, live quotes and history appear.

## Step 4: Connect Zerodha (if he uses Zerodha)

1. Sign in at developers.kite.trade with his Zerodha account and create an app.
   - **Personal** (free) gives holdings only.
   - **Connect** (₹500 per month) adds live quotes and history.
2. Set the **Redirect URL** to `https://YOUR-APP.vercel.app/api/kite-callback`
3. Add `KITE_API_KEY` and `KITE_API_SECRET` in Vercel, then redeploy. Click **Connect Zerodha** in the app.

If both brokers are connected, holdings are merged by symbol. Market data comes from Upstox first, then Zerodha.

## Step 5: Groww, Angel One and other apps

In the broker app, export or download the **holdings report** and save it as **CSV**. Then use **Connect → Choose CSV file**.
The file needs columns like *Symbol* (or *ISIN*), *Quantity* and *Average price*. Company names are matched to NSE symbols through the ISIN.
Live prices for these holdings come from whichever of Upstox or Zerodha (Connect plan) is linked.
Imported holdings are stored in that browser only.

## Step 6: Ask Claude (optional)

Create an API key at console.anthropic.com and add it as `ANTHROPIC_API_KEY`.
If the default model name stops working, set `ANTHROPIC_MODEL` to a current model id from Anthropic's docs.
Without a key, the Ask Claude box still shows built-in quick answers.

## Step 7: Install it on his phone

Open the app URL on the phone.

- **Android (Chrome):** menu ⋮ → **Add to Home screen / Install app**
- **iPhone (Safari):** Share → **Add to Home Screen**

It opens full-screen like a normal app.

---

## Daily use

- Broker logins **expire every morning**: Upstox around 3:30 AM and Zerodha around 6 AM IST. When a red banner appears, tap **Reconnect** and log in again. This is the brokers' rule.
- Quotes refresh every 5 seconds while the market is open, and every 60 seconds when it's closed.
- The 3D core shows **LIVE** with the data source when real quotes are flowing, and **SIMULATED MARKET** otherwise.

## Security

- The whole app sits behind `APP_PASSWORD`. Use a strong one.
- Broker access tokens are encrypted (AES-256-GCM) inside an HTTP-only cookie in the user's own browser. Nothing is stored on the server, and there is no database.
- The app only calls read endpoints (holdings, quotes, candles). There is no order-placing code.
- `SESSION_SECRET` signs logins and encrypts tokens. Changing it logs everyone out.

## Running it somewhere else

Any machine with Node 18+ works:

```bash
cp .env.example .env   # fill in the values
node server.js         # http://localhost:3000
```

For a public server (Render, Railway, a VPS), set the same environment variables plus `PUBLIC_URL`, and run `node server.js`.

## Changing the design

The UI source is in `src/`, and the built bundle is `public/app.js`. After editing:

```bash
npm install
npm run build:ui
```

The 50-stock breadth list is in `lib/universe.js`.

## Notes and limits

- Risk numbers use about one year of daily closes. Expected returns are pulled halfway toward a market-risk assumption (risk-free rate 6.5%, equity premium 6%), so past winners don't look unrealistically good.
- Stress scenarios use approximate sector moves, with beta × index move for other stocks. They are teaching tools, not forecasts.
- Option prices are Black-Scholes model values from the sliders, not live option-chain quotes.
- Index membership changes over time. Update `lib/universe.js` occasionally.
- For learning only. This is not investment advice.

## Project layout

```
api/          Server functions (Vercel turns each file into /api/<name>)
lib/          Server helpers: auth, Upstox, Kite, stock universe
src/          React source for the dashboard
public/       Built app served to the browser (index.html, app.js, styles, icons, PWA files)
server.js     Run-anywhere Node server (same API as Vercel)
vercel.json   Vercel settings (no build step needed)
```
