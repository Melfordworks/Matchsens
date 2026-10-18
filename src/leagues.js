// The competitions the app covers, with their API-Football league IDs.
// To add or swap a league, change this list (IDs are on dashboard.api-football.com under "Ids").
export const LEAGUES = [
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 61, name: 'Ligue 1', country: 'France' },
  { id: 40, name: 'Championship', country: 'England' },
  { id: 88, name: 'Eredivisie', country: 'Netherlands' },
  { id: 94, name: 'Primeira Liga', country: 'Portugal' },
  { id: 203, name: 'Süper Lig', country: 'Turkey' },
  { id: 144, name: 'Pro League', country: 'Belgium' },
  { id: 2, name: 'Champions League', country: 'Europe' },
  { id: 3, name: 'Europa League', country: 'Europe' },
];

export const LEAGUE_IDS = new Set(LEAGUES.map((l) => l.id));

// Today's date (YYYY-MM-DD) in a given time zone.
export function todayIn(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// European seasons start in August; API-Football names a season by its start year.
export function defaultSeason(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export const isDateString = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
