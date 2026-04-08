const fs = require('fs');
const path = require('path');

const SCORES_PATH = path.join(__dirname, '..', 'scores.json');

// Structure:
// {
//   votes: {
//     matchId: {
//       matchDate: ISO string,
//       entries: { userId: { username, teamCode } }
//     }
//   },
//   scored: {
//     matchId: {
//       winningTeamCode: string,
//       scoredAt: ISO string,
//       results: { userId: true/false }
//     }
//   }
// }

let data = { votes: {}, scored: {} };

function load() {
  if (!fs.existsSync(SCORES_PATH)) return;
  try {
    data = JSON.parse(fs.readFileSync(SCORES_PATH, 'utf8'));
    data.votes = data.votes || {};
    data.scored = data.scored || {};
    console.log('📂 Loaded scores from disk.');
  } catch (err) {
    console.error('Failed to load scores:', err.message);
  }
}

function save() {
  try {
    fs.writeFileSync(SCORES_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save scores:', err.message);
  }
}

load();

/**
 * Save who voted for what when a poll closes.
 * @param {string} matchId
 * @param {string} matchDate - ISO string of match start time
 * @param {{ [userId]: { username: string, teamCode: string } }} entries
 */
function snapshotVotes(matchId, matchDate, entries) {
  data.votes[matchId] = { matchDate, entries };
  save();
  console.log(`📸 Snapshotted ${Object.keys(entries).length} vote(s) for match ${matchId}`);
}

/**
 * Score a completed match once the winner is known.
 * @param {string} matchId
 * @param {string} winningTeamCode
 */
function scoreMatch(matchId, winningTeamCode) {
  if (data.scored[matchId]) return;

  const snapshot = data.votes[matchId];
  if (!snapshot) {
    console.warn(`⚠️ No vote snapshot for match ${matchId}, skipping score.`);
    return;
  }

  const results = {};
  for (const [userId, vote] of Object.entries(snapshot.entries)) {
    results[userId] = vote.teamCode === winningTeamCode;
  }

  data.scored[matchId] = {
    winningTeamCode,
    scoredAt: new Date().toISOString(),
    results,
  };

  save();
  console.log(`✅ Scored match ${matchId} — winner: ${winningTeamCode}`);
}

/**
 * Returns leaderboard entries for all matches from a given date onwards.
 */
function getLeaderboardFromDate(fromDate) {
  const userStats = {};

  for (const [matchId, scored] of Object.entries(data.scored)) {
    const snapshot = data.votes[matchId];
    if (!snapshot) continue;
    if (new Date(snapshot.matchDate) < fromDate) continue;

    for (const [userId, correct] of Object.entries(scored.results)) {
      const vote = snapshot.entries[userId];
      if (!vote) continue;
      if (!userStats[userId]) {
        userStats[userId] = { username: vote.username, correct: 0, total: 0 };
      }
      userStats[userId].username = vote.username;
      userStats[userId].total++;
      if (correct) userStats[userId].correct++;
    }
  }

  return Object.entries(userStats)
    .map(([userId, s]) => ({ userId, ...s }))
    .sort((a, b) => b.correct - a.correct || b.total - a.total);
}


/**
 * Returns leaderboard entries for matches within the last `days` days,
 * sorted by correct predictions then total entries.
 */
function getLeaderboard(days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const userStats = {};

  for (const [matchId, scored] of Object.entries(data.scored)) {
    const snapshot = data.votes[matchId];
    if (!snapshot) continue;
    if (new Date(snapshot.matchDate) < since) continue;

    for (const [userId, correct] of Object.entries(scored.results)) {
      const vote = snapshot.entries[userId];
      if (!vote) continue;
      if (!userStats[userId]) {
        userStats[userId] = { username: vote.username, correct: 0, total: 0 };
      }
      userStats[userId].username = vote.username; // keep fresh
      userStats[userId].total++;
      if (correct) userStats[userId].correct++;
    }
  }

  return Object.entries(userStats)
    .map(([userId, s]) => ({ userId, ...s }))
    .sort((a, b) => b.correct - a.correct || b.total - a.total);
}

function isScored(matchId) {
  return !!data.scored[matchId];
}

function hasVoteSnapshot(matchId) {
  return !!data.votes[matchId];
}


/**
 * Returns results for a single match, identified by matchId.
 */
function getLeaderboardForMatch(matchId) {
  const scored = data.scored[matchId];
  const snapshot = data.votes[matchId];

  if (!scored || !snapshot) {
    return { scored: false, entries: [] };
  }

  const entries = Object.entries(scored.results).map(([userId, correct]) => ({
    userId,
    username: snapshot.entries[userId]?.username ?? 'Unknown',
    teamCode: snapshot.entries[userId]?.teamCode ?? '???',
    correct,
  })).sort((a, b) => b.correct - a.correct);

  return {
    scored: true,
    winningTeamCode: scored.winningTeamCode,
    entries,
  };
}

module.exports = { snapshotVotes, scoreMatch, getLeaderboard, getLeaderboardFromDate, getLeaderboardForMatch, isScored, hasVoteSnapshot };
