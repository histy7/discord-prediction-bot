const { getLiveMatches, getMatchWinner } = require('./lolesports');
const { scoreMatch, hasVoteSnapshot } = require('./scoreManager');

const CHECK_INTERVAL_MS = 60 * 1000;      // live check every 60s
const SCORE_INTERVAL_MS = 5 * 60 * 1000;  // result check every 5 minutes

/**
 * pollFns is passed in from index.js to avoid circular dependencies:
 * { getActivePolls, getClosedUnscoredPolls, closePoll }
 */
function startMatchMonitor(client, pollFns) {
  console.log('🔍 Match monitor started (live check every 60s, score check every 5m)');

  const liveCheck = async () => {
    try {
      const activePolls = pollFns.getActivePolls();
      if (activePolls.length === 0) return;

      const liveEvents = await getLiveMatches();
      const liveMatchIds = new Set(
        liveEvents.map(e => e.id || e.match?.id).filter(Boolean)
      );

      const now = new Date();

      for (const poll of activePolls) {
        const isLPL = poll.match?.leagueName?.toUpperCase().includes('LPL');
        const matchStarted =
          liveMatchIds.has(poll.matchId) ||
          (isLPL && poll.startTime && now >= new Date(poll.startTime));

        if (matchStarted) {
          console.log(`⚡ Match ${poll.matchId} has started — closing poll.`);
          await pollFns.closePoll(client, poll.matchId);
        }
      }
    } catch (err) {
      console.error('Live check error:', err.message);
    }
  };

  const scoreCheck = async () => {
    try {
      const unscoredPolls = pollFns.getClosedUnscoredPolls();
      if (unscoredPolls.length === 0) return;

      for (const poll of unscoredPolls) {
        if (!hasVoteSnapshot(poll.matchId)) continue;

        const winnerCode = await getMatchWinner(poll.matchId);
        if (winnerCode) {
          scoreMatch(poll.matchId, winnerCode);
        }
      }
    } catch (err) {
      console.error('Score check error:', err.message);
    }
  };

  liveCheck();
  setInterval(liveCheck, CHECK_INTERVAL_MS);

  scoreCheck();
  setInterval(scoreCheck, SCORE_INTERVAL_MS);
}

module.exports = { startMatchMonitor };
