// Turns raw fixtures and odds into the numbers shown on a match briefing.

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const FINISHED = new Set(['FT', 'AET', 'PEN']);

export function statusGroup(short) {
  if (LIVE.has(short)) return 'live';
  if (FINISHED.has(short)) return 'finished';
  return 'upcoming';
}

const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);
const time = (iso) => new Date(iso).getTime();

// A team's last 10 finished games before a given moment, from that team's point of view.
export function teamGames(teamId, fixtures, { excludeId, before } = {}) {
  const cutoff = before ? time(before) : Infinity;
  return fixtures
    .filter((f) => statusGroup(f.status.short) === 'finished'
      && f.goals.home != null && f.id !== excludeId && time(f.date) < cutoff)
    .sort((a, b) => time(b.date) - time(a.date))
    .slice(0, 10)
    .map((f) => {
      const isHome = f.home.id === teamId;
      const gf = isHome ? f.goals.home : f.goals.away;
      const ga = isHome ? f.goals.away : f.goals.home;
      return {
        id: f.id,
        date: f.date,
        league: f.league.name,
        venue: isHome ? 'H' : 'A',
        opponent: isHome ? f.away.name : f.home.name,
        gf,
        ga,
        htFor: isHome ? f.halftime.home : f.halftime.away,
        htAgainst: isHome ? f.halftime.away : f.halftime.home,
        result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
      };
    });
}

export function summarize(games) {
  const n = games.length;
  const count = (fn) => games.filter(fn).length;
  const sum = (fn) => games.reduce((s, g) => s + fn(g), 0);
  const scored = sum((g) => g.gf);
  const conceded = sum((g) => g.ga);
  const withHt = games.filter((g) => g.htFor != null);
  const scoredWithHt = withHt.reduce((s, g) => s + g.gf, 0);
  const concededWithHt = withHt.reduce((s, g) => s + g.ga, 0);
  const wins = count((g) => g.result === 'W');
  const draws = count((g) => g.result === 'D');
  return {
    played: n,
    wins,
    draws,
    losses: count((g) => g.result === 'L'),
    pointsPerGame: n ? +((3 * wins + draws) / n).toFixed(2) : null,
    avgScored: n ? +(scored / n).toFixed(2) : null,
    avgConceded: n ? +(conceded / n).toFixed(2) : null,
    over15: pct(count((g) => g.gf + g.ga >= 2), n),
    over25: pct(count((g) => g.gf + g.ga >= 3), n),
    over35: pct(count((g) => g.gf + g.ga >= 4), n),
    btts: pct(count((g) => g.gf > 0 && g.ga > 0), n),
    cleanSheets: pct(count((g) => g.ga === 0), n),
    failedToScore: pct(count((g) => g.gf === 0), n),
    // Share of goals that came in the first half.
    firstHalfScored: pct(withHt.reduce((s, g) => s + g.htFor, 0), scoredWithHt),
    firstHalfConceded: pct(withHt.reduce((s, g) => s + g.htAgainst, 0), concededWithHt),
  };
}

export function h2hSummary(teamA, teamB, fixtures, { excludeId, before } = {}) {
  const cutoff = before ? time(before) : Infinity;
  const games = fixtures
    .filter((f) => statusGroup(f.status.short) === 'finished'
      && f.goals.home != null && f.id !== excludeId && time(f.date) < cutoff)
    .sort((a, b) => time(b.date) - time(a.date))
    .slice(0, 10);
  let aWins = 0; let bWins = 0; let draws = 0; let goals = 0; let over25 = 0; let btts = 0;
  const list = games.map((f) => {
    const hg = f.goals.home;
    const ag = f.goals.away;
    goals += hg + ag;
    if (hg + ag >= 3) over25 += 1;
    if (hg > 0 && ag > 0) btts += 1;
    const winner = hg > ag ? f.home.id : ag > hg ? f.away.id : null;
    if (winner === teamA) aWins += 1;
    else if (winner === teamB) bWins += 1;
    else draws += 1;
    return {
      id: f.id, date: f.date, league: f.league.name,
      home: f.home.name, away: f.away.name, homeGoals: hg, awayGoals: ag,
    };
  });
  const n = games.length;
  return {
    played: n,
    teamAWins: aWins,
    teamBWins: bWins,
    draws,
    avgGoals: n ? +(goals / n).toFixed(2) : null,
    over25: pct(over25, n),
    btts: pct(btts, n),
    games: list,
  };
}

const MARKETS = [
  { key: '1X2', label: 'Match result', outcomes: ['home', 'draw', 'away'] },
  { key: 'OU25', label: 'Total goals 2.5', outcomes: ['over', 'under'] },
  { key: 'BTTS', label: 'Both teams to score', outcomes: ['yes', 'no'] },
];

// books: [{ bookmaker, markets: { '1X2': { home, draw, away }, OU25: {...}, BTTS: {...} } }]
export function oddsSummary(books) {
  if (!books || !books.length) return null;
  const markets = [];
  for (const m of MARKETS) {
    const rows = books.filter((b) => b.markets[m.key]);
    if (!rows.length) continue;
    const fair = Object.fromEntries(m.outcomes.map((k) => [k, 0]));
    let marginTotal = 0;
    for (const b of rows) {
      const inverse = m.outcomes.map((k) => 1 / b.markets[m.key][k]);
      const total = inverse.reduce((s, x) => s + x, 0);
      marginTotal += total - 1;
      m.outcomes.forEach((k, i) => { fair[k] += inverse[i] / total; });
    }
    markets.push({
      key: m.key,
      label: m.label,
      margin: +((100 * marginTotal) / rows.length).toFixed(1),
      outcomes: m.outcomes.map((k) => {
        let best = null;
        for (const b of rows) {
          const odd = b.markets[m.key][k];
          if (!best || odd > best.odd) best = { odd, bookmaker: b.bookmaker };
        }
        return {
          key: k,
          best,
          impliedBest: Math.round(100 / best.odd), // chance the best price suggests
          marketView: Math.round((100 * fair[k]) / rows.length), // average chance, margin removed
        };
      }),
      bookmakers: rows.map((b) => ({ name: b.bookmaker, prices: m.outcomes.map((k) => b.markets[m.key][k]) })),
    });
  }
  return markets.length ? { markets, bookmakerCount: books.length } : null;
}
