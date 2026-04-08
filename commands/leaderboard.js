const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboardFromDate, getLeaderboard } = require('../src/scoreManager');
const { getAllPolls } = require('../src/pollManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show prediction leaderboards')
    .addSubcommand(sub =>
      sub
        .setName('poll')
        .setDescription('Show cumulative leaderboard from a specific poll onwards')
        .addStringOption(opt =>
          opt
            .setName('message_id')
            .setDescription('The message ID of the poll to start from')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('alltime')
        .setDescription('Show the all-time prediction leaderboard for this server')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'poll') {
      await handlePoll(interaction);
    } else if (sub === 'alltime') {
      await handleAllTime(interaction);
    }
  },
};

async function handlePoll(interaction) {
  await interaction.deferReply();

  const messageId = interaction.options.getString('message_id');
  const allPolls = getAllPolls();
  const poll = allPolls.find(p => p.messageId === messageId);

  if (!poll) {
    return interaction.editReply({
      content: `❌ No poll found with message ID \`${messageId}\`. Make sure you're copying the ID of the poll message itself.`,
    });
  }

  const fromDate = new Date(poll.startTime);
  const entries = getLeaderboardFromDate(fromDate);

  if (!entries.length) {
    return interaction.editReply({
      content: `📭 No scored predictions from **${poll.match.team1.code} vs ${poll.match.team2.code}** onwards yet.`,
    });
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rows = entries.map((e, i) => {
    const pct = e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0;
    const rank = medals[i] ?? `**${i + 1}.**`;
    return `${rank} **${e.username}** — ${e.correct}/${e.total} correct (${pct}%)`;
  });

  const startDate = fromDate.toLocaleDateString('en-GB', { dateStyle: 'medium' });

  const embed = new EmbedBuilder()
    .setColor(0xC89B3C)
    .setTitle(`🏆 Leaderboard from ${poll.match.team1.code} vs ${poll.match.team2.code} onwards`)
    .setDescription(rows.join('\n'))
    .setFooter({ text: `From ${startDate} • ${entries.length} player(s)` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleAllTime(interaction) {
  await interaction.deferReply();

  const entries = getLeaderboard(99999);

  if (!entries.length) {
    return interaction.editReply({ content: '📭 No scored predictions yet.' });
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rows = entries.map((e, i) => {
    const pct = e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0;
    const rank = medals[i] ?? `**${i + 1}.**`;
    return `${rank} **${e.username}** — ${e.correct}/${e.total} correct (${pct}%)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xC89B3C)
    .setTitle('🏆 All-Time Prediction Leaderboard')
    .setDescription(rows.join('\n'))
    .setFooter({ text: `${entries.length} player(s) • all scored polls` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
