// Matchsense web app: fixtures, match briefings, odds, tables and live updates.

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const state = {
  status: null,
  leagues: [],
  date: ymd(new Date()),
  fixtures: [],
  fixturesLoading: true,
  fixturesError: null,
  filter: 'all',
  followed: new Set(store.get('followed', [])),
  seen: new Map(), // id -> last known fixture, for goal alerts
  match: null,
  matchTab: 'briefing',
  split: 'all',
  request: 0,
};

const app = document.getElementById('app');

// ---------- helpers ----------

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const phase = (f) => (LIVE.has(f.status.short) ? 'live' : FINISHED.has(f.status.short) ? 'finished' : 'upcoming');
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const longDate = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const pctText = (v) => (v == null ? '–' : `${v}%`);

function dayLabel(dateStr) {
  const today = ymd(new Date());
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, 1)) return 'Tomorrow';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric' });
}

function clockText(f) {
  const s = f.status.short;
  if (s === 'HT') return 'HT';
  if (LIVE.has(s)) return `${f.status.elapsed ?? ''}'`;
  if (FINISHED.has(s)) return s === 'FT' ? 'FT' : s;
  if (s === 'PST') return 'Postponed';
  if (s === 'CANC' || s === 'ABD') return 'Off';
  return timeOf(f.date);
}

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function remember(fixtures) {
  for (const f of fixtures) state.seen.set(f.id, f);
}

const loading = (text) => `<p class="state" role="status">${esc(text)}</p>`;
const failure = (text) => `<div class="state error" role="alert"><p>${esc(text)}</p><button type="button" class="btn" data-action="retry">Try again</button></div>`;

function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ---------- routing ----------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'match' && parts[1]) return { name: 'match', id: parts[1] };
  if (parts[0] === 'table' && parts[1]) return { name: 'table', id: parts[1] };
  if (parts[0] === 'tables') return { name: 'tables' };
  if (parts[0] === 'help') return { name: 'help' };
  return { name: 'fixtures' };
}

function render() {
  const r = route();
  window.scrollTo(0, 0);
  if (r.name === 'match') return showMatch(r.id);
  if (r.name === 'table') return showTable(r.id);
  if (r.name === 'tables') return showTables();
  if (r.name === 'help') return showHelp();
  return showFixtures();
}

// ---------- fixtures ----------

async function showFixtures() {
  setNav('matches');
  const ticket = ++state.request;
  state.fixturesLoading = true;
  state.fixturesError = null;
  renderFixtures();
  try {
    const data = await api(`/api/fixtures?date=${state.date}`);
    if (ticket !== state.request) return;
    state.fixtures = data.fixtures;
    remember(data.fixtures);
  } catch (err) {
    if (ticket !== state.request) return;
    state.fixturesError = err.message;
  }
  state.fixturesLoading = false;
  renderFixtures();
}

function fixtureRow(f) {
  const p = phase(f);
  const hasScore = f.goals.home != null;
  const homeWon = p === 'finished' && f.goals.home > f.goals.away;
  const awayWon = p === 'finished' && f.goals.away > f.goals.home;
  const followed = state.followed.has(f.id);
  return `<li class="fx ${p}">
    <a href="#/match/${f.id}" class="fx-link">
      <span class="fx-clock">${p === 'live' ? '<span class="pulse" aria-hidden="true"></span>' : ''}${esc(clockText(f))}</span>
      <span class="fx-teams">
        <span class="fx-team${homeWon ? ' won' : ''}"><span class="fx-name">${esc(f.home.name)}</span><span class="fx-goals">${hasScore ? f.goals.home : ''}</span></span>
        <span class="fx-team${awayWon ? ' won' : ''}"><span class="fx-name">${esc(f.away.name)}</span><span class="fx-goals">${hasScore ? f.goals.away : ''}</span></span>
      </span>
    </a>
    <button type="button" class="follow" data-follow="${f.id}" aria-pressed="${followed}" aria-label="${followed ? 'Stop following' : 'Follow'} ${esc(f.home.name)} v ${esc(f.away.name)}">${starIcon(followed)}</button>
  </li>`;
}

