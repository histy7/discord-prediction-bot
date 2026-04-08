const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

async function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
    console.log(`📦 Loaded command: ${command.data.name}`);
  }
}

async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commands = client.commands.map(cmd => cmd.data.toJSON());
  const guildId = process.env.GUILD_ID;

  try {
    if (guildId) {
      // Guild commands update instantly — use this during development
      console.log('🔄 Registering slash commands to guild (instant)...');
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      console.log('✅ Slash commands registered to guild.');
    } else {
      // Global commands can take up to 1 hour to propagate
      console.log('🔄 Registering slash commands globally...');
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log('✅ Slash commands registered globally.');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

module.exports = { loadCommands, registerCommands };
