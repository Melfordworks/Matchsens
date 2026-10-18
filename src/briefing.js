import { teamGames, summarize, h2hSummary, oddsSummary } from './stats.js';

// Gathers everything shown on a match page. Each data source can fail on its own
// without breaking the page: that section just shows as unavailable.
export async function buildBriefing(provider, fixtureId, overlay) {
  let fixture = await provider.fixture(fixtureId);
  if (!fixture) return null;
  if (overlay) fixture = overlay; // fresher live score from the poller

  const kickoff = new Date(fixture.date).getTime();
  const safe = async (promise) => {
    try {
      return { ok: true, value: await promise };
    } catch (err) {
      console.warn(`[briefing ${fixtureId}] ${err.message}`);
      return { ok: false, value: null };
    }
  };

  const [homeLast, awayLast, h2h, injuries, lineups, odds, table] = await Promise.all([
    safe(provider.teamLast(fixture.home.id)),
    safe(provider.teamLast(fixture.away.id)),
    safe(provider.h2h(fixture.home.id, fixture.away.id)),
    safe(provider.injuries(fixture.id)),
    safe(provider.lineups(fixture.id, kickoff)),
    safe(provider.odds(fixture.id)),
    safe(provider.standings(fixture.league.id)),
  ]);

  const opts = { excludeId: fixture.id, before: fixture.date };
  const hg = homeLast.ok ? teamGames(fixture.home.id, homeLast.value, opts) : [];
  const ag = awayLast.ok ? teamGames(fixture.away.id, awayLast.value, opts) : [];
  const standing = (teamId) => (table.ok ? table.value.find((r) => r.team.id === teamId) || null : null);
  const restDays = (games) => (games[0]
    ? Math.floor((kickoff - new Date(games[0].date).getTime()) / 86400000)
    : null);
  const byTeam = (list, teamId) => list.filter((x) => x.teamId === teamId);

  return {
    fixture,
    form: {
      available: homeLast.ok && awayLast.ok,
      home: { games: hg, all: summarize(hg), venue: summarize(hg.filter((g) => g.venue === 'H')) },
      away: { games: ag, all: summarize(ag), venue: summarize(ag.filter((g) => g.venue === 'A')) },
    },
    h2h: h2h.ok ? h2hSummary(fixture.home.id, fixture.away.id, h2h.value, opts) : null,
    injuries: injuries.ok
      ? { home: byTeam(injuries.value, fixture.home.id), away: byTeam(injuries.value, fixture.away.id) }
      : null,
    lineups: lineups.ok ? lineups.value : null,
    context: {
      home: { standing: standing(fixture.home.id), restDays: restDays(hg) },
      away: { standing: standing(fixture.away.id), restDays: restDays(ag) },
    },
    odds: odds.ok ? oddsSummary(odds.value) : null,
    generatedAt: new Date().toISOString(),
  };
}
