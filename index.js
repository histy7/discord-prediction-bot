require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands, registerCommands } = require('./src/commandLoader');
const { startMatchMonitor } = require('./src/matchMonitor');
const { getActivePolls, getClosedUnscoredPolls, closePoll } = require('./src/pollManager');

// Patch console.log to prefix every line with HH:MM:SS
const _log = console.log.bind(console);
console.log = (...args) => {
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8);
  _log(`[${ts}]`, ...args);
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

client.commands = new Collection();

client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await loadCommands(client);
  await registerCommands(client);
  startMatchMonitor(client, { getActivePolls, getClosedUnscoredPolls, closePoll });
  startHeartbeat();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(err);
    const msg = { content: '❌ An error occurred.', flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

// ---------------------------------------------------------------------------
// Owner DM helper
// ---------------------------------------------------------------------------

async function dmOwner(message) {
  const ownerId = process.env.OWNER_ID;
  if (!ownerId || !client.isReady()) return;
  try {
    const owner = await client.users.fetch(ownerId);
    await owner.send(message);
  } catch (err) {
    console.error('Failed to DM owner:', err.message);
  }
}

// Export so other modules can use it
module.exports = { dmOwner };

// ---------------------------------------------------------------------------
// Crash alerting
// ---------------------------------------------------------------------------

async function alertOwner(type, err) {
  const timestamp = new Date().toLocaleString();
  await dmOwner(
    `🚨 **Gilius Bot crashed!**\n` +
    `**Type:** ${type}\n` +
    `**Time:** ${timestamp}\n` +
    `**Error:** \`\`\`${String(err).slice(0, 1500)}\`\`\``
  );
}

process.on('uncaughtException', async (err) => {
  console.error('Uncaught exception:', err);
  await alertOwner('Uncaught Exception', err);
  process.exit(1);
});

process.on('unhandledRejection', async (err) => {
  console.error('Unhandled rejection:', err);
  await alertOwner('Unhandled Rejection', err);
});

// ---------------------------------------------------------------------------
// Heartbeat — DMs owner if bot loses Discord connection for >5 minutes
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS  = 60 * 1000;    // check every 60s
const HEARTBEAT_TIMEOUT_MS   = 5 * 60 * 1000; // alert if disconnected for 5m

let lastHeartbeat = Date.now();
let heartbeatAlerted = false;

function startHeartbeat() {
  // discord.js exposes the websocket ping — update lastHeartbeat when it's healthy
  setInterval(async () => {
    if (client.isReady() && client.ws.ping > 0 && client.ws.ping < 9999) {
      lastHeartbeat = Date.now();
      heartbeatAlerted = false;
      return;
    }

    const sinceLastBeat = Date.now() - lastHeartbeat;
    if (sinceLastBeat > HEARTBEAT_TIMEOUT_MS && !heartbeatAlerted) {
      heartbeatAlerted = true;
      const mins = Math.round(sinceLastBeat / 60000);
      await dmOwner(
        `⚠️ **Gilius Bot may be unresponsive!**\n` +
        `No healthy Discord connection detected in **${mins} minutes**.\n` +
        `The bot is still running but may be disconnected. Check \`pm2 logs gilius-bot\`.`
      );
    }
  }, HEARTBEAT_INTERVAL_MS);
}

client.login(process.env.DISCORD_TOKEN);
