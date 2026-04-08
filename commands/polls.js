const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAllPolls } = require('../src/pollManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('polls')
    .setDescription('View all active and recent prediction polls'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const allPolls = getAllPolls();

    if (!allPolls.length) {
      return interaction.editReply({
        content: '📭 No polls have been created yet. Use `/poll` to start one!',
      });
    }

    const fields = allPolls.map(poll => {
      const { team1, team2, leagueName } = poll.match;
      const startTs = Math.floor(new Date(poll.startTime).getTime() / 1000);

      return {
        name: `${poll.closed ? '🔒' : '🟢'} ${team1.code} vs ${team2.code} — ${leagueName}`,
        value:
          `Starts: <t:${startTs}:F>\n` +
          `Status: ${poll.closed ? '**Closed**' : '**Open**'}`,
        inline: false,
      };
    });

    const embed = new EmbedBuilder()
      .setColor(0xC89B3C)
      .setTitle('📊 All Prediction Polls')
      .addFields(fields)
      .setFooter({ text: 'Use /poll to create a new poll.' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
