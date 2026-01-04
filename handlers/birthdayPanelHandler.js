// 📁 handlers/birthdayPanelHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getUserRef } = require('../utils/userUtils'); // ✅ עבודה מול המאגר המאוחד
const db = require('../utils/firebase'); // לשליפות כלליות
const generateBirthdayCard = require('../utils/generateBirthdayCard');

// פונקציית עזר לפענוח תאריך
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
  if (year > now.getFullYear() || year < 1900) return null; 

  return { day, month, year };
}

/**
 * פותח את המודאל למשתמש (UI)
 */
async function showBirthdayModal(interaction) {
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

    await interaction.showModal(modal);
}

/**
 * מטפל בשמירת הנתונים מהמודאל ל-DB המאוחד
 */
async function handleBirthdayModalSubmit(interaction) {
    const inputDate = interaction.fields.getTextInputValue('birthday_input');
    const birthday = parseBirthdayInput(inputDate);

    if (!birthday) {
        return interaction.reply({ content: '❌ תאריך לא תקין. נסה שוב בפורמט 14/05/1993.', flags: MessageFlags.Ephemeral });
    }

    try {
        const userRef = await getUserRef(interaction.user.id, 'discord');
        
        // עדכון ישיר בזהות המשתמש ב-DB המאוחד
        await userRef.set({
            identity: {
                birthday: birthday,
                displayName: interaction.user.username
            },
            tracking: {
                birthdayUpdated: new Date().toISOString()
            }
        }, { merge: true });

        // יצירת כרטיס תצוגה
        let files = [];
        try {
            const cardBuffer = await generateBirthdayCard(interaction.member, birthday);
            files.push(cardBuffer);
        } catch (e) {
            console.warn('Could not generate birthday card image:', e);
        }
        
        await interaction.reply({ 
            content: `✅ תאריך הלידה שלך (${birthday.day}/${birthday.month}/${birthday.year}) נשמר בהצלחה!`,
            files: files,
            flags: MessageFlags.Ephemeral 
        });

    } catch (error) {
        console.error('Birthday Update Error:', error);
        await interaction.reply({ content: '❌ שגיאה בשמירת התאריך.', flags: MessageFlags.Ephemeral });
    }
}

/**
 * פונקציית מנהל: שולחת תזכורות בפרטי לכל מי שלא הזין יום הולדת
 * (זו הפונקציה שהייתה חסרה לך בקוד הקודם)
 */
async function sendBirthdayReminders(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '⛔ פקודה למנהלים בלבד.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    let success = 0;
    let failed = 0;
    let alreadySet = 0;

    try {
        // שליפת כל המשתמשים מה-DB המאוחד
        const usersSnapshot = await db.collection('users').get();
        const guild = interaction.guild;

        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            const userId = doc.id;

            // אם כבר יש יום הולדת - מדלגים
            if (userData.identity && userData.identity.birthday) {
                alreadySet++;
                continue;
            }

            // מנסים להשיג את המשתמש בדיסקורד
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member || member.user.bot) continue;

            // שליחת הודעה פרטית
            const embed = new EmbedBuilder()
                .setTitle('🎂 מתי יום ההולדת שלך?')
                .setDescription(`היי **${member.displayName}**, שים לב שעדיין לא עדכנת תאריך לידה במערכת!\nתעדכן כדי שנוכל לחגוג לך כמו שצריך (ואולי תקבל מתנה).`)
                .setColor('#FF69B4')
                .setFooter({ text: 'לחץ על הכפתור למטה לעדכון מהיר' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_birthday_modal') // כפתור שמפעיל את showBirthdayModal
                    .setLabel('📅 הוסף יום הולדת עכשיו')
                    .setStyle(ButtonStyle.Primary)
            );

            try {
                await member.send({ embeds: [embed], components: [row] });
                success++;
            } catch (e) {
                failed++; // כנראה ה-DM חסום
            }
        }

        const resultEmbed = new EmbedBuilder()
            .setTitle('📬 סיום שליחת תזכורות')
            .setColor('Green')
            .addFields(
                { name: '✅ נשלחו', value: success.toString(), inline: true },
                { name: '❌ נכשלו (DM סגור)', value: failed.toString(), inline: true },
                { name: '⏭️ דולגו (כבר הוגדר)', value: alreadySet.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed] });

    } catch (error) {
        console.error('Error sending reminders:', error);
        await interaction.editReply({ content: '❌ אירעה שגיאה במהלך שליחת התזכורות.' });
    }
}

module.exports = { 
    showBirthdayModal, 
    handleBirthdayModalSubmit, 
    sendBirthdayReminders 
};