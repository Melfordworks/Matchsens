import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUES, LEAGUE_IDS, todayIn, defaultSeason, isDateString } from './src/leagues.js';
import { statusGroup } from './src/stats.js';
import { buildBriefing } from './src/briefing.js';
import { createApiFootballProvider } from './src/providers/apiFootball.js';
import { createDemoProvider } from './src/providers/demo.js';

const root = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(root, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const TIMEZONE = process.env.TIMEZONE || 'Africa/Lagos';
const SEASON = Number(process.env.SEASON) || defaultSeason();
const POLL_SECONDS = Math.max(15, Number(process.env.POLL_SECONDS) || 30);
const API_KEY = (process.env.API_FOOTBALL_KEY || '').trim();

const provider = API_KEY
  ? createApiFootballProvider({ key: API_KEY, season: SEASON, timezone: TIMEZONE })
  : createDemoProvider();

// ---------- Live score poller ----------
// Only asks the API for live scores when a match in our leagues is on, to save requests.

const live = new Map(); // fixture id -> latest live fixture
const justFinished = new Map(); // fixture id -> { fixture, until }
const clients = new Set();

function broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(message);
}

const changed = (a, b) => !a
  || a.goals.home !== b.goals.home || a.goals.away !== b.goals.away
  || a.status.short !== b.status.short || a.status.elapsed !== b.status.elapsed;

function matchWindowOpen(fixtures) {
  const now = Date.now();
  return fixtures.some((f) => {
    const group = statusGroup(f.status.short);
    if (group === 'live') return true;
    if (group === 'finished') return false;
    const kickoff = new Date(f.date).getTime();
    return now > kickoff - 10 * 60000 && now < kickoff + 150 * 60000;
  });
}

async function poll() {
  try {
    const today = await provider.fixturesByDate(todayIn(TIMEZONE));
    if (!matchWindowOpen(today) && live.size === 0) return;

    const current = await provider.liveFixtures(POLL_SECONDS - 5);
    const updates = [];
    const seen = new Set();
    for (const f of current) {
      seen.add(f.id);
      if (changed(live.get(f.id), f)) updates.push(f);
      live.set(f.id, f);
    }
    // Matches that dropped off the live list have ended: fetch the final score once.
    for (const id of [...live.keys()]) {
      if (seen.has(id)) continue;
      live.delete(id);
      try {
        const final = await provider.fixture(id, { ttl: 5 });
        if (final) {
          justFinished.set(id, { fixture: final, until: Date.now() + 6 * 3600000 });
          updates.push(final);
        }
      } catch (err) {
        console.warn(`Could not fetch final score for ${id}: ${err.message}`);
      }
    }
    for (const [id, entry] of justFinished) if (entry.until < Date.now()) justFinished.delete(id);
    if (updates.length) broadcast('update', updates);
  } catch (err) {
    console.error(`Live update failed: ${err.message}`);
  }
}

function startPolling() {
  const run = async () => {
    await poll();
    setTimeout(run, POLL_SECONDS * 1000);
  };
  run();
}

const freshest = (f) => live.get(f.id) || justFinished.get(f.id)?.fixture || f;

// ---------- Web server ----------

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(root, 'public'), { maxAge: '1h' }));

const route = (handler) => (req, res) => handler(req, res).catch((err) => {
  console.error(`${req.method} ${req.originalUrl} failed: ${err.message}`);
  res.status(502).json({ error: 'The football data service did not respond. Try again in a minute.' });
});

app.get('/api/status', (req, res) => {
  res.json({
    mode: provider.mode,
    season: SEASON,
    timezone: TIMEZONE,
    pollSeconds: POLL_SECONDS,
    requestsToday: provider.usage?.count ?? null,
    requestsRemaining: provider.usage?.remaining ?? null,
  });
});

app.get('/api/leagues', (req, res) => res.json({ leagues: LEAGUES }));

app.get('/api/fixtures', route(async (req, res) => {
  const date = isDateString(req.query.date) ? req.query.date : todayIn(TIMEZONE);
  const fixtures = (await provider.fixturesByDate(date)).map(freshest);
  res.set('Cache-Control', 'no-store').json({ date, fixtures });
}));

app.get('/api/standings/:leagueId', route(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!LEAGUE_IDS.has(leagueId)) return res.status(404).json({ error: 'This league is not covered.' });
  const league = LEAGUES.find((l) => l.id === leagueId);
  return res.json({ league, rows: await provider.standings(leagueId) });
}));

app.get('/api/match/:id', route(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'That match link is not valid.' });
  const briefing = await buildBriefing(provider, id, live.get(id) || justFinished.get(id)?.fixture);
  if (!briefing) return res.status(404).json({ error: 'Match not found.' });
  return res.set('Cache-Control', 'no-store').json(briefing);
}));

// Server-Sent Events: browsers stay connected and receive score changes as they happen.
app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: update\ndata: ${JSON.stringify([...live.values()])}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, () => {
  console.log(`Matchsense running on http://localhost:${PORT}`);
  console.log(provider.mode === 'demo'
    ? 'Demo mode: no API_FOOTBALL_KEY set, showing simulated matches.'
    : `Live mode: API-Football, season ${SEASON}, time zone ${TIMEZONE}, live updates every ${POLL_SECONDS}s.`);
  startPolling();
});

// Reads KEY=value lines from a local .env file, if there is one.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
