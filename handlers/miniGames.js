const { TextChannel } = require('discord.js');

const TARGET_TEXT_CHANNEL_ID = '583575179880431616';

const winMessages = [
  '🎉 יש לנו זוכה! איזה חיה אתה 💪',
  '🏆 נכון מאוד! אתה לא רק גיימר, אתה גם נביא',
  '🥳 בול בפוני! שמעון מצדיע לך',
  '🎯 ככה עושים את זה! ניחוש חד כמו סנייפר',
  '😎 חזק! עכשיו תנסה ככה גם במשחק אמיתי',
  '🔥 זה היה מהיר! כמו שאתה נופל בגולאג',
  '😏 שיחקת אותה. עכשיו תבוא לערוץ קול ותראה שגם שם אתה חד',
  '🤖 אולי אתה בעצם בוט? ככה מדויקים רק AI',
  '💡 הברקה של המאה! אפילו שמעון לא ציפה לזה',
  '😱 איזה ניחוש! אני מרגיש מובך בשם שאר המשתתפים',
  '👑 מלך הרגע! רוצים לראות אם אתה גם תותח במשחק?',
  '🥷 שקט שקט... באת, ניחשת, ניצחת. סטייל של אלופים',
  '📢 תעצרו הכל! יש לנו נביא בשרת',
  '🧠 מוח על. תן קצת אינטואיציה לשאר',
  '🍗 קיבלת את זה בול, כאילו היה על האש',
  '⚔️ ניצחון כזה לא רואים כל יום. כנראה זה הצד שלך בלובי',
  '🏹 צליפה מדויקת במספר – שחקן רמות גבוהות',
  '📈 מאז שאתה פה, השרת עלה רמה',
  '💬 קיבלת ניקוד מלא! עכשיו אל תיעלם, תישאר ותשפיל אחרים',
  '🥁 תופים בבקשה... יש לנו שחקן הערב!'
];


const triviaQuestions = [
  {
    question: '🎮 מהו שם המפה הכי מוכרת ב־Warzone 1?',
    answer: 'verdansk'
  },
  {
    question: '🕹️ איזה משחק ישראלי עשה באזז עם עגבניות מתפוצצות?',
    answer: 'ברדק'
  },
  {
    question: '💣 כמה שחקנים יש בלובי של Battle Royale קלאסי?',
    answer: '150'
  }
];

const trueFalseQuestions = [
  {
    statement: '👻 שמועה: אם תצעק "שמעון תביא UAV" שלוש פעמים – זה באמת קורה.',
    answer: false
  },
  {
    statement: '💀 במשחק Warzone הראשון הייתה רכבת שזזה בזמן אמת.',
    answer: true
  },
  {
    statement: '🎧 אם יש לך פינג גבוה מ־100, אתה בעצם שחקן מקצוען.',
    answer: false
  }
];

function isGameTime() {
  const now = new Date();
  const hour = now.getUTCHours() + 3; // UTC+3 = שעון ישראל
  return hour >= 20 || hour < 3;
}

function getRandomWinMessage() {
  return winMessages[Math.floor(Math.random() * winMessages.length)];
}

function getRandomTrivia() {
  return triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
}

function getRandomTrueFalse() {
  return trueFalseQuestions[Math.floor(Math.random() * trueFalseQuestions.length)];
}

function startMiniGameScheduler(client) {
  setInterval(async () => {
    if (!isGameTime()) return;

    const guild = client.guilds.cache.first();
    if (!guild) return;

    const channel = guild.channels.cache.get(TARGET_TEXT_CHANNEL_ID);
    if (!(channel instanceof TextChannel)) return;

    const gameType = Math.floor(Math.random() * 3); // 0 = מספר, 1 = אמת/שקר, 2 = טריוויה

    if (gameType === 0) {
      // ניחוש מספר
      const number = Math.floor(Math.random() * 20) + 1;
      await channel.send('🎲 נחשו מספר בין **1** ל־**20**! מי שפוגע – זוכה!');

      const filter = m =>
        !m.author.bot && !isNaN(m.content) && Number(m.content) >= 1 && Number(m.content) <= 20;

      const collector = channel.createMessageCollector({ filter, time: 30_000 });

      collector.on('collect', msg => {
        if (Number(msg.content) === number) {
          channel.send(`${msg.author} ${getRandomWinMessage()} (התשובה הייתה ${number})`);
          collector.stop();
        }
      });

      collector.on('end', collected => {
        if (!collected.some(m => Number(m.content) === number)) {
          channel.send(`⏱️ נגמר הזמן! אף אחד לא פגע... המספר היה **${number}**.`);
        }
      });
    }

    if (gameType === 1) {
      // אמת או שקר
      const tf = getRandomTrueFalse();
      await channel.send(`🤔 אמת או שקר?\n${tf.statement}\n(כתבו "אמת" או "שקר")`);

      const filter = m =>
        !m.author.bot && ['אמת', 'שקר'].includes(m.content.trim());

      const collector = channel.createMessageCollector({ filter, time: 30_000 });

      collector.on('collect', msg => {
        const guess = msg.content.trim() === 'אמת';
        if (guess === tf.answer) {
          channel.send(`✅ ${msg.author} צדק! בינגו.`);
        } else {
          channel.send(`❌ ${msg.author} טועה. יפה שניסית.`); // לא עוצרים – אפשר כמה נסיונות
        }
      });

      collector.on('end', () => {
        channel.send('🛑 משחק אמת/שקר הסתיים.');
      });
    }

    if (gameType === 2) {
      // טריוויה
      const trivia = getRandomTrivia();
      await channel.send(`📢 שאלה לקהילה:\n${trivia.question}`);

      const filter = m =>
        !m.author.bot && m.content.toLowerCase().includes(trivia.answer.toLowerCase());

      const collector = channel.createMessageCollector({ filter, time: 30_000 });

      collector.on('collect', msg => {
        channel.send(`🏆 ${msg.author} ענה נכון! (${trivia.answer})`);
        collector.stop();
      });

      collector.on('end', collected => {
        if (!collected.size) {
          channel.send(`📉 אף אחד לא ידע... התשובה הייתה: **${trivia.answer}**`);
        }
      });
    }

  }, 1000 * 60 * 60 * 3); // כל 3 שעות בלילה
}

module.exports = { startMiniGameScheduler };
