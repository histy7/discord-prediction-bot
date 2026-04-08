const fetch = (...args) =>
  import('node-fetch').then(({ default: f }) => f(...args));

const BASE_URL = 'https://esports-api.lolesports.com/persisted/gw';
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const headers = { 'x-api-key': API_KEY };

const LEAGUE_IDS = {
  LCK: '98767991310872058',
  LEC: '98767991302996019',
  LPL: '98767991314006698',
  LCS: '98767991299243165',
};

async function getSchedule(leagueId) {
  const url = `${BASE_URL}/getSchedule?hl=en-US&leagueId=${leagueId}`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data?.data?.schedule?.events || [];
}

const ALLOWED_LEAGUES = new Set(['LCK', 'LEC', 'LPL', 'LCS']);

async function getUpcomingMatches() {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const results = await Promise.all(
    Object.values(LEAGUE_IDS).map(id => getSchedule(id))
  );

  const allEvents = results.flat();

  return allEvents.filter(event => {
    if (event.type !== 'match') return false;
    const startTime = new Date(event.startTime);
    const inWindow = startTime >= new Date(now.getTime() - 30 * 60000) && startTime <= weekFromNow;
    const isAllowedLeague = ALLOWED_LEAGUES.has(event.league?.slug?.toUpperCase()) ||
                            ALLOWED_LEAGUES.has(event.league?.name?.toUpperCase());
    return inWindow && isAllowedLeague;
  }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

async function getLiveMatches() {
  const url = `${BASE_URL}/getLive?hl=en-US`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data?.data?.schedule?.events || [];
}

/**
 * Fetch the winning team code for a completed match.
 * Returns null if the match isn't finished yet.
 */
async function getMatchWinner(matchId) {
  // getEventDetails returns an unexpected structure, so we search the schedule instead
  const results = await Promise.all(
    Object.values(LEAGUE_IDS).map(id => getSchedule(id))
  );
  const allEvents = results.flat();
  const event = allEvents.find(e => (e.id || e.match?.id) === matchId);

  if (!event) {
    console.log(`🔍 getMatchWinner(${matchId}): match not found in schedule`);
    return null;
  }

  console.log(`🔍 getMatchWinner(${matchId}): state=${event.state}, teams=${JSON.stringify(event.match?.teams?.map(t => ({ code: t.code, outcome: t.result?.outcome })))}`);

  if (event.state !== 'completed') return null;
  const teams = event.match?.teams || [];
  const winner = teams.find(t => t.result?.outcome === 'win');
  return winner?.code || null;
}

function formatMatch(event) {
  const match = event.match;
  const teams = match?.teams || [];
  const team1 = teams[0];
  const team2 = teams[1];

  return {
    id: event.id || match?.id,
    startTime: event.startTime,
    state: event.state,
    leagueName: event.league?.name || 'Unknown League',
    blockName: event.blockName || '',
    team1: {
      name: team1?.name || 'TBD',
      code: team1?.code || '???',
      image: team1?.image || null,
      result: team1?.result,
    },
    team2: {
      name: team2?.name || 'TBD',
      code: team2?.code || '???',
      image: team2?.image || null,
      result: team2?.result,
    },
  };
}

module.exports = {
  getSchedule,
  getUpcomingMatches,
  getLiveMatches,
  getMatchWinner,
  formatMatch,
};
