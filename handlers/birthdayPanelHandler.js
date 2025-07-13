// 📁 handlers/birthdayPanelHandler.js (מעודכן לטיפול בסלקטור החדש)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const generateBirthdayCard = require('../utils/generateBirthdayCard');

const BIRTHDAY_COLLECTION = 'birthdays';
const VERIFIED_ROLE_ID = '1120787309432938607';

function parseBirthdayInput(input) {
  const regex = /^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})$/;
  const match = input.match(regex);
  if (!match) return null;
  let [_, day, month, year] = match;
  day = parseInt(day);
  month = parseInt(month);
  year = parseInt(year.length === 2 ? `19${year}` : year);
  const testDate = new Date(year, month - 1, day);
  if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  const passed = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!passed) age--;
  if (age < 5 || age > 120) return null;
  return { day, month, year, age };
}

// ---------------- טיפול במודאל ----------------
async function handleBirthdayModalSubmit(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const input = interaction.fields.getTextInputValue('birthday_input');
    const parsed = parseBirthdayInput(input);
    const userId = interaction.user.id;
    const doc = await db.collection(BIRTHDAY_COLLECTION).doc(userId).get();
    if (doc.exists) {
        return interaction.editReply({ content: '🔁 כבר הזנת תאריך יום הולדת בעבר.', flags: MessageFlags.Ephemeral });
    }
    if (!parsed) {
        return interaction.editReply({ content: '❌ תאריך לא תקין. נסה פורמט כמו 31/12/1990 או 1.1.88', flags: MessageFlags.Ephemeral });
    }
    const { day, month, year, age } = parsed;
    const sourceId = `discord:${userId}`;
    const fullName = interaction.member.displayName;
    let matchedDoc = null;
    const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
    snapshot.forEach(doc => {
        if (doc.data().linkedAccounts?.includes(sourceId)) matchedDoc = doc;
    });
    const newData = { birthday: { day, month, year, age }, fullName, addedBy: sourceId, createdAt: new Date().toISOString(), linkedAccounts: [sourceId] };
    if (matchedDoc) {
        const existingLinks = new Set(matchedDoc.data().linkedAccounts || []);
        existingLinks.add(sourceId);
        await matchedDoc.ref.update({ ...newData, linkedAccounts: Array.from(existingLinks) });
    } else {
        await db.collection(BIRTHDAY_COLLECTION).doc(userId).set(newData);
    }
    const embed = new EmbedBuilder().setColor('Green').setTitle('🎂 יום הולדת נרשם בהצלחה!').setDescription(`📅 תאריך: **${day}.${month}.${year}**\n🎈 גיל: **${age}**`).setFooter({ text: 'שמעון תמיד זוכר 🎉' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ---------------- פונקציה מרכזית לטיפול באינטראקציות של יום הולדת ----------------
// היא תטפל גם בכפתורים וגם בבחירות מה-Select Menu
async function handleBirthdayPanel(interaction, client) {
  const { customId, member, guild } = interaction;
  let actionId = customId;

  // ✅ אם זו אינטראקציה של Select Menu, נקבל את הערך הנבחר
  if (interaction.isStringSelectMenu()) {
      actionId = interaction.values?.[0]; // הערך שנבחר
  }
  
  // ✅ deferReply בתחילת ה-handler, לפני כל לוגיקה
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

  // 🎁 הצגת רשימת ימי הולדת
  if (actionId === 'bday_list') {
    const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
    if (snapshot.empty) {
        return interaction.editReply({ content: '🙈 אין ימי הולדת רשומים עדיין.', flags: MessageFlags.Ephemeral });
    }
    const months = Array.from({ length: 12 }, () => []);
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.birthday) {
        const { day, month, year, age } = data.birthday;
        months[month - 1].push(`• 📅 ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year} — ${data.fullName} (${age})`);
      }
    });

    const embeds = [];
    let currentFields = [];
    let pageNum = 1;

    months.forEach((arr, i) => {
      if (arr.length > 0) {
        const monthName = new Date(0, i).toLocaleString('he-IL', { month: 'long' });
        const newField = { name: `חודש ${monthName} (${i + 1})`, value: arr.join('\n'), inline: false };

        // בדיקה למגבלות Embed (25 שדות, 6000 תווים)
        if (currentFields.length + 1 > 25 || (currentFields.reduce((sum, f) => sum + f.name.length + f.value.length, 0) + newField.name.length + newField.value.length > 5500)) {
            embeds.push(new EmbedBuilder().setColor('Purple').setTitle('📆 ימי הולדת בקהילה').setFooter({ text: `עמוד ${pageNum} מתוך ... • שמעון` }).addFields(currentFields));
            currentFields = [];
            pageNum++;
        }
        currentFields.push(newField);
      }
    });
    // הוסף את השדות האחרונים
    if (currentFields.length > 0) {
        embeds.push(new EmbedBuilder().setColor('Purple').setTitle('📆 ימי הולדת בקהילה').setFooter({ text: `עמוד ${pageNum} מתוך ... • שמעון` }).addFields(currentFields));
    }

    // ✅ בדיקה אם יש בכלל embeds לפני ביצוע forEach
    if (embeds.length > 0) {
        embeds.forEach((embed, index) => {
            // ✅ בדיקה אם יש שדות לפני ביצוע forEach
            if (embed.data.fields && Array.isArray(embed.data.fields)) {
                embed.data.fields.forEach(field => {
                    if (field.value && field.value.length > 1024) {
                        field.value = field.value.slice(0, 1021) + '...';
                    }
                });
            }
            // ✅ בדיקה אם יש פוטר לפני גישה למאפיינים שלו
            if (embed.data.footer && embed.data.footer.text) {
                // עדכון הפוטר עם סה"כ עמודים
                embed.setFooter({ text: embed.data.footer.text.replace('...', embeds.length.toString()) });
            }
        });
    }

    return interaction.editReply({ embeds: embeds.length > 0 ? embeds : [new EmbedBuilder().setColor('Purple').setTitle('📆 ימי הולדת בקהילה').setDescription('אין ימי הולדת רשומים עדיין.').setFooter({ text: 'שמעון' })] });
  }

  // 🔮 הצגת היום הולדת הבא
  if (actionId === 'bday_next') {
    const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
    if (snapshot.empty) return interaction.editReply({ content: '😢 אין ימי הולדת בכלל.' });
    const today = new Date();
    const nowDay = today.getDate();
    const nowMonth = today.getMonth() + 1;
    const upcoming = snapshot.docs.map(doc => {
        const data = doc.data();
        if (!data.birthday) return null;
        const { birthday, fullName } = data;
        const { day, month, year } = birthday;
        const date = new Date(today.getFullYear(), month - 1, day);
        if (month < nowMonth || (month === nowMonth && day < nowDay)) date.setFullYear(today.getFullYear() + 1);
        return { fullName, day, month, year, date, userId: doc.id };
      }).filter(Boolean).sort((a, b) => a.date - b.date)[0];
    if (!upcoming) return interaction.editReply({ content: 'לא נמצא יום הולדת קרוב.' });
    const user = await interaction.guild.members.fetch(upcoming.userId).then(m => m.user).catch(() => null);
    const profileUrl = user?.displayAvatarURL({ extension: 'png', size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const buffer = await generateBirthdayCard({ fullName: upcoming.fullName, birthdate: `${String(upcoming.day).padStart(2, '0')}.${String(upcoming.month).padStart(2, '0')}.${upcoming.year}`, profileUrl });
    return interaction.editReply({ content: '🎉 הקרוב ביותר לחגוג:', files: [{ attachment: buffer, name: 'birthday_banner.png' }] });
  }

  // ➕ פתיחת מודל הוספת יום הולדת
  // customId 'bday_add' מגיע מהכפתור, 'open_birthday_modal' מגיע מהתזכורת השבועית
  if (actionId === 'bday_add' || actionId === 'open_birthday_modal') {
    // ✅ אין צורך ב-editReply כאן, showModal מטפל בזה
    await showBirthdayModal(interaction); 
    return; // חשוב לסיים את הפונקציה לאחר הצגת המודאל
  }

  // ❓ הצגת רשימת משתמשים ללא יום הולדת
  if (actionId === 'bday_missing') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.editReply({ content: '⛔ הפקודה זמינה רק לאדמינים.', flags: MessageFlags.Ephemeral });
    await guild.members.fetch();
    const allMembers = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(VERIFIED_ROLE_ID));
    const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
    const registeredIds = new Set(snapshot.docs.map(doc => doc.id));
    const missing = allMembers.filter(m => !registeredIds.has(m.id));

    const missingUsersList = missing.map(m => `• ${m.displayName}`).join('\n');
    const displayDescription = missing.size === 0 ? '✅ כל המשתמשים מעודכנים!' : (missingUsersList.length > 1000 ? missingUsersList.slice(0, 997) + '...' : missingUsersList);

    const embed = new EmbedBuilder().setColor('DarkRed').setTitle('❓ משתמשים שעדיין לא הזינו יום הולדת').setDescription(displayDescription).setFooter({ text: `סה"כ חסרים: ${missing.size}` });
    return interaction.editReply({ embeds: [embed], components: missing.size > 0 ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bday_remind_missing').setLabel('📨 שלח תזכורת למשתמשים החסרים').setStyle(ButtonStyle.Primary))] : [], flags: MessageFlags.Ephemeral });
  }

  // 📨 שליחת תזכורות למי שלא הזין
  // customId 'bday_remind_missing' (מכפתור) או 'bday_remind_missing_admin' (מסלקטור)
  if (actionId === 'bday_remind_missing' || actionId === 'bday_remind_missing_admin') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.editReply({ content: '⛔ אין הרשאה.', flags: MessageFlags.Ephemeral });
    
    await guild.members.fetch();
    const allMembers = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(VERIFIED_ROLE_ID));
    const snapshot = await db.collection(BIRTHDAY_COLLECTION).get();
    const registeredIds = new Set(snapshot.docs.map(doc => doc.id));
    const missing = allMembers.filter(m => !registeredIds.has(m.id));
    let success = 0, failed = 0;
    for (const user of missing.values()) {
        try {
            const embed = new EmbedBuilder().setColor('Purple').setTitle('🎂 הצטרף ללוח ימי ההולדת שלנו!').setDescription(['👋 היי! בקהילת **Gamers United IL** אנחנו אוהבים לחגוג 🎉', '', '📅 תוכל לעדכן את יום ההולדת שלך ולהיכנס ללוח הקהילתי.', 'כך נוכל לברך אותך בזמן – ולשלוח לך הודעה חגיגית! 🎈', '', '⬇️ לחץ על הכפתור כדי להוסיף את התאריך שלך:'].join('\n')).setFooter({ text: 'שמעון – זוכר את כולם 🎁' }).setTimestamp();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_birthday_modal').setLabel('📅 הוסף יום הולדת עכשיו').setStyle(ButtonStyle.Primary));
            await user.send({ embeds: [embed], components: [row] });
            success++;
        } catch { failed++; }
    }
    const resultEmbed = new EmbedBuilder().setTitle('📬 סיום שליחת התזכורות').setColor('Green').setDescription(`ההודעות נשלחו ל־**${success}** משתמשים.\n${failed > 0 ? `❌ ${failed} נכשלו (אין DM פתוח?)` : '✅ כולם קיבלו!'}`);
    return interaction.editReply({ embeds: [resultEmbed] });
  }
}

// ---------------- פונקציה חדשה: פתיחת מודאל יום הולדת ----------------
async function showBirthdayModal(interaction) {
    const modal = new ModalBuilder().setCustomId('birthday_modal').setTitle('🎉 הוספת יום הולדת');
    const input = new TextInputBuilder().setCustomId('birthday_input').setLabel('הכנס תאריך (למשל: 14/05/1993)').setStyle(TextInputStyle.Short).setPlaceholder('פורמט: 31/12/1990 או 1.1.88').setRequired(true);
    
    // תקן כאן: צריך להוסיף את שדה הקלט לתוך ActionRowBuilder, ואת ה-ActionRow ל-modal
    const row = new ActionRowBuilder().addComponents(input); // נוסיף את ה-input לתוך row
    modal.addComponents(row); // ונוסיף את ה-row למודאל
    
    await interaction.showModal(modal);
}

// ייצוא שתי הפונקציות העיקריות
module.exports = {
    handleBirthdayPanel, // מטפל בכפתורים
    handleBirthdayModalSubmit, // מטפל בשליחת המודאל
    showBirthdayModal // פונקציה עזר לפתיחת המודאל
};