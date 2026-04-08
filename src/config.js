const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'botconfig.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function getPollChannel(guildId) {
  const config = loadConfig();
  // Support both old single-channel format and new per-guild format
  if (config.pollChannels) {
    return config.pollChannels[guildId] || null;
  }
  // Migrate old format on first read
  return config.pollChannelId || null;
}

function setPollChannel(guildId, channelId) {
  const config = loadConfig();
  if (!config.pollChannels) {
    config.pollChannels = {};
  }
  config.pollChannels[guildId] = channelId;
  // Remove old single-channel key if present
  delete config.pollChannelId;
  saveConfig(config);
}

module.exports = { getPollChannel, setPollChannel };