function starIcon(on) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function renderFixtures() {
  const today = ymd(new Date());
  const days = [-1, 0, 1, 2, 3, 4, 5].map((n) => addDays(today, n));
  const liveCount = state.fixtures.filter((f) => phase(f) === 'live').length;

  let list = state.fixtures;
  if (state.filter === 'live') list = list.filter((f) => phase(f) === 'live');
  else if (state.filter === 'following') list = list.filter((f) => state.followed.has(f.id));
  else if (state.filter !== 'all') list = list.filter((f) => f.league.id === Number(state.filter));

  const groups = state.leagues
    .map((l) => ({ league: l, items: list.filter((f) => f.league.id === l.id).sort((a, b) => new Date(a.date) - new Date(b.date)) }))
    .filter((g) => g.items.length);

  let body;
  if (state.fixturesLoading && !state.fixtures.length) body = loading('Loading matches…');
  else if (state.fixturesError) body = failure(state.fixturesError);
  else if (!groups.length) {
    const msg = state.filter === 'live' ? 'No matches are live right now in these leagues.'
      : state.filter === 'following' ? 'You are not following any matches on this day. Tap the star on a match to get goal alerts.'
        : 'No matches in these leagues on this day. Try another day.';
    body = `<p class="state">${msg}</p>`;
  } else {
    body = groups.map((g) => `<section class="league">
      <h2 class="league-head"><a href="#/table/${g.league.id}">${esc(g.league.name)}<span class="league-country">${esc(g.league.country)}</span></a></h2>
      <ul class="fx-list">${g.items.map(fixtureRow).join('')}</ul>
    </section>`).join('');
  }

  const leagueOptions = state.leagues.map((l) => `<option value="${l.id}"${String(l.id) === state.filter ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
  const chip = (key, label, extra = '') => `<button type="button" class="chip" data-filter="${key}" aria-pressed="${state.filter === key}">${label}${extra}</button>`;

  app.innerHTML = `<div class="page">
    <div class="days" role="group" aria-label="Choose a day">
      ${days.map((d) => `<button type="button" class="day" data-date="${d}" aria-pressed="${d === state.date}">${esc(dayLabel(d))}</button>`).join('')}
    </div>
    <div class="filters">
      ${chip('all', 'All')}
      ${chip('live', 'Live', liveCount ? ` <span class="count">${liveCount}</span>` : '')}
      ${chip('following', 'Following')}
      <label class="league-pick"><span class="sr">Show one league</span>
        <select data-league>
          <option value="">All leagues</option>${leagueOptions}
        </select>
      </label>
    </div>
    ${body}
  </div>`;
}

// ---------- match page ----------

async function showMatch(id) {
  setNav('matches');
  const ticket = ++state.request;
  if (!state.match || String(state.match.fixture.id) !== String(id)) {
    state.match = null;
    state.matchTab = 'briefing';
    app.innerHTML = `<div class="page">${loading('Building the match briefing…')}</div>`;
  }
  try {
    const data = await api(`/api/match/${encodeURIComponent(id)}`);
    if (ticket !== state.request) return;
    state.match = data;
    remember([data.fixture]);
    renderMatch();
  } catch (err) {
    if (ticket !== state.request) return;
    app.innerHTML = `<div class="page">${failure(err.message)}<p class="state"><a href="#/">Back to matches</a></p></div>`;
  }
}

function scoreboard(f) {
  const p = phase(f);
  const hasScore = f.goals.home != null;
  const followed = state.followed.has(f.id);
  const statusLine = p === 'live'
    ? `<span class="live-tag"><span class="pulse" aria-hidden="true"></span>Live ${esc(clockText(f))}</span>`
    : p === 'finished' ? 'Full time' : `${esc(longDate(f.date))}, ${esc(timeOf(f.date))}`;
  return `<header class="board ${p}" id="scoreboard">
    <p class="board-league"><a href="#/table/${f.league.id}">${esc(f.league.name)}</a>${f.league.round ? `, ${esc(f.league.round.replace('Regular Season - ', 'Matchday '))}` : ''}</p>
    <div class="board-main">
      <h1 class="board-team home">${esc(f.home.name)}</h1>
      <p class="board-score" aria-label="${hasScore ? `Score ${f.goals.home} to ${f.goals.away}` : 'Not started'}">${hasScore ? `${f.goals.home}<span class="dash">–</span>${f.goals.away}` : '<span class="vs">v</span>'}</p>
      <p class="board-team away">${esc(f.away.name)}</p>
    </div>
    <p class="board-status">${statusLine}${f.halftime.home != null && p !== 'upcoming' ? ` <span class="ht">(HT ${f.halftime.home}–${f.halftime.away})</span>` : ''}</p>
    <button type="button" class="btn follow-btn" data-follow="${f.id}" aria-pressed="${followed}">${starIcon(followed)}${followed ? 'Following' : 'Follow for alerts'}</button>
  </header>`;
}

function renderMatch() {
  const b = state.match;
  const tab = (key, label) => `<button type="button" role="tab" class="tab" data-tab="${key}" aria-selected="${state.matchTab === key}">${label}</button>`;
  const panel = state.matchTab === 'news' ? newsPanel(b) : state.matchTab === 'odds' ? oddsPanel(b) : briefingPanel(b);
  app.innerHTML = `<div class="page match">
    ${scoreboard(b.fixture)}
    <div class="tabs" role="tablist" aria-label="Match sections">${tab('briefing', 'Briefing')}${tab('news', 'Team news')}${tab('odds', 'Odds')}</div>
    <div class="panel" role="tabpanel">${panel}</div>
  </div>`;
}

function meter(label, home, away) {
  return `<div class="meter">
    <span class="m-val">${pctText(home)}</span>
    <span class="m-bar home"><i style="width:${home ?? 0}%"></i></span>
    <span class="m-label">${esc(label)}</span>
    <span class="m-bar away"><i style="width:${away ?? 0}%"></i></span>
    <span class="m-val">${pctText(away)}</span>
  </div>`;
}

function formStrip(games) {
  if (!games.length) return '<p class="muted">No recent results.</p>';
  return `<ol class="form" aria-label="Last ${games.length} results, newest first">${games.map((g) => `<li class="r-${esc(g.result)}"${g.opponent ? ` title="${esc(`${g.venue === 'H' ? 'v' : 'at'} ${g.opponent}, ${g.gf}–${g.ga}`)}"` : ''}>${esc(g.result)}</li>`).join('')}</ol>`;
}

function resultsList(name, games) {
  return `<details class="results"><summary>${esc(name)}: last ${games.length} results</summary>
    <table class="mini"><tbody>${games.map((g) => `<tr><td>${esc(shortDate(g.date))}</td><td>${g.venue === 'H' ? 'v' : 'at'} ${esc(g.opponent)}</td><td class="num r-text-${g.result}">${g.gf}–${g.ga}</td></tr>`).join('')}</tbody></table>
  </details>`;
}

function briefingPanel(b) {
  const f = b.fixture;
  const home = b.form.home; const away = b.form.away;
  const venue = state.split === 'venue';
  const hs = venue ? home.venue : home.all;
  const as = venue ? away.venue : away.all;
  const small = Math.min(hs.played, as.played) < 5;

  const ctx = (t, c) => `<div class="ctx">
    <h3>${esc(t.name)}</h3>
    <dl>
      <div><dt>Position</dt><dd>${c.standing ? ordinal(c.standing.rank) : '–'}</dd></div>
      <div><dt>Points</dt><dd>${c.standing ? `${c.standing.points} <small>from ${c.standing.played}</small>` : '–'}</dd></div>
      <div><dt>Rest</dt><dd>${c.restDays != null ? `${c.restDays} <small>day${c.restDays === 1 ? '' : 's'}</small>` : '–'}</dd></div>
    </dl>
    ${c.standing?.description ? `<p class="zone">Table zone: ${esc(c.standing.description)}</p>` : ''}
  </div>`;

  const formBlock = b.form.available ? `
    <section class="block">
      <div class="block-head">
        <h2>Form and goals</h2>
        <div class="seg" role="group" aria-label="Which games to count">
          <button type="button" data-split="all" aria-pressed="${!venue}">All games</button>
          <button type="button" data-split="venue" aria-pressed="${venue}">Home v away only</button>
        </div>
      </div>
      <div class="form-row">
        <div><p class="team-label">${esc(f.home.name)}</p>${formStrip(venue ? home.games.filter((g) => g.venue === 'H') : home.games)}
          <p class="muted">${hs.wins}W ${hs.draws}D ${hs.losses}L, scores ${hs.avgScored ?? '–'} and concedes ${hs.avgConceded ?? '–'} a game</p></div>
        <div><p class="team-label">${esc(f.away.name)}</p>${formStrip(venue ? away.games.filter((g) => g.venue === 'A') : away.games)}
          <p class="muted">${as.wins}W ${as.draws}D ${as.losses}L, scores ${as.avgScored ?? '–'} and concedes ${as.avgConceded ?? '–'} a game</p></div>
      </div>
      <div class="meters" aria-label="Goals markets: share of recent games">
        <div class="meter-head"><span>${esc(f.home.name)}</span><span>${esc(f.away.name)}</span></div>
        ${meter('Over 1.5 goals', hs.over15, as.over15)}
        ${meter('Over 2.5 goals', hs.over25, as.over25)}
        ${meter('Over 3.5 goals', hs.over35, as.over35)}
        ${meter('Both teams scored', hs.btts, as.btts)}
        ${meter('Clean sheet', hs.cleanSheets, as.cleanSheets)}
        ${meter('Failed to score', hs.failedToScore, as.failedToScore)}
        ${meter('Goals scored in 1st half', hs.firstHalfScored, as.firstHalfScored)}
        ${meter('Goals conceded in 1st half', hs.firstHalfConceded, as.firstHalfConceded)}
      </div>
      <p class="note">Share of each team's last ${hs.played === as.played ? hs.played : `${hs.played} and ${as.played}`} ${venue ? `${esc(f.home.name)} home and ${esc(f.away.name)} away games` : 'games'}${small ? '. Small sample, so treat with care' : ''}.</p>
      ${resultsList(f.home.name, home.games)}
      ${resultsList(f.away.name, away.games)}
    </section>` : '<section class="block"><h2>Form and goals</h2><p class="muted">Recent results are unavailable right now.</p></section>';

  const h = b.h2h;
  const h2hBlock = `<section class="block">
    <h2>Head to head</h2>
    ${!h || !h.played ? '<p class="muted">No previous meetings found.</p>' : `
      <div class="h2h-tally">
        <div><strong>${h.teamAWins}</strong><span>${esc(f.home.name)} wins</span></div>
        <div><strong>${h.draws}</strong><span>Draws</span></div>
        <div><strong>${h.teamBWins}</strong><span>${esc(f.away.name)} wins</span></div>
      </div>
      <p class="muted">Last ${h.played} meetings: ${h.avgGoals} goals a game, over 2.5 goals in ${pctText(h.over25)}, both teams scored in ${pctText(h.btts)}.</p>
      <table class="mini"><tbody>${h.games.map((g) => `<tr><td>${esc(shortDate(g.date))}</td><td>${esc(g.home)}</td><td class="num">${g.homeGoals}–${g.awayGoals}</td><td>${esc(g.away)}</td></tr>`).join('')}</tbody></table>`}
  </section>`;

  return `<section class="block"><h2>Context</h2><div class="ctx-row">${ctx(f.home, b.context.home)}${ctx(f.away, b.context.away)}</div>
      ${f.referee ? `<p class="muted">Referee: ${esc(f.referee)}</p>` : ''}</section>
    ${formBlock}${h2hBlock}`;
}

function newsPanel(b) {
  const f = b.fixture;
  const injuryList = (list) => (list.length
    ? `<ul class="injuries">${list.map((i) => `<li><span>${esc(i.player)}</span><span class="tag ${i.type === 'Questionable' ? 'doubt' : 'out'}">${i.type === 'Questionable' ? 'Doubtful' : 'Out'}</span><small>${esc(i.reason || '')}</small></li>`).join('')}</ul>`
    : '<p class="muted">No reported absences.</p>');

  const injuries = b.injuries
    ? `<div class="two-col"><div><h3>${esc(f.home.name)}</h3>${injuryList(b.injuries.home)}</div><div><h3>${esc(f.away.name)}</h3>${injuryList(b.injuries.away)}</div></div>`
    : '<p class="muted">Injury news is unavailable right now.</p>';

  let lineups;
  if (b.lineups && b.lineups.length) {
    lineups = `<div class="two-col">${b.lineups.map((l) => `<div>
      <h3>${esc(l.team)} <span class="formation">${esc(l.formation || '')}</span></h3>
      <ol class="xi">${l.startXI.map((p) => `<li><span class="num">${p.number ?? ''}</span>${esc(p.name)}<small>${esc(p.pos || '')}</small></li>`).join('')}</ol>
      ${l.coach ? `<p class="muted">Coach: ${esc(l.coach)}</p>` : ''}
    </div>`).join('')}</div>`;
  } else {
    lineups = `<p class="muted">Lineups usually appear about an hour before kickoff. ${state.followed.has(f.id) ? 'You will see them here when they drop.' : 'Follow this match to get an alert at kickoff.'}</p>`;
  }

  return `<section class="block"><h2>Injuries and suspensions</h2>${injuries}</section>
    <section class="block"><h2>Lineups</h2>${lineups}</section>`;
}

function oddsPanel(b) {
  const f = b.fixture;
  if (!b.odds) {
    return `<section class="block"><h2>Odds</h2><p class="muted">No odds yet for this match. Bookmakers usually publish prices a few days before kickoff.</p></section>`;
  }
  const names = {
    home: f.home.name, draw: 'Draw', away: f.away.name, over: 'Over 2.5', under: 'Under 2.5', yes: 'Yes', no: 'No',
  };
  const markets = b.odds.markets.map((m) => {
    const bestOdd = m.outcomes.map((o) => o.best.odd);
    return `<section class="block market">
      <h2>${esc(m.label)}</h2>
      <div class="prices" style="--n:${m.outcomes.length}">
        ${m.outcomes.map((o) => `<div class="price">
          <p class="p-name">${esc(names[o.key])}</p>
          <p class="p-odd">${o.best.odd.toFixed(2)}</p>
          <p class="p-book">Best at ${esc(o.best.bookmaker)}</p>
          <p class="p-chance">Implied <strong>${o.impliedBest}%</strong></p>
          <p class="p-chance">Market <strong>${o.marketView}%</strong></p>
        </div>`).join('')}
      </div>
      <details class="books"><summary>Compare ${m.bookmakers.length} bookmakers</summary>
        <div class="scroll"><table class="odds-table">
          <thead><tr><th scope="col">Bookmaker</th>${m.outcomes.map((o) => `<th scope="col" class="num">${esc(names[o.key])}</th>`).join('')}</tr></thead>
          <tbody>${m.bookmakers.map((bk) => `<tr><th scope="row">${esc(bk.name)}</th>${bk.prices.map((p, i) => `<td class="num${p === bestOdd[i] ? ' best' : ''}">${p.toFixed(2)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p class="note">Average bookmaker margin: ${m.margin}%.</p>
      </details>
    </section>`;
  }).join('');
  return `${markets}
    <p class="note">Implied is the chance the best price suggests (100 divided by the price). Market averages every bookmaker's prices with their margin removed. Neither predicts the result; they show what the prices mean.</p>`;
}

// ---------- tables ----------

function showTables() {
  setNav('tables');
  app.innerHTML = `<div class="page"><h1 class="page-title">League tables</h1>
    <ul class="league-grid">${state.leagues.map((l) => `<li><a href="#/table/${l.id}"><strong>${esc(l.name)}</strong><span>${esc(l.country)}</span></a></li>`).join('')}</ul></div>`;
}

async function showTable(id) {
  setNav('tables');
  const ticket = ++state.request;
  app.innerHTML = `<div class="page">${loading('Loading table…')}</div>`;
  try {
    const data = await api(`/api/standings/${encodeURIComponent(id)}`);
    if (ticket !== state.request) return;
    const rows = data.rows;
    const body = rows.length ? `<div class="scroll"><table class="standings">
      <thead><tr><th scope="col" class="num">#</th><th scope="col">Team</th><th scope="col" class="num">P</th><th scope="col" class="num">W</th><th scope="col" class="num">D</th><th scope="col" class="num">L</th><th scope="col" class="num">GD</th><th scope="col" class="num">Pts</th><th scope="col" class="hide-s">Form</th></tr></thead>
      <tbody>${rows.map((r) => `<tr${r.description ? ` title="${esc(r.description)}"` : ''}>
        <td class="num"><span class="rank ${zoneClass(r.description)}">${r.rank}</span></td>
        <th scope="row">${esc(r.team.name)}</th>
        <td class="num">${r.played}</td><td class="num">${r.win}</td><td class="num">${r.draw}</td><td class="num">${r.lose}</td>
        <td class="num">${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="num strong">${r.points}</td>
        <td class="hide-s">${formStrip((r.form || '').split('').slice(-5).reverse().map((x) => ({ result: x, venue: '', opponent: '', gf: '', ga: '' })))}</td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="state">No table available for this competition yet.</p>';
    app.innerHTML = `<div class="page"><p class="crumb"><a href="#/tables">All tables</a></p><h1 class="page-title">${esc(data.league.name)}</h1>${body}</div>`;
  } catch (err) {
    if (ticket !== state.request) return;
    app.innerHTML = `<div class="page">${failure(err.message)}</div>`;
  }
}

function zoneClass(desc) {
  if (!desc) return '';
  const d = desc.toLowerCase();
  if (d.includes('relegation')) return 'z-down';
  if (d.includes('champions') || d.includes('promotion')) return 'z-top';
  return 'z-mid';
}

// ---------- help ----------

function showHelp() {
  setNav('help');
  app.innerHTML = `<div class="page prose">
    <h1 class="page-title">Safer betting</h1>
    <p>Matchsense helps you understand a match before you bet. No stat, model or price can guarantee a result, and bookmakers build a margin into every price.</p>
    <h2>Habits that protect you</h2>
    <ul>
      <li>Set a weekly budget you can afford to lose, and stop when it is gone.</li>
      <li>Never chase losses with bigger stakes.</li>
      <li>Keep betting separate from money for rent, food, school fees or bills.</li>
      <li>Accumulators look attractive, but every extra leg makes winning much less likely.</li>
      <li>Take breaks, and do not bet when stressed, angry or after drinking.</li>
    </ul>
    <h2>Getting help</h2>
    <p>If betting stops being fun or you feel you cannot stop, talk to someone you trust and reach out for support:</p>
    <ul>
      <li><a href="https://www.gamblersanonymous.org" rel="noopener" target="_blank">Gamblers Anonymous</a>, with meetings and resources worldwide.</li>
      <li><a href="https://www.gamcare.org.uk" rel="noopener" target="_blank">GamCare</a>, with free information and advice online.</li>
    </ul>
    <p>Matchsense is for people aged 18 and over.</p>
  </div>`;
}

// ---------- live updates and alerts ----------

function toast(text) {
  const box = document.getElementById('toasts');
  const el = document.createElement('p');
  el.className = 'toast';
  el.textContent = text;
  box.append(el);
  setTimeout(() => el.remove(), 6000);
}

function alertUser(text) {
  toast(text);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Matchsense', { body: text }); } catch { /* not supported */ }
  }
}

function checkEvents(prev, next) {
  if (!prev || !state.followed.has(next.id)) return;
  const score = `${next.home.name} ${next.goals.home ?? 0}–${next.goals.away ?? 0} ${next.away.name}`;
  if ((next.goals.home ?? 0) > (prev.goals.home ?? 0)) alertUser(`Goal for ${next.home.name}: ${score}`);
  if ((next.goals.away ?? 0) > (prev.goals.away ?? 0)) alertUser(`Goal for ${next.away.name}: ${score}`);
  if (phase(prev) === 'upcoming' && phase(next) === 'live') alertUser(`Kickoff: ${next.home.name} v ${next.away.name}`);
  if (phase(prev) !== 'finished' && phase(next) === 'finished') alertUser(`Full time: ${score}`);
}

function applyUpdates(updates) {
  let touchedList = false;
  for (const f of updates) {
    checkEvents(state.seen.get(f.id), f);
    state.seen.set(f.id, f);
    const i = state.fixtures.findIndex((x) => x.id === f.id);
    if (i >= 0) { state.fixtures[i] = f; touchedList = true; }
    if (state.match && state.match.fixture.id === f.id) {
      state.match.fixture = f;
      const board = document.getElementById('scoreboard');
      if (board) board.outerHTML = scoreboard(f);
    }
  }
  if (touchedList && route().name === 'fixtures') renderFixtures();
}

function connectStream() {
  if (!('EventSource' in window)) return;
  const source = new EventSource('/api/stream');
  source.addEventListener('update', (e) => {
    try { applyUpdates(JSON.parse(e.data)); } catch { /* ignore malformed message */ }
  });
}

function toggleFollow(id) {
  const n = Number(id);
  if (state.followed.has(n)) state.followed.delete(n);
  else {
    state.followed.add(n);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }
  store.set('followed', [...state.followed].slice(-200));
  const r = route();
  if (r.name === 'match' && state.match) renderMatch();
  else if (r.name === 'fixtures') renderFixtures();
}

// ---------- events ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-date],[data-filter],[data-follow],[data-tab],[data-split],[data-action],[data-gate]');
  if (!t) return;
  if (t.dataset.date) { state.date = t.dataset.date; showFixtures(); }
  else if (t.dataset.filter) { state.filter = t.dataset.filter; renderFixtures(); }
  else if (t.dataset.follow) toggleFollow(t.dataset.follow);
  else if (t.dataset.tab) { state.matchTab = t.dataset.tab; renderMatch(); }
  else if (t.dataset.split) { state.split = t.dataset.split; renderMatch(); }
  else if (t.dataset.action === 'retry') render();
  else if (t.dataset.gate === 'yes') { store.set('ageOk', true); document.getElementById('gate').hidden = true; }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-league]')) {
    state.filter = e.target.value || 'all';
    renderFixtures();
  }
});

window.addEventListener('hashchange', render);

// ---------- start ----------

async function start() {
  if (!store.get('ageOk', false)) document.getElementById('gate').hidden = false;
  try {
    const [status, leagues] = await Promise.all([api('/api/status'), api('/api/leagues')]);
    state.status = status;
    state.leagues = leagues.leagues;
    if (status.mode === 'demo') {
      const banner = document.getElementById('banner');
      banner.textContent = 'Demo data: these matches, scores and odds are simulated. Add your API-Football key to show real matches.';
      banner.hidden = false;
    }
  } catch {
    app.innerHTML = `<div class="page">${failure('Could not reach the Matchsense server.')}</div>`;
    return;
  }
  render();
  connectStream();
}

start();
