const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  PermissionFlagsBits,
} = require('discord.js');
const { getUpcomingMatches, formatMatch } = require('../src/lolesports');
const { createPoll, getActivePolls, closePoll } = require('../src/pollManager');
const { getPollChannel } = require('../src/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Manage LoL Esports prediction polls')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a match prediction poll for an upcoming LoL Esports match')
    )
    .addSubcommand(sub =>
      sub
        .setName('close')
        .setDescription('Manually close an active prediction poll (Admin only)')
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      await handleCreate(interaction);
    } else if (sub === 'close') {
      await handleClose(interaction, client);
    }
  },
};

async function handleCreate(interaction) {
  const pollChannelId = getPollChannel(interaction.guildId);

  if (!pollChannelId) {
    return interaction.reply({
      content: '⚠️ No poll channel has been set yet. An admin needs to run `/setchannel` first.',
      flags: 64,
    });
  }

  if (interaction.channelId !== pollChannelId) {
    return interaction.reply({
      content: `❌ Polls can only be created in <#${pollChannelId}>!`,
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  let events;
  try {
    events = await getUpcomingMatches();
  } catch (err) {
    console.error('LoL API error:', err);
    return interaction.editReply({
      content: '❌ Failed to fetch matches from the LoL Esports API. Try again in a moment.',
    });
  }

  if (!events.length) {
    return interaction.editReply({ content: '📭 No upcoming matches found in the next 7 days.' });
  }

  const matches = events.map(formatMatch).filter(
    m => m.team1.code !== '???' && m.team2.code !== '???'
  );

  if (!matches.length) {
    return interaction.editReply({ content: '📭 No matches with confirmed teams found right now.' });
  }

  const options = matches.slice(0, 25).map(m => {
    const start = new Date(m.startTime);
    const timeStr = start.toLocaleString('en-GB', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' }) + ' CET';
    return {
      label: `${m.team1.code} vs ${m.team2.code}`,
      description: `${m.leagueName} • ${timeStr}`,
      value: m.id,
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('match_select')
    .setPlaceholder('Select a match to create a poll for...')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const listEmbed = new EmbedBuilder()
    .setColor(0xC89B3C)
    .setTitle('🏆 Upcoming LoL Esports Matches')
    .setDescription(`Found **${matches.length}** upcoming match${matches.length !== 1 ? 'es' : ''}.\nSelect one below to create a prediction poll in this channel.`)
    .setFooter({ text: 'Poll will be posted publicly in this channel.' });

  const reply = await interaction.editReply({ embeds: [listEmbed], components: [row] });

  try {
    const selection = await reply.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
    });

    await selection.deferUpdate();

    const selectedMatchId = selection.values[0];
    const match = matches.find(m => m.id === selectedMatchId);

    if (!match) {
      return interaction.editReply({ content: '❌ Could not find that match. Please try again.', components: [], embeds: [] });
    }

    if (match.state === 'inProgress' || match.state === 'completed') {
      return interaction.editReply({
        content: `❌ The match **${match.team1.code} vs ${match.team2.code}** has already started or finished.`,
        components: [], embeds: [],
      });
    }

    const result = await createPoll(interaction.channel, match, interaction.user.username);

    if (result.error) {
      return interaction.editReply({ content: `⚠️ ${result.error}`, components: [], embeds: [] });
    }

    await interaction.editReply({
      content: `✅ Poll created for **${match.team1.code} vs ${match.team2.code}**!`,
      components: [], embeds: [],
    });
  } catch (err) {
    if (err.code === 'InteractionCollectorError') {
      await interaction.editReply({ content: '⏱️ Selection timed out. Run `/poll create` again to try.', components: [], embeds: [] });
    } else {
      console.error('Poll create error:', err);
      await interaction.editReply({ content: '❌ Something went wrong creating the poll.', components: [], embeds: [] });
    }
  }
}

async function handleClose(interaction, client) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) &&
      !interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: '❌ You need Manage Guild or Manage Channels permission to close polls.',
      flags: 64,
    });
  }

  const activePolls = getActivePolls();

  if (!activePolls.length) {
    return interaction.reply({
      content: '📭 There are no active polls to close right now.',
      flags: 64,
    });
  }

  const options = activePolls.map(poll => {
    const { team1, team2, leagueName } = poll.match;
    const startTs = new Date(poll.startTime).toLocaleString('en-GB', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' }) + ' CET';
    return {
      label: `${team1.code} vs ${team2.code}`,
      description: `${leagueName} • Starts ${startTs}`,
      value: poll.matchId,
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('closepoll_select')
    .setPlaceholder('Select a poll to close...')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const reply = await interaction.reply({
    content: '🔒 Which poll would you like to close?',
    components: [row],
    flags: 64,
  });

  try {
    const selection = await reply.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: i => i.user.id === interaction.user.id,
      time: 30_000,
    });

    await selection.deferUpdate();

    const matchId = selection.values[0];
    const poll = activePolls.find(p => p.matchId === matchId);

    await closePoll(client, matchId);

    const { team1, team2 } = poll.match;
    await interaction.editReply({
      content: `✅ Poll for **${team1.code} vs ${team2.code}** has been closed.`,
      components: [],
    });
  } catch (err) {
    if (err.code === 'InteractionCollectorError') {
      await interaction.editReply({ content: '⏱️ Timed out. Run `/poll close` again to try.', components: [] });
    } else {
      console.error('Poll close error:', err);
      await interaction.editReply({ content: '❌ Something went wrong closing the poll.', components: [] });
    }
  }
}
