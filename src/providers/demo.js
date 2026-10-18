// Simulated data so the app works before an API key is added.
// Real team names, made-up matches, scores, players and odds.
// Today's matches play out in real time, so live updates can be tested.
import { LEAGUES } from '../leagues.js';

const TEAMS = {
  39: ['Arsenal', 'Manchester City', 'Liverpool', 'Chelsea', 'Newcastle', 'Tottenham', 'Aston Villa', 'Manchester United', 'Brighton', 'West Ham'],
  140: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Athletic Club', 'Villarreal', 'Real Sociedad', 'Real Betis', 'Girona', 'Sevilla', 'Valencia'],
  135: ['Inter', 'Napoli', 'Juventus', 'AC Milan', 'Atalanta', 'Roma', 'Lazio', 'Bologna', 'Fiorentina', 'Torino'],
  78: ['Bayern Munich', 'Bayer Leverkusen', 'Borussia Dortmund', 'RB Leipzig', 'Stuttgart', 'Eintracht Frankfurt', 'Freiburg', 'Wolfsburg', 'Mainz', 'Union Berlin'],
};
const DEMO_LEAGUES = [39, 140, 135, 78];
const KICKOFF_HOURS_UTC = [12, 14.5, 17, 19];
const BOOKMAKERS = ['Bet365', '1xBet', 'Betway', 'Unibet', 'William Hill'];
const SURNAMES = ['Adeyemi', 'Okafor', 'Silva', 'Martins', 'Keller', 'Rossi', 'Moreno', 'Dubois', 'Hansen', 'Novak', 'Costa', 'Fischer', 'Bianchi', 'Garcia', 'Walker', 'Mensah', 'Diallo', 'Lopez', 'Schmidt', 'Conti', 'Torres', 'Bakker', 'Ivanov', 'Eze', 'Owusu', 'Ferreira', 'Kovac', 'Larsen', 'Moretti', 'Clarke'];
const INITIALS = 'ABCDEFGHJKLMNOPRST';
const REFEREES = ['M. Oliver', 'A. Taylor', 'D. Orsato', 'J. Martinez', 'F. Zwayer', 'S. Hughes'];
const INJURY_REASONS = ['Hamstring injury', 'Knee injury', 'Ankle injury', 'Suspended', 'Illness', 'Muscle injury'];

const DAY = 86400000;

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function random(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda, r) {
  const limit = Math.exp(-lambda);
  let k = 0; let p = 1;
  do { k += 1; p *= r(); } while (p > limit);
  return k - 1;
}

const leagueOf = (teamId) => Math.floor(teamId / 100);
const teamName = (teamId) => TEAMS[leagueOf(teamId)]?.[teamId % 100];
const team = (teamId) => ({ id: teamId, name: teamName(teamId), logo: null });
const leagueInfo = (id) => LEAGUES.find((l) => l.id === id);
const strength = (teamId) => 1.5 - (teamId % 100) * 0.09 + random(`str${teamId}`)() * 0.15;

function expectedGoals(homeId, awayId) {
  const sh = strength(homeId); const sa = strength(awayId);
  return { home: 1.45 * (sh / sa), away: 1.1 * (sa / sh) };
}

function simulate(homeId, awayId, seed) {
  const r = random(seed);
  const xg = expectedGoals(homeId, awayId);
  const minutes = (n) => Array.from({ length: n }, () => 1 + Math.floor(r() * 90)).sort((a, b) => a - b);
  return { home: minutes(poisson(xg.home, r)), away: minutes(poisson(xg.away, r)) };
}

const scoreAt = (sim, minute) => ({
  home: sim.home.filter((m) => m <= minute).length,
  away: sim.away.filter((m) => m <= minute).length,
});

function clock(kickoff, now) {
  const mins = (now - kickoff) / 60000;
  if (mins < 0) return { short: 'NS', long: 'Not Started', elapsed: null, minute: null };
  if (mins < 45) { const m = Math.floor(mins) + 1; return { short: '1H', long: 'First Half', elapsed: m, minute: m }; }
  if (mins < 60) return { short: 'HT', long: 'Halftime', elapsed: 45, minute: 45 };
  if (mins < 108) { const m = Math.min(90, Math.floor(mins - 15) + 1); return { short: '2H', long: 'Second Half', elapsed: m, minute: m }; }
  return { short: 'FT', long: 'Match Finished', elapsed: 90, minute: 90 };
}

