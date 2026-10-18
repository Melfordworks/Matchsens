# Matchsense

Live football scores and pre-match betting briefings for 10 top leagues plus the Champions League and Europa League.

Each match page shows:

- **Context:** league position, points, rest days since the last match, table zone, referee.
- **Form and goals:** last 10 results, with an "All games" or "Home v away only" switch, and side-by-side bars for Over 1.5, 2.5 and 3.5 goals, both teams to score, clean sheets, failed to score, and first-half goals.
- **Head to head:** wins, draws, goals and the last meetings.
- **Team news:** injuries, suspensions and confirmed lineups.
- **Odds:** the best price for match result, Over/Under 2.5 and both teams to score, with implied chance, a margin-free market view and a full bookmaker comparison.

Live scores update on screen without refreshing. Users can star a match to get alerts for kickoff, goals and full time while the app is open.

> "Matchsense" is a placeholder name. Change it in `public/index.html` (title and header) and `public/app.js` (banner and alerts).

---

## How it works

```
API-Football  →  server.js (fetches, caches, polls live scores)  →  web app in the browser
```

One server talks to the data provider and saves every answer for a while, so 1,000 people opening the same match cost a single API request. During matches it checks for score changes every 30 seconds and pushes them to every open browser.

**Demo mode:** with no API key, the app runs on simulated matches (real team names, made-up scores, players and odds). Today's demo matches play out in real time, so you can watch live updates work. A yellow banner shows whenever demo data is on.

---

## Step 1: Get an API-Football key

1. Sign up at **dashboard.api-football.com** (API-Football by API-Sports).
2. Your key is shown on the dashboard. Keep it private, like a password.
3. Check the current plans on their pricing page. The free plan allows about 100 requests a day, which is enough to test but not to run live scores for 12 competitions. Free plans may also limit which seasons you can see. For launch you will need a paid plan with several thousand requests a day.

**Rough daily usage on a busy Saturday:** about 1,000 to 1,500 requests for live scores (one every 30 seconds while matches are on), plus about 9 requests the first time anyone opens a match page (cached for hours after that).

## Step 2: Put the code on GitHub

1. Create a free account at **github.com**.
2. Click **New repository**, name it `matchsense`, set it to **Private**, and create it.
3. Click **uploading an existing file**, drag in everything from this folder **except** `node_modules` and any `.env` file, then click **Commit changes**.

## Step 3: Put it online with Render

1. Create an account at **render.com** and connect your GitHub account.
2. Click **New** then **Web Service**, and pick the `matchsense` repository.
3. Use these settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
4. Under **Environment variables**, add:
   - `API_FOOTBALL_KEY` = your key from Step 1
   - `TIMEZONE` = `Africa/Lagos`
5. Click **Create Web Service**. After a few minutes Render gives you a link like `https://matchsense.onrender.com`.

Leave out `API_FOOTBALL_KEY` at first if you want to see the demo online before paying for data.

**Important:** free Render services go to sleep when nobody visits, which stops live score checks. For real users, choose a paid instance so the server stays awake. Check Render's current pricing.

## Running it on your own computer (optional)

1. Install **Node.js** (version 20 or newer) from nodejs.org.
2. Open a terminal in this folder and run `npm install`, then `npm start`.
3. Open **http://localhost:3000** in your browser.
4. To use real data, copy `.env.example` to a new file named `.env`, paste in your key, and restart.

---

## Settings

| Setting | What it does | Default |
| --- | --- | --- |
| `API_FOOTBALL_KEY` | Your API-Football key. Leave empty for demo mode. | empty |
| `TIMEZONE` | Time zone used to decide which matches are "today". | `Africa/Lagos` |
| `SEASON` | Season year for league tables (2026 means 2026/27). | worked out from the date |
| `POLL_SECONDS` | How often to check live scores during matches (minimum 15). | `30` |
| `PORT` | Web server port. Render sets this itself. | `3000` |

To change which leagues are covered, edit `src/leagues.js`.

## Files

| File | Purpose |
| --- | --- |
| `server.js` | Web server, live score checks, and the data the app requests |
| `src/providers/apiFootball.js` | Talks to API-Football and caches answers |
| `src/providers/demo.js` | Simulated data for demo mode |
| `src/stats.js` | Form, goals-market and odds calculations |
| `src/briefing.js` | Puts a match page's data together |
| `src/leagues.js` | The 12 competitions covered |
| `public/` | The web app people see (HTML, CSS, JavaScript) |

---

## Not built yet (version 2 and beyond)

- **Nigerian bookmaker odds** (Bet9ja, SportyBet, BetKing): API-Football's odds come from the bookmakers it covers. Local prices usually come through affiliate partners' feeds.
- **Push notifications when the app is closed:** needs Firebase Cloud Messaging. Alerts currently work while the app is open in a browser tab.
- **A database:** everything is cached in memory, which is fine at launch. A database (such as PostgreSQL) is needed for the bet tracker, user accounts and the prediction track record.
- **Prediction model, value flags, bet tracker, accumulator checker, corners and cards, xG.**
- **SEO match pages:** pages search engines can read for each fixture. The current app builds pages in the browser, which search engines index poorly.

Before monetizing with affiliate links, get advice from a Nigerian lawyer on gambling advertising rules, and add local support organisations to the "Safer betting" page.
