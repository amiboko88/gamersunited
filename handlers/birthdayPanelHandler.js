// 📁 handlers/birthdayPanelHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getUserRef } = require('../utils/userUtils');
const db = require('../utils/firebase');
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
 * ✅ הפונקציה שהייתה חסרה: הנתב הראשי של הפאנל
 */
async function handleBirthdayPanel(interaction, client) {
    // אם זו בחירה מתפריט (Select Menu)
    if (interaction.isStringSelectMenu() && interaction.customId === 'birthday_action_select') {
        const selection = interaction.values[0];
        
        if (selection === 'add_bday') {
            await showBirthdayModal(interaction);
        } else if (selection === 'check_bday') {
            // לוגיקה לבדיקת יום הולדת קיים
            const userRef = await getUserRef(interaction.user.id, 'discord');
            const doc = await userRef.get();
            const bday = doc.data()?.identity?.birthday;
            
            if (bday) {
                await interaction.reply({ 
                    content: `🎂 יום ההולדת שלך מוגדר ל: **${bday.day}/${bday.month}/${bday.year}**`,
                    flags: MessageFlags.Ephemeral 
                });
            } else {
                await interaction.reply({ 
                    content: '❌ לא מוגדר לך יום הולדת במערכת.',
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    }
    // אם זה כפתור רגיל שפותח את הפאנל
    else {
        await showBirthdayModal(interaction);
    }
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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // נותן זמן ליצירת התמונה

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
            // שולחים את המידע בצורה מפורשת לפונקציית היצירה
            const cardBuffer = await generateBirthdayCard({
                fullName: interaction.member.displayName,
                birthdate: birthday, // שולחים אובייקט ולא סטרינג! (התיקון בקובץ הבא מטפל בזה)
                profileUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 })
            });
            files.push(cardBuffer);
        } catch (e) {
            console.warn('Could not generate birthday card image:', e);
        }
        
        await interaction.editReply({ 
            content: `✅ תאריך הלידה שלך (${birthday.day}/${birthday.month}/${birthday.year}) נשמר בהצלחה!`,
            files: files
        });

    } catch (error) {
        console.error('Birthday Update Error:', error);
        if (interaction.deferred) {
            await interaction.editReply({ content: '❌ שגיאה בשמירת התאריך.' });
        } else {
            await interaction.reply({ content: '❌ שגיאה בשמירת התאריך.', flags: MessageFlags.Ephemeral });
        }
    }
}

/**
 * פונקציית מנהל: שולחת תזכורות בפרטי לכל מי שלא הזין יום הולדת
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
        const usersSnapshot = await db.collection('users').get();
        const guild = interaction.guild;

        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            const userId = doc.id;

            if (userData.identity && userData.identity.birthday) {
                alreadySet++;
                continue;
            }

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member || member.user.bot) continue;

            const embed = new EmbedBuilder()
                .setTitle('🎂 מתי יום ההולדת שלך?')
                .setDescription(`היי **${member.displayName}**, שים לב שעדיין לא עדכנת תאריך לידה במערכת!\nתעדכן כדי שנוכל לחגוג לך כמו שצריך (ואולי תקבל מתנה).`)
                .setColor('#FF69B4')
                .setFooter({ text: 'לחץ על הכפתור למטה לעדכון מהיר' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_birthday_modal')
                    .setLabel('📅 הוסף יום הולדת עכשיו')
                    .setStyle(ButtonStyle.Primary)
            );

            try {
                await member.send({ embeds: [embed], components: [row] });
                success++;
            } catch (e) {
                failed++;
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
    handleBirthdayPanel, // ✅ נוסף
    showBirthdayModal, 
    handleBirthdayModalSubmit, 
    sendBirthdayReminders 
};