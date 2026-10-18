// Real data from API-Football (api-sports.io).
// Every call is cached, so many users viewing the same match cost one request.
import { LEAGUES, LEAGUE_IDS, todayIn } from '../leagues.js';

const BASE = 'https://v3.football.api-sports.io';
const HOUR = 3600;
const FINISHED = new Set(['FT', 'AET', 'PEN']);

export function normFixture(f) {
  return {
    id: f.fixture.id,
    date: f.fixture.date,
    status: {
      short: f.fixture.status.short,
      long: f.fixture.status.long,
      elapsed: f.fixture.status.elapsed,
    },
    referee: f.fixture.referee || null,
    venue: f.fixture.venue?.name || null,
    league: { id: f.league.id, name: f.league.name, round: f.league.round, season: f.league.season },
    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
    goals: { home: f.goals.home, away: f.goals.away },
    halftime: { home: f.score?.halftime?.home ?? null, away: f.score?.halftime?.away ?? null },
  };
}

function normLineup(l) {
  const player = (p) => ({ name: p.player.name, number: p.player.number, pos: p.player.pos });
  return {
    teamId: l.team.id,
    team: l.team.name,
    formation: l.formation,
    coach: l.coach?.name || null,
    startXI: (l.startXI || []).map(player),
    substitutes: (l.substitutes || []).map(player),
  };
}

function normOdds(response) {
  const bookmakers = response[0]?.bookmakers || [];
  return bookmakers.map((b) => {
    const markets = {};
    const price = (bet, label) => {
      const v = bet.values.find((x) => String(x.value) === label);
      const n = v ? Number(v.odd) : NaN;
      return Number.isFinite(n) && n > 1 ? n : null;
    };
    const all = (obj) => (Object.values(obj).every((x) => x !== null) ? obj : null);
    for (const bet of b.bets || []) {
      if (bet.name === 'Match Winner') {
        markets['1X2'] = all({ home: price(bet, 'Home'), draw: price(bet, 'Draw'), away: price(bet, 'Away') });
      } else if (bet.name === 'Goals Over/Under') {
        markets.OU25 = all({ over: price(bet, 'Over 2.5'), under: price(bet, 'Under 2.5') });
      } else if (bet.name === 'Both Teams Score') {
        markets.BTTS = all({ yes: price(bet, 'Yes'), no: price(bet, 'No') });
      }
    }
    for (const k of Object.keys(markets)) if (!markets[k]) delete markets[k];
    return { bookmaker: b.name, markets };
  }).filter((b) => Object.keys(b.markets).length);
}

function normStandings(response) {
  const groups = response[0]?.league?.standings || [];
  return groups.flat().map((s) => ({
    rank: s.rank,
    team: { id: s.team.id, name: s.team.name, logo: s.team.logo },
    played: s.all.played,
    win: s.all.win,
    draw: s.all.draw,
    lose: s.all.lose,
    gf: s.all.goals.for,
    ga: s.all.goals.against,
    gd: s.goalsDiff,
    points: s.points,
    form: s.form || '',
    description: s.description || null,
    group: s.group || null,
  }));
}

export function createApiFootballProvider({ key, season, timezone }) {
  const cache = new Map();
  const inflight = new Map();
  const usage = { day: null, count: 0, remaining: null };

  function countRequest(res) {
    const day = new Date().toISOString().slice(0, 10);
    if (usage.day !== day) { usage.day = day; usage.count = 0; }
    usage.count += 1;
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    if (remaining !== null) usage.remaining = Number(remaining);
  }

  async function call(path, params, ttlSeconds) {
    const qs = new URLSearchParams(params).toString();
    const cacheKey = `${path}?${qs}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.data;
    if (inflight.has(cacheKey)) return inflight.get(cacheKey);

    const request = (async () => {
      try {
        const res = await fetch(`${BASE}${path}?${qs}`, { headers: { 'x-apisports-key': key } });
        countRequest(res);
        if (!res.ok) throw new Error(`API-Football returned HTTP ${res.status} for ${path}`);
        const body = await res.json();
        const errors = body.errors;
        const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0;
        if (hasErrors) throw new Error(`API-Football error for ${path}: ${JSON.stringify(errors)}`);
        cache.set(cacheKey, { data: body.response, expires: Date.now() + ttlSeconds * 1000 });
        return body.response;
      } catch (err) {
        if (hit) {
          console.warn(`${err.message} (showing older cached data)`);
          return hit.data;
        }
        throw err;
      } finally {
        inflight.delete(cacheKey);
      }
    })();
    inflight.set(cacheKey, request);
    return request;
  }

  // Drop cache entries that expired more than 6 hours ago.
  setInterval(() => {
    const limit = Date.now() - 6 * HOUR * 1000;
    for (const [k, v] of cache) if (v.expires < limit) cache.delete(k);
  }, HOUR * 1000).unref();

  const ours = (list) => list.filter((f) => LEAGUE_IDS.has(f.league.id)).map(normFixture);

  return {
    mode: 'live',
    usage,

    async fixturesByDate(date) {
      const ttl = date === todayIn(timezone) ? 600 : 1800;
      return ours(await call('/fixtures', { date, timezone }, ttl));
    },

    async liveFixtures(ttlSeconds = 20) {
      const live = LEAGUES.map((l) => l.id).join('-');
      return ours(await call('/fixtures', { live, timezone }, ttlSeconds));
    },

    async fixture(id, { ttl = 60 } = {}) {
      const r = await call('/fixtures', { id, timezone }, ttl);
      return r[0] ? normFixture(r[0]) : null;
    },

    // Free API-Football plans block the "last" parameter, so we fetch the team's
    // season and pick the most recent finished games ourselves.
    async teamLast(teamId) {
      const finished = (list) => list.filter((f) => FINISHED.has(f.fixture.status.short));
      let games = finished(await call('/fixtures', { team: teamId, season, timezone }, 3 * HOUR));
      if (games.length < 10) {
        // Early in the season: top up with last season's games.
        try {
          games = games.concat(finished(await call('/fixtures', { team: teamId, season: season - 1, timezone }, 24 * HOUR)));
        } catch (err) {
          console.warn(`Previous season unavailable for team ${teamId}: ${err.message}`);
        }
      }
      return games.map(normFixture);
    },

    async h2h(a, b) {
      return (await call('/fixtures/headtohead', { h2h: `${a}-${b}`, timezone }, 12 * HOUR)).map(normFixture);
    },

    async injuries(fixtureId) {
      const r = await call('/injuries', { fixture: fixtureId }, 3 * HOUR);
      return r.map((i) => ({ teamId: i.team.id, player: i.player.name, type: i.player.type, reason: i.player.reason }));
    },

    async lineups(fixtureId, kickoff) {
      const soon = kickoff - Date.now() < 2 * HOUR * 1000;
      const r = await call('/fixtures/lineups', { fixture: fixtureId }, soon ? 300 : HOUR);
      return r.map(normLineup);
    },

    async odds(fixtureId) {
      return normOdds(await call('/odds', { fixture: fixtureId }, 1800));
    },

    async standings(leagueId) {
      return normStandings(await call('/standings', { league: leagueId, season }, 6 * HOUR));
    },
  };
}
