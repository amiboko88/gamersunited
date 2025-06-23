const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');

const db = require('../utils/firebase');
const BIRTHDAY_COLLECTION = 'birthdays';
const VERIFIED_ROLE_ID = '1120787309432938607';

module.exports = async function handleBirthdayPanel(interaction) {
  const { customId, member, guild } = interaction;

  // 🎁 הצגת רשימת ימי הולדת
  if (customId === 'bday_list') {
    const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
    if (snapshot.empty) {
      return interaction.reply({ content: '🙈 אין ימי הולדת רשומים עדיין.', ephemeral: true });
    }

    const months = Array.from({ length: 12 }, () => []);
    snapshot.forEach(doc => {
      const data = doc.data();
      const { day, month, year, age } = data.birthday;
      months[month - 1].push(`📅 ${day}.${month}.${year} — ${data.fullName} (${age})`);
    });

    const embed = new EmbedBuilder()
      .setColor('Purple')
      .setTitle('📆 ימי הולדת בקהילה')
      .setFooter({ text: 'ממוינים לפי חודש • שמעון' });

    months.forEach((arr, i) => {
      if (arr.length > 0) {
        embed.addFields({ name: `חודש ${i + 1}`, value: arr.join('\n'), inline: false });
      }
    });

    return interaction.reply({ embeds: [embed] });
  }

  // 🔮 הצגת היום הולדת הבא
  if (customId === 'bday_next') {
    const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
    if (snapshot.empty) {
      return interaction.reply({ content: '😢 אין ימי הולדת בכלל.' });
    }

    const today = new Date();
    const nowDay = today.getDate();
    const nowMonth = today.getMonth() + 1;

    const upcoming = snapshot.docs
      .map(doc => {
        const { birthday, fullName } = doc.data();
        const { day, month, year, age } = birthday;
        const date = new Date(today.getFullYear(), month - 1, day);
        if (month < nowMonth || (month === nowMonth && day < nowDay)) {
          date.setFullYear(today.getFullYear() + 1);
        }
        return { fullName, date, age };
      })
      .sort((a, b) => a.date - b.date)[0];

    const embed = new EmbedBuilder()
      .setColor('Gold')
      .setTitle('🔮 יום ההולדת הבא!')
      .setDescription(`🎉 הקרוב ביותר לחגוג הוא **${upcoming.fullName}** ב־${upcoming.date.toLocaleDateString('he-IL')}\n🎂 גיל: **${upcoming.age}**`)
      .setFooter({ text: 'שמעון תמיד זוכר 🎈' });

    return interaction.reply({ embeds: [embed] });
  }

  // ➕ פתיחת מודל הוספת יום הולדת
  if (customId === 'bday_add') {
    const modal = new ModalBuilder()
      .setCustomId('birthday_modal')
      .setTitle('🎉 הוספת יום הולדת');

    const input = new TextInputBuilder()
      .setCustomId('birthday_input')
      .setLabel('הכנס תאריך (למשל: 14/05/1993)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('פורמט: 31/12/1990 או 1.1.88')
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  // ❓ הצגת רשימת משתמשים ללא יום הולדת
  if (customId === 'bday_missing') {
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isAdmin) {
      return interaction.reply({ content: '⛔ הפקודה זמינה רק לאדמינים.', ephemeral: true });
    }

    await guild.members.fetch();
    const allMembers = guild.members.cache.filter(
      m => !m.user.bot && m.roles.cache.has(VERIFIED_ROLE_ID)
    );

    const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
    const registeredIds = new Set(snapshot.docs.map(doc => doc.id));
    const missing = allMembers.filter(m => !registeredIds.has(m.id));

    const embed = new EmbedBuilder()
      .setColor('DarkRed')
      .setTitle('❓ משתמשים שעדיין לא הזינו יום הולדת')
      .setDescription(
        missing.size === 0
          ? '✅ כל המשתמשים מעודכנים!'
          : missing.map(m => `• ${m.displayName}`).join('\n')
      )
      .setFooter({ text: `סה"כ חסרים: ${missing.size}` });

    return interaction.reply({
      embeds: [embed],
      components: missing.size > 0 ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('bday_remind_missing')
            .setLabel('📨 שלח תזכורת למשתמשים החסרים')
            .setStyle(ButtonStyle.Primary)
        )
      ] : [],
      ephemeral: true
    });
  }

  // 📨 שליחת תזכורות למי שלא הזין
