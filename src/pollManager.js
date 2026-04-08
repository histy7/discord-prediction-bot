const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { snapshotVotes, isScored } = require('./scoreManager');

const POLLS_PATH = path.join(__dirname, '..', 'polls.json');

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadPolls() {
  if (!fs.existsSync(POLLS_PATH)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(POLLS_PATH, 'utf8'));
    const map = new Map();
    for (const [id, poll] of Object.entries(raw)) {
      // Rehydrate startTime back to a Date object
      map.set(id, { ...poll, startTime: new Date(poll.startTime) });
    }
    console.log(`📂 Loaded ${map.size} poll(s) from disk.`);
    return map;
  } catch (err) {
    console.error('Failed to load polls from disk:', err.message);
    return new Map();
  }
}

function savePolls(polls) {
  try {
    const obj = {};
    for (const [id, poll] of polls.entries()) {
      obj[id] = { ...poll, startTime: poll.startTime.toISOString() };
    }
    fs.writeFileSync(POLLS_PATH, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Failed to save polls to disk:', err.message);
  }
}

// In-memory store, seeded from disk on startup
const polls = loadPolls();

// ---------------------------------------------------------------------------
// Poll operations
// ---------------------------------------------------------------------------

/**
 * Create a native Discord poll for a match.
 */
async function createPoll(channel, match, createdBy) {
  const { id, startTime, leagueName, blockName, team1, team2 } = match;

  if (polls.has(id)) {
    return { error: `A poll for **${team1.code} vs ${team2.code}** already exists!` };
  }

  const startDate = new Date(startTime);
  const timestamp = Math.floor(startDate.getTime() / 1000);

  // Post an info embed first
  const infoEmbed = new EmbedBuilder()
    .setColor(0xC89B3C)
    .setTitle(`🏆 ${leagueName}${blockName ? ` — ${blockName}` : ''}`)
    .setDescription(
      `Match starts: <t:${timestamp}:F> (<t:${timestamp}:R>)\nPoll closes automatically when the match begins.`
    )
    .setFooter({ text: `Poll created by ${createdBy}` })
    .setTimestamp();

  await channel.send({ embeds: [infoEmbed] });

  // Calculate duration in hours (min 1h, max 168h = 7 days)
  const now = new Date();
  const hoursUntilStart = Math.max(1, Math.ceil((startDate - now) / 3_600_000));
  const durationHours = Math.min(hoursUntilStart + 1, 168);

  // Send native Discord poll
  const pollMessage = await channel.send({
    poll: {
      question: { text: `Who will win? ${team1.code} vs ${team2.code}` },
      answers: [
        { text: `🔵 ${team1.name} (${team1.code})` },
        { text: `🔴 ${team2.name} (${team2.code})` },
      ],
      duration: durationHours,
      allow_multiselect: false,
    },
  });

  const pollData = {
    matchId: id,
    messageId: pollMessage.id,
    channelId: channel.id,
    match,
    closed: false,
    startTime: startDate,
  };

  polls.set(id, pollData);
  savePolls(polls);

  console.log(
    `📊 Poll created for match ${id} (${team1.code} vs ${team2.code}), duration: ${durationHours}h`
  );
  return { success: true, message: pollMessage };
}

/**
 * Close a poll when a match starts by ending the Discord poll early.
 */
async function closePoll(client, matchId) {
  const poll = polls.get(matchId);
  if (!poll || poll.closed) return;

  poll.closed = true;
  savePolls(polls);

  try {
    const channel = await client.channels.fetch(poll.channelId);
    const message = await channel.messages.fetch(poll.messageId);

    // Snapshot who voted for what before ending the poll
    await snapshotPollVotes(message, poll);

    // End the native Discord poll early
    await message.poll?.end();
    console.log(`🔒 Poll closed for match ${matchId}`);

    // DM the owner
    try {
      const { dmOwner } = require('../index');
      const { team1, team2, leagueName } = poll.match;
      const timestamp = new Date().toLocaleString();
      await dmOwner(
        `🔒 **Poll closed!**\n` +
        `**Match:** ${team1.code} vs ${team2.code} — ${leagueName}\n` +
        `**Time:** ${timestamp}\n` +
        `The match has gone live and voting is now locked.`
      );
    } catch (dmErr) {
      console.error('Failed to DM owner on poll close:', dmErr.message);
    }
  } catch (err) {
    console.error(`Failed to close poll for match ${matchId}:`, err.message);
  }
}

/**
 * Fetch voters for each answer and save a snapshot to scoreManager.
 */
async function snapshotPollVotes(message, poll) {
  const discordPoll = message.poll;
  if (!discordPoll) return;

  const { team1, team2 } = poll.match;
  // Answer IDs are 1-indexed; answer 1 = team1, answer 2 = team2
  const answerTeamMap = { 1: team1.code, 2: team2.code };
  const entries = {};

  for (const [answerId, teamCode] of Object.entries(answerTeamMap)) {
    const answer = discordPoll.answers.get(Number(answerId));
    if (!answer) continue;
    try {
      const voters = await answer.voters.fetch();
      for (const [userId, user] of voters) {
        entries[userId] = { username: user.username, teamCode };
      }
    } catch (err) {
      console.error(`Failed to fetch voters for answer ${answerId}:`, err.message);
    }
  }

  snapshotVotes(poll.matchId, poll.startTime.toISOString(), entries);
}

function getActivePolls() {
  return [...polls.values()].filter(p => !p.closed);
}

function getClosedUnscoredPolls() {
  return [...polls.values()].filter(p => p.closed && !isScored(p.matchId));
}

function getAllPolls() {
  return [...polls.values()];
}

async function handleVote(interaction) {}

module.exports = {
  createPoll,
  handleVote,
  closePoll,
  getActivePolls,
  getClosedUnscoredPolls,
  getAllPolls,
};