function makeFixture({ id, homeId, awayId, kickoff, seed, leagueId, round }) {
  const sim = simulate(homeId, awayId, seed);
  const c = clock(kickoff, Date.now());
  const league = leagueInfo(leagueId);
  return {
    id,
    date: new Date(kickoff).toISOString(),
    status: { short: c.short, long: c.long, elapsed: c.elapsed },
    referee: REFEREES[hash(`ref${id}`) % REFEREES.length],
    venue: null,
    league: { id: leagueId, name: league.name, round, season: null },
    home: team(homeId),
    away: team(awayId),
    goals: c.minute == null ? { home: null, away: null } : scoreAt(sim, c.minute),
    halftime: c.minute != null && c.minute >= 45 ? scoreAt(sim, 45) : { home: null, away: null },
  };
}

// Fixture IDs encode date, league and slot: YYYYMMDD * 100 + leagueIndex * 10 + slot
function scheduledFixture(date, leagueIndex, slot) {
  const leagueId = DEMO_LEAGUES[leagueIndex];
  const ids = TEAMS[leagueId].map((_, i) => leagueId * 100 + i);
  const r = random(`pairs${date}${leagueId}`);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const [y, m, d] = date.split('-').map(Number);
  const hour = KICKOFF_HOURS_UTC[(slot + leagueIndex) % KICKOFF_HOURS_UTC.length];
  const id = Number(date.replaceAll('-', '')) * 100 + leagueIndex * 10 + slot;
  return makeFixture({
    id,
    homeId: ids[slot * 2],
    awayId: ids[slot * 2 + 1],
    kickoff: Date.UTC(y, m - 1, d) + hour * 3600000,
    seed: `match${id}`,
    leagueId,
    round: 'Regular Season - 9',
  });
}