if (customId === 'bday_remind_missing') {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) {
    return interaction.reply({ content: '⛔ אין הרשאה.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  await guild.members.fetch();
  const allMembers = guild.members.cache.filter(
    m => !m.user.bot && m.roles.cache.has(VERIFIED_ROLE_ID)
  );

  const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
  const registeredIds = new Set(snapshot.docs.map(doc => doc.id));
  const missing = allMembers.filter(m => !registeredIds.has(m.id));

  let success = 0, failed = 0;

  for (const user of missing.values()) {
    try {
      const embed = new EmbedBuilder()
        .setColor('Purple')
        .setTitle('🎂 הצטרף ללוח ימי ההולדת שלנו!')
        .setDescription([
          '👋 היי! בקהילת **Gamers United IL** אנחנו אוהבים לחגוג 🎉',
          '',
          '📅 תוכל לעדכן את יום ההולדת שלך ולהיכנס ללוח הקהילתי.',
          'כך נוכל לברך אותך בזמן – ולשלוח לך הודעה חגיגית! 🎈',
          '',
          '⬇️ לחץ על הכפתור כדי להוסיף את התאריך שלך:'
        ].join('\n'))
        .setFooter({ text: 'שמעון – זוכר את כולם 🎁' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_birthday_modal')
          .setLabel('📅 הוסף יום הולדת עכשיו')
          .setStyle(ButtonStyle.Primary)
      );

      await user.send({ embeds: [embed], components: [row] });
      success++;
    } catch {
      failed++;
    }
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle('📬 סיום שליחת התזכורות')
    .setColor('Green')
    .setDescription(`ההודעות נשלחו ל־**${success}** משתמשים.\n${failed > 0 ? `❌ ${failed} נכשלו (אין DM פתוח?)` : '✅ כולם קיבלו!'}`);

  return interaction.editReply({ embeds: [resultEmbed] });
}

 

  // ✅ שליחה מתוך המודל
  if (interaction.isModalSubmit && interaction.customId === 'birthday_modal') {
    const input = interaction.fields.getTextInputValue('birthday_input');
    const parsed = parseBirthdayInput(input);
    const userId = interaction.user.id;

    const doc = await db.collection(BIRTHDAY_COLLECTION).doc(userId).get();
    if (doc.exists) {
      return interaction.reply({
        content: '🔁 כבר הזנת תאריך יום הולדת בעבר. אין צורך להזין שוב.',
        ephemeral: true
      });
    }

    if (!parsed) {
      return interaction.reply({
        content: '❌ תאריך לא תקין. נסה פורמט כמו 31/12/1990 או 1.1.88',
        ephemeral: true
      });
    }

    const { day, month, year, age } = parsed;

    await db.collection(BIRTHDAY_COLLECTION).doc(userId).set({
      birthday: { day, month, year, age },
      fullName: interaction.member.displayName,
      addedBy: userId,
      createdAt: new Date().toISOString()
    });

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('🎂 יום הולדת נרשם בהצלחה!')
      .setDescription(`📅 תאריך: **${day}.${month}.${year}**\n🎈 גיל: **${age}**`)
      .setFooter({ text: 'שמעון תמיד זוכר 🎉' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

// פונקציית עזר
function parseBirthdayInput(input) {
  const regex = /^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})$/;
  const match = input.match(regex);
  if (!match) return null;

  let [_, day, month, year] = match;
  day = parseInt(day);
  month = parseInt(month);
  year = parseInt(year.length === 2 ? `19${year}` : year);

  const testDate = new Date(year, month - 1, day);
  if (
    testDate.getFullYear() !== year ||
    testDate.getMonth() !== month - 1 ||
    testDate.getDate() !== day
  ) return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  const passed =
    now.getMonth() + 1 > month ||
    (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!passed) age--;

  if (age < 5 || age > 120) return null;
  return { day, month, year, age };
}
