'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { EconomyService } = require('../../services/economy/EconomyService');
const { logger } = require('../../utils/logger');

// ── Question bank ──────────────────────────────────────────────────────────
const QUESTIONS = [
  { q: 'Which country has won the most FIFA World Cups?', options: ['Germany', 'Argentina', 'Brazil', 'Italy'], answer: 2 },
  { q: 'Who scored the "Hand of God" goal in the 1986 World Cup?', options: ['Pelé', 'Diego Maradona', 'Ronaldo', 'Zidane'], answer: 1 },
  { q: 'Which club has won the most UEFA Champions League titles?', options: ['Barcelona', 'AC Milan', 'Real Madrid', 'Bayern Munich'], answer: 2 },
  { q: 'How many players are on the field per team in a standard football match?', options: ['9', '10', '11', '12'], answer: 2 },
  { q: 'In which year was the Premier League founded?', options: ['1988', '1990', '1992', '1995'], answer: 2 },
  { q: 'Who is the all-time top scorer in FIFA World Cup history?', options: ['Pelé', 'Miroslav Klose', 'Ronaldo Nazário', 'Gerd Müller'], answer: 1 },
  { q: 'Which nation hosted the 2022 FIFA World Cup?', options: ['UAE', 'Saudi Arabia', 'Qatar', 'Bahrain'], answer: 2 },
  { q: 'What is the maximum number of substitutions allowed per team in a standard match (as of 2024)?', options: ['3', '4', '5', '6'], answer: 2 },
  { q: 'Which player has won the most Ballon d\'Or awards?', options: ['Cristiano Ronaldo', 'Lionel Messi', 'Ronaldinho', 'Zinedine Zidane'], answer: 1 },
  { q: 'What colour card is shown for a temporary suspension (sin bin) introduced in some competitions?', options: ['Orange', 'Blue', 'Yellow-Red', 'White'], answer: 1 },
  { q: 'Which club is nicknamed "The Red Devils"?', options: ['AC Milan', 'Liverpool', 'Manchester United', 'Benfica'], answer: 2 },
  { q: 'In what decade was football (soccer) first included in the Olympic Games?', options: ['1880s', '1890s', '1900s', '1910s'], answer: 2 },
  { q: 'Who invented the "Cruyff Turn" dribbling move?', options: ['Ronaldinho', 'Johan Cruyff', 'George Best', 'Franz Beckenbauer'], answer: 1 },
  { q: 'Which English club did Thierry Henry join after leaving Juventus?', options: ['Chelsea', 'Arsenal', 'Tottenham', 'Manchester City'], answer: 1 },
  { q: 'What is the name of the trophy awarded to the UEFA Champions League winner?', options: ['Golden Cup', 'Big Ears', 'Europa Plate', 'Silver Jug'], answer: 1 },
  { q: 'Which country does Erling Haaland represent?', options: ['Denmark', 'Sweden', 'Norway', 'Finland'], answer: 2 },
  { q: 'How long is extra time (each period) in a knockout match?', options: ['10 minutes', '15 minutes', '20 minutes', '30 minutes'], answer: 1 },
  { q: 'Which club plays their home games at the Bernabéu?', options: ['Barcelona', 'Atlético Madrid', 'Real Madrid', 'Valencia'], answer: 2 },
  { q: 'Who was the first goalkeeper to win the Ballon d\'Or?', options: ['Peter Schmeichel', 'Oliver Kahn', 'Lev Yashin', 'Gianluigi Buffon'], answer: 2 },
  { q: 'Which tournament is contested by national teams from South America?', options: ['CONCACAF Gold Cup', 'Copa América', 'Africa Cup of Nations', 'Asian Cup'], answer: 1 },
  { q: 'Pelé spent most of his career at which club?', options: ['Flamengo', 'Corinthians', 'Santos', 'Vasco da Gama'], answer: 2 },
  { q: 'What does VAR stand for?', options: ['Video Assistant Referee', 'Visual Assistance Review', 'Video Analysis Review', 'Visual Action Replay'], answer: 0 },
  { q: 'Which club did Zinedine Zidane famously headbutt Marco Materazzi for in a World Cup final?', options: ['This happened in a club match', '2002 World Cup', '2006 World Cup', '1998 World Cup'], answer: 2 },
  { q: 'How many teams participated in the 2026 FIFA World Cup?', options: ['32', '36', '48', '64'], answer: 2 },
  { q: 'Which Premier League club has the nickname "The Gunners"?', options: ['Arsenal', 'West Ham', 'Sheffield United', 'Fulham'], answer: 0 },
  { q: 'Who scored the winning goal in the 1999 Champions League final for Manchester United?', options: ['Andy Cole', 'Dwight Yorke', 'Ole Gunnar Solskjaer', 'Teddy Sheringham'], answer: 2 },
  { q: 'In which city is Camp Nou located?', options: ['Madrid', 'Valencia', 'Seville', 'Barcelona'], answer: 3 },
  { q: 'Which country won the first ever FIFA World Cup in 1930?', options: ['Brazil', 'Argentina', 'Uruguay', 'Italy'], answer: 2 },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const REWARD_COINS = 100;
const REWARD_XP = 15;

function pickQuestion() {
  return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('❓ Test your football knowledge! Answer correctly to win coins 🧠'),

  cooldown: 45,

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const q = pickQuestion();
      const user = await EconomyService.getUser(
        interaction.user.id,
        interaction.user.username
      );

      const questionEmbed = new EmbedBuilder()
        .setColor('#7B2FBE')
        .setTitle('🧠  Football Trivia')
        .setDescription(
          [
            `**${q.q}**`,
            '',
            q.options.map((opt, i) => `**${OPTION_LABELS[i]}.** ${opt}`).join('\n'),
            '',
            `🏆 Correct answer wins **+${REWARD_COINS} coins** and **+${REWARD_XP} XP**`,
            '⏱️ You have **20 seconds**!',
          ].join('\n')
        )
        .setFooter({ text: 'GoalX Mini Games · Football Trivia' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        q.options.map((_, i) =>
          new ButtonBuilder()
            .setCustomId(`trivia_${i}`)
            .setLabel(OPTION_LABELS[i])
            .setStyle(ButtonStyle.Primary)
        )
      );

      const msg = await interaction.editReply({
        embeds: [questionEmbed],
        components: [row],
      });

      const collector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 20_000,
        max: 1,
      });

      collector.on('collect', async (btn) => {
        await btn.deferUpdate().catch(() => {});

        const chosen = parseInt(btn.customId.replace('trivia_', ''), 10);
        const correct = chosen === q.answer;

        if (correct) {
          await user.addCoins(REWARD_COINS);
          await user.addXp(REWARD_XP);
        }

        // Build result buttons — green for correct, red for wrong chosen, grey for rest
        const resultRow = new ActionRowBuilder().addComponents(
          q.options.map((_, i) => {
            let style = ButtonStyle.Secondary;
            if (i === q.answer) style = ButtonStyle.Success;
            else if (i === chosen && !correct) style = ButtonStyle.Danger;
            return new ButtonBuilder()
              .setCustomId(`trivia_result_${i}`)
              .setLabel(OPTION_LABELS[i])
              .setStyle(style)
              .setDisabled(true);
          })
        );

        const resultEmbed = new EmbedBuilder()
          .setColor(correct ? '#44FF88' : '#FF4444')
          .setTitle(correct ? '✅  Correct!' : '❌  Wrong Answer')
          .setDescription(
            [
              `**${q.q}**`,
              '',
              `**Correct answer:** ${OPTION_LABELS[q.answer]}. ${q.options[q.answer]}`,
              correct
                ? `\n🎉 You earned **+${REWARD_COINS} coins** and **+${REWARD_XP} XP**!`
                : `\n💡 Better luck next time! Try again in 45 seconds.`,
              `🪙 Balance: **${user.coins} coins**`,
            ].join('\n')
          )
          .setFooter({ text: 'GoalX Mini Games · Football Trivia' })
          .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed], components: [resultRow] });
      });

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          const timeoutRow = new ActionRowBuilder().addComponents(
            q.options.map((_, i) =>
              new ButtonBuilder()
                .setCustomId(`trivia_to_${i}`)
                .setLabel(OPTION_LABELS[i])
                .setStyle(i === q.answer ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(true)
            )
          );
          await interaction
            .editReply({
              embeds: [
                EmbedFactory.error(
                  'Time Up! ⏱️',
                  `The correct answer was **${OPTION_LABELS[q.answer]}. ${q.options[q.answer]}**. No coins lost — try again!`
                ),
              ],
              components: [timeoutRow],
            })
            .catch(() => {});
        }
      });
    } catch (error) {
      const expired = error.code === 10062;
      if (!expired) logger.error('[trivia] execute error:', error);
      try {
        const msg = {
          embeds: [EmbedFactory.error('Error', error.message || 'Something went wrong.')],
          flags: 64,
        };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else if (!expired) await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