function parseId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1e9) return null;
  const slot = n % 10;
  const leagueIndex = Math.floor(n / 10) % 10;
  const digits = String(Math.floor(n / 100));
  if (digits.length !== 8 || slot > 2 || leagueIndex >= DEMO_LEAGUES.length) return null;
  return { date: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`, leagueIndex, slot };
}

function pastGame(homeId, awayId, daysAgo, seed) {
  const kickoff = Date.now() - daysAgo * DAY;
  return makeFixture({
    id: hash(seed), homeId, awayId, kickoff, seed, leagueId: leagueOf(homeId), round: 'Regular Season',
  });
}

function squad(teamId) {
  const r = random(`squad${teamId}`);
  const start = Math.floor(r() * SURNAMES.length);
  return Array.from({ length: 18 }, (_, i) => ({
    // Stepping by 11 through 30 surnames never repeats within a squad.
    name: `${INITIALS[Math.floor(r() * INITIALS.length)]}. ${SURNAMES[(start + i * 11) % SURNAMES.length]}`,
    number: i + 1,
  }));
}

const FORMATIONS = { '4-3-3': [4, 3, 3], '4-2-3-1': [4, 5, 1], '3-5-2': [3, 5, 2], '4-4-2': [4, 4, 2] };

function lineupFor(teamId) {
  const names = Object.keys(FORMATIONS);
  const formation = names[hash(`form${teamId}`) % names.length];
  const [d, m, f] = FORMATIONS[formation];
  const players = squad(teamId);
  const positions = ['G', ...Array(d).fill('D'), ...Array(m).fill('M'), ...Array(f).fill('F')];
  return {
    teamId,
    team: teamName(teamId),
    formation,
    coach: `${INITIALS[hash(`coach${teamId}`) % INITIALS.length]}. ${SURNAMES[hash(`coach${teamId}`) % SURNAMES.length]}`,
    startXI: players.slice(0, 11).map((p, i) => ({ ...p, pos: positions[i] })),
    substitutes: players.slice(11).map((p) => ({ ...p, pos: null })),
  };
}

function poissonP(k, lambda) {
  let f = 1;
  for (let i = 2; i <= k; i += 1) f *= i;
  return (Math.exp(-lambda) * lambda ** k) / f;
}

function probabilities(homeId, awayId) {
  const xg = expectedGoals(homeId, awayId);
  let home = 0; let draw = 0; let away = 0; let over = 0;
  for (let h = 0; h <= 10; h += 1) {
    for (let a = 0; a <= 10; a += 1) {
      const p = poissonP(h, xg.home) * poissonP(a, xg.away);
      if (h > a) home += p; else if (h === a) draw += p; else away += p;
      if (h + a >= 3) over += p;
    }
  }
  const btts = (1 - Math.exp(-xg.home)) * (1 - Math.exp(-xg.away));
  return { home, draw, away, over, under: 1 - over, yes: btts, no: 1 - btts };
}

export function createDemoProvider() {
  return {
    mode: 'demo',
    usage: null,

    async fixturesByDate(date) {
      const list = [];
      DEMO_LEAGUES.forEach((_, li) => { for (let slot = 0; slot < 3; slot += 1) list.push(scheduledFixture(date, li, slot)); });
      return list;
    },

    async liveFixtures() {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
      const all = [...await this.fixturesByDate(yesterday), ...await this.fixturesByDate(today)];
      return all.filter((f) => ['1H', 'HT', '2H'].includes(f.status.short));
    },

    async fixture(id) {
      const p = parseId(id);
      return p ? scheduledFixture(p.date, p.leagueIndex, p.slot) : null;
    },

    async teamLast(teamId) {
      const leagueId = leagueOf(teamId);
      const others = TEAMS[leagueId].map((_, i) => leagueId * 100 + i).filter((id) => id !== teamId);
      return Array.from({ length: 10 }, (_, k) => {
        const opp = others[hash(`opp${teamId}-${k}`) % others.length];
        const atHome = k % 2 === 0;
        const daysAgo = 4 + k * 7;
        return atHome
          ? pastGame(teamId, opp, daysAgo, `past${teamId}-${k}`)
          : pastGame(opp, teamId, daysAgo, `past${teamId}-${k}`);
      });
    },

    async h2h(a, b) {
      const lo = Math.min(a, b); const hi = Math.max(a, b);
      return Array.from({ length: 6 }, (_, k) => (k % 2 === 0
        ? pastGame(a, b, 60 + k * 170, `h2h${lo}-${hi}-${k}`)
        : pastGame(b, a, 60 + k * 170, `h2h${lo}-${hi}-${k}`)));
    },

    async injuries(fixtureId) {
      const f = await this.fixture(fixtureId);
      if (!f) return [];
      const out = [];
      for (const t of [f.home, f.away]) {
        const r = random(`inj${fixtureId}${t.id}`);
        const players = squad(t.id).slice(11);
        const n = Math.floor(r() * 3);
        for (let i = 0; i < n; i += 1) {
          out.push({
            teamId: t.id,
            player: players[i].name,
            type: r() < 0.3 ? 'Questionable' : 'Missing Fixture',
            reason: INJURY_REASONS[Math.floor(r() * INJURY_REASONS.length)],
          });
        }
      }
      return out;
    },

    async lineups(fixtureId, kickoff) {
      if (Date.now() < kickoff - 3600000) return [];
      const f = await this.fixture(fixtureId);
      return f ? [lineupFor(f.home.id), lineupFor(f.away.id)] : [];
    },

    async odds(fixtureId) {
      const f = await this.fixture(fixtureId);
      if (!f) return [];
      const p = probabilities(f.home.id, f.away.id);
      return BOOKMAKERS.map((name) => {
        const r = random(`odds${fixtureId}${name}`);
        const margin = 0.04 + r() * 0.04;
        const price = (prob) => Math.max(1.01, +(1 / (prob * (1 + margin) * (1 + (r() - 0.5) * 0.06))).toFixed(2));
        return {
          bookmaker: name,
          markets: {
            '1X2': { home: price(p.home), draw: price(p.draw), away: price(p.away) },
            OU25: { over: price(p.over), under: price(p.under) },
            BTTS: { yes: price(p.yes), no: price(p.no) },
          },
        };
      });
    },

    async standings(leagueId) {
      if (!TEAMS[leagueId]) return [];
      const played = 9;
      const rows = TEAMS[leagueId].map((name, i) => {
        const id = leagueId * 100 + i;
        const r = random(`table${id}`);
        const win = Math.max(0, Math.min(played, Math.round(strength(id) * 4 + r() * 2 - 1.5)));
        const draw = Math.min(played - win, Math.floor(r() * 4));
        const lose = played - win - draw;
        const gf = Math.round(win * 2 + draw + r() * 4);
        const ga = Math.round(lose * 1.8 + draw + r() * 3);
        const form = Array.from({ length: 5 }, () => (r() < strength(id) / 2.6 ? 'W' : r() < 0.5 ? 'D' : 'L')).join('');
        return { team: { id, name, logo: null }, played, win, draw, lose, gf, ga, gd: gf - ga, points: win * 3 + draw, form };
      });
      rows.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
      return rows.map((row, i) => ({
        rank: i + 1,
        ...row,
        description: i < 4 ? 'Champions League' : i === 4 ? 'Europa League' : i >= rows.length - 2 ? 'Relegation' : null,
        group: null,
      }));
    },
  };
}
