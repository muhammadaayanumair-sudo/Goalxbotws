'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { EmbedFactory, PALETTE } = require('../../utils/embed');
const Guild = require('../../models/Guild');
const { resolvePostableChannel } = require('../../scheduler/channelDelivery');

const CHANNEL_LABELS = {
  goals:     '⚽ Goals',
  fixtures:  '📅 Fixtures',
  live:      '🔴 Live Scores',
  matchday:  '🗓️ Matchday',
  lineups:   '🏁 Lineups',
  news:      '📰 News',
  transfers: '🔄 Transfers',
};

/**
 * Builds a realistic-looking sample embed for each channel type.
 */
function buildSampleEmbed(type) {
  switch (type) {
    case 'goals':
      return new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle('⚽  G O A L !')
        .setDescription(
          '**Arsenal** `2` — `1` **Chelsea**\n' +
          '─────────────────────────────────\n' +
          '🏆 **Premier League** · England\n' +
          '⏱️ **67\'**  ·  🏟️ Emirates Stadium\n\n' +
          '*This is a sample goal alert — real alerts fire when a goal is scored in a live match.*'
        )
        .setFooter({ text: '⚽ GoalX Live · Updates every 60s' })
        .setTimestamp();

    case 'fixtures':
      return new EmbedBuilder()
        .setColor(PALETTE.fixture)
        .setTitle('📅  PREMIER LEAGUE')
        .setDescription(
          '🏴󠁧󠁢󠁥󠁮󠁧󠁿 **Sample Fixture Day**\n\n' +
          '`Arsenal` vs `Chelsea`  ·  `15:00`\n' +
          '`Man City` vs `Liverpool`  ·  `17:30`\n' +
          '`Tottenham` vs `Man United`  ·  `20:00`\n\n' +
          '*This is a sample fixture digest — real posts go out every 6 hours.*'
        )
        .setFooter({ text: '3 matches today · GoalX' })
        .setTimestamp();

    case 'live':
      return new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('🔴  LIVE UPDATE')
        .setDescription(
          '**Arsenal** `1` — `0` **Chelsea**\n' +
          '─────────────────────────────────\n' +
          '🏆 **Premier League** · England\n' +
          '⏱️ **45\'**  ·  🏟️ Emirates Stadium\n\n' +
          '*This is a sample live update — real alerts fire on score & status changes.*'
        )
        .setFooter({ text: '⚽ GoalX Live · Updates every 60s' })
        .setTimestamp();

    case 'news':
      return new EmbedBuilder()
        .setColor(PALETTE.news)
        .setTitle('📰  Sample News Article')
        .setDescription(
          '**Kylian Mbappé scores hat-trick as Real Madrid thrash Atletico in El Derbi**\n\n' +
          'Real Madrid extended their lead at the top of La Liga with a commanding 4-1 victory...\n\n' +
          '*This is a sample news post — real posts go out every 15 minutes.*'
        )
        .setFooter({ text: '📰 News · GoalX' })
        .setTimestamp();

    case 'transfers':
      return new EmbedBuilder()
        .setColor('#27AE60')
        .setTitle('🔄  Transfer News')
        .setDescription(
          '**⚡ Breaking:** *Jude Bellingham* linked with a summer return to the Premier League.\n\n' +
          '> Source: Fabrizio Romano · Reliability: ★★★★★\n\n' +
          '*This is a sample transfer alert — real posts go out every 2 hours.*'
        )
        .setFooter({ text: '🔄 Transfers · GoalX' })
        .setTimestamp();

    case 'matchday':
      return new EmbedBuilder()
        .setColor(PALETTE.fixture)
        .setTitle('🗓️  PREMIER LEAGUE — Matchday Summary')
        .setDescription(
          '📆 **Saturday, 11 July 2026**\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
          '`Arsenal` **vs** `Chelsea`  ·  `15:00`  ·  🏟️ Emirates Stadium\n' +
          '`Man City` **vs** `Liverpool`  ·  `17:30`  ·  🏟️ Etihad Stadium\n\n' +
          '*This is a sample matchday summary — real summaries post once daily.*'
        )
        .setFooter({ text: '2 matches · GoalX · Matchday Summary' })
        .setTimestamp();

    case 'lineups':
      return new EmbedBuilder()
        .setColor(PALETTE.success)
        .setTitle('🏁  Arsenal vs Chelsea — KICKOFF')
        .setDescription(
          '⚽ **Arsenal vs Chelsea** is underway!\n' +
          '🏆 Premier League · England\n' +
          '⏱️ 1\'\n\n' +
          '**Arsenal (4-3-3)**\n' +
          'Raya, White, Saliba, Gabriel, Timber, Ødegaard, Rice, Partey, Saka, Havertz, Martinelli\n\n' +
          '**Chelsea (4-2-3-1)**\n' +
          'Sánchez, Gusto, Fofana, Colwill, Cucurella, Caicedo, Fernández, Palmer, Madueke, Neto, Jackson\n\n' +
          '*This is a sample kickoff/lineup post — real posts fire when matches start.*'
        )
        .setFooter({ text: 'Arsenal vs Chelsea · Premier League · Kickoff' })
        .setTimestamp();

    default:
      return EmbedFactory.success('Test Delivery', 'Channel is connected and working correctly!');
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testdelivery')
    .setDescription('Send a test message to verify your configured channels are working')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Which channel to test (default: all configured)')
        .setRequired(false)
        .addChoices(
          { name: '⚽ Goals', value: 'goals' },
          { name: '📅 Fixtures', value: 'fixtures' },
          { name: '🔴 Live Scores', value: 'live' },
          { name: '🗓️ Matchday', value: 'matchday' },
          { name: '🏁 Lineups', value: 'lineups' },
          { name: '📰 News', value: 'news' },
          { name: '🔄 Transfers', value: 'transfers' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  cooldown: 10,

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const specificType = interaction.options.getString('type');
    const typesToTest = specificType
      ? [specificType]
      : Object.keys(CHANNEL_LABELS);

    const guildDoc = await Guild.findOne({ guildId: interaction.guildId }).lean();
    if (!guildDoc) {
      return interaction.editReply({
        embeds: [EmbedFactory.error('Not Set Up', "This server hasn't configured any channels yet. Use `/set*channel` commands first.")],
      });
    }

    const results = [];

    for (const type of typesToTest) {
      const cfg = guildDoc.channels?.[type];
      if (!cfg?.channelId || !cfg?.enabled) {
        results.push(`${CHANNEL_LABELS[type]}: **not configured** — use \`/set${type}channel\` to set it up`);
        continue;
      }

      const channel = await resolvePostableChannel(interaction.client, cfg.channelId, interaction.guildId, 'TestDelivery');
      if (!channel) {
        results.push(`${CHANNEL_LABELS[type]}: ❌ **cannot post** — check bot permissions in <#${cfg.channelId}>`);
        continue;
      }

      try {
        const sampleEmbed = buildSampleEmbed(type);
        await channel.send({
          content: '> 🧪 **Test delivery** from `/testdelivery` — confirming this channel is live.',
          embeds: [sampleEmbed],
        });
        results.push(`${CHANNEL_LABELS[type]}: ✅ sent to <#${cfg.channelId}>`);
      } catch {
        results.push(`${CHANNEL_LABELS[type]}: ❌ **send failed** in <#${cfg.channelId}>`);
      }
    }

    await interaction.editReply({
      embeds: [
        EmbedFactory.base(
          '🧪 Test Delivery Results',
          results.join('\n\n') ||
            'No channels to test. Use `/set*channel` for goals/fixtures/live/news/transfers, or `/matchday channel` for matchday/lineups/results.'
        ),
      ],
    });
  },
};
