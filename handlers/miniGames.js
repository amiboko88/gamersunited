// 📁 handlers/miniGames.js
const {
  TextChannel,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType
} = require('discord.js');
const { smartRespond } = require('./smartChat');

const TARGET_TEXT_CHANNEL_ID = '583575179880431616';
let lastGameMessageId = null;

const winMessages = [
  '🎉 יש לנו זוכה! איזה חיה אתה 💪',
  '🥳 בול בפוני! שמעון מצדיע לך',
  '🔥 זה היה מהיר! כמו שאתה נופל בגולאג',
  '👑 מלך הרגע! רוצים לראות אם אתה גם תותח במשחק?',
  '😎 חזק! עכשיו תנסה ככה גם במשחק אמיתי'
];

const fakeQuotes = [
  { quote: 'אני סוחב ת׳קבוצה כל ערב לבד!', author: 'יוגי' },
  { quote: 'מי עוד משחק Warzone בשנת 2025?', author: 'מתן' },
  { quote: 'שמעון, שים אותי MVP או שאני עוזב', author: 'רועי' },
  { quote: 'כל פעם שאני עולה, אתה נופל – דיל?', author: 'עומרי' }
];

const serverHistory = [
  { fact: '🎮 מישהו הביא טריפל קיל עם סכין בלבד.', answer: true },
  { fact: '🚁 שחקן נזרק מהשרת בגלל שהרג יותר מדי.', answer: false },
  { fact: '🐐 פעם שחקן חיכה 25 דקות בסקווד לבד.', answer: true }
];

function isGameTime() {
  const hour = new Date().getUTCHours() + 3;
  return hour >= 18 && hour < 24;
}

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function startMiniGameScheduler(client) {
  setInterval(async () => {
    if (!isGameTime()) return;

    const guild = client.guilds.cache.first();
    const channel = guild.channels.cache.get(TARGET_TEXT_CHANNEL_ID);
    if (!(channel instanceof TextChannel)) return;

    const gameType = Math.floor(Math.random() * 5); // כולל משחקים חדשים

    let embed, row, answer, message;

    // ניחוש מספר
    if (gameType === 0) {
      answer = Math.floor(Math.random() * 20) + 1;
      embed = new EmbedBuilder()
        .setTitle('🎲 ניחוש מספר')
        .setDescription('נחשו מספר בין **1** ל־**20**!\nמי שפוגע – זוכה!')
        .setColor('Green');

      message = await channel.send({ embeds: [embed] });
      lastGameMessageId = message.id;

      const collector = channel.createMessageCollector({
        filter: m => !m.author.bot && /^\d+$/.test(m.content),
        time: 30_000
      });

      let found = false;

      collector.on('collect', msg => {
        if (parseInt(msg.content) === answer) {
          channel.send(`${msg.author} ${getRandom(winMessages)} (התשובה הייתה ${answer})`);
          found = true;
          collector.stop();
        }
      });

      collector.on('end', async () => {
        if (!found) {
          await message.delete().catch(() => {});
          channel.send('😢 אף אחד לא פגע הפעם... אולי בפעם הבאה!');
        }
      });
    }

    // אמת או שקר
    if (gameType === 1) {
      const tf = getRandom([
        { statement: '💀 הייתה רכבת ב־Warzone הראשון.', answer: true },
        { statement: '🎧 פינג גבוה זה סמל מקצוענות.', answer: false }
      ]);
      embed = new EmbedBuilder()
        .setTitle('🤔 אמת או שקר?')
        .setDescription(tf.statement)
        .setColor('Yellow');

      row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('true').setLabel('✅ אמת').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('false').setLabel('❌ שקר').setStyle(ButtonStyle.Danger)
      );

      message = await channel.send({ embeds: [embed], components: [row] });
      lastGameMessageId = message.id;

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30_000
      });

      let anyClick = false;

      collector.on('collect', i => {
        if (i.user.bot) return;
        anyClick = true;
        const isCorrect = i.customId === (tf.answer ? 'true' : 'false');
        i.reply({
          content: isCorrect
            ? `🎉 נכון, ${i.user.username}!`
            : `😬 שגוי, ${i.user.username}...`,
          ephemeral: true
        });
      });

      collector.on('end', async () => {
        if (!anyClick) {
          await message.delete().catch(() => {});
          channel.send('📉 אף אחד לא השתתף... תחזרו כשיש יותר מצב רוח!');
        }
      });
    }

    // טריוויה על השרת
    if (gameType === 2) {
      const q = getRandom(serverHistory);
      embed = new EmbedBuilder()
        .setTitle('📚 קרה או לא קרה?')
        .setDescription(q.fact)
        .setColor('Purple');

      row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('true').setLabel('📗 קרה').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('false').setLabel('📕 לא קרה').setStyle(ButtonStyle.Danger)
      );

      message = await channel.send({ embeds: [embed], components: [row] });
      lastGameMessageId = message.id;

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30_000
      });

      collector.on('collect', i => {
        const correct = i.customId === (q.answer ? 'true' : 'false');
        i.reply({
          content: correct
            ? `💡 נכון, ${i.user.username}! אתה בעניינים.`
            : `❌ לא נכון... התשובה הייתה ${q.answer ? 'כן' : 'לא'}.`,
          ephemeral: true
        });
      });

      collector.on('end', async c => {
        if (c.size === 0) {
          await message.delete().catch(() => {});
          channel.send('👻 אף אחד לא שיחק... השרת ישנוני היום.');
        }
      });
    }

    // מי אמר את זה?
    if (gameType === 3) {
      const q = getRandom(fakeQuotes);
      embed = new EmbedBuilder()
        .setTitle('🗣️ מי אמר את זה?')
        .setDescription(`"${q.quote}"`)
        .setColor('Blue');

      message = await channel.send({ embeds: [embed] });
      lastGameMessageId = message.id;

      const collector = channel.createMessageCollector({
        filter: m => !m.author.bot,
        time: 30_000
      });

      collector.on('collect', msg => {
        if (msg.content.toLowerCase().includes(q.author.toLowerCase())) {
          channel.send(`🏅 יפה ${msg.author}, קלטת את זה!`);
          collector.stop();
        }
      });

      collector.on('end', async c => {
        if (!c.size) {
          await message.delete().catch(() => {});
          channel.send('🫠 אין ניחושים? טוב, נחכה לפעם הבאה.');
        }
      });
    }

    // תגובה למי שמתעורר מאוחר
    setTimeout(() => {
      channel.messages.fetch({ limit: 5 }).then(messages => {
        const lateResponse = messages.find(m =>
          m.reference?.messageId === lastGameMessageId ||
          /שמעון|משחק|ניחוש|טריוויה|שאלה/i.test(m.content)
        );

        if (lateResponse) {
          smartRespond(lateResponse, 'רגיש');
        }
      }).catch(() => {});
    }, 45_000);

  }, 1000 * 60 * 60 * 3); // כל 3 שעות
}

module.exports = { startMiniGameScheduler };
