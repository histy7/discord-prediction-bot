const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { setPollChannel } = require('../src/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set the channel where polls will be posted (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to post polls in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    const permissions = channel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
      return interaction.reply({
        content: `❌ I don't have permission to send messages in ${channel}. Please check my permissions there first.`,
        flags: 64,
      });
    }

    setPollChannel(interaction.guildId, channel.id);

    await interaction.reply({
      content: `✅ Poll channel set to ${channel}! All polls will now be created there.`,
      flags: 64,
    });

    await channel.send({
      content: `📊 This channel has been set as the **LoL Esports Polls** channel. Use \`/poll\` to create match prediction polls here!`,
    });
  },
};
