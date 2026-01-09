// 📁 handlers/birthday/interaction.js
const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../utils/firebase');

class BirthdayInteractionHandler {

    /**
     * פתיחת הטופס (Modal) להזנת תאריך
     */
    async showModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('modal_bd_submit')
            .setTitle('🎂 הזנת תאריך יום הולדת');

        const dayInput = new TextInputBuilder()
            .setCustomId('bd_day')
            .setLabel("יום (1-31)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('למשל: 8')
            .setMaxLength(2)
            .setRequired(true);

        const monthInput = new TextInputBuilder()
            .setCustomId('bd_month')
            .setLabel("חודש (1-12)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('למשל: 2')
            .setMaxLength(2)
            .setRequired(true);

        const yearInput = new TextInputBuilder()
            .setCustomId('bd_year')
            .setLabel("שנת לידה (אופציונלי)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('למשל: 1988')
            .setMaxLength(4)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(dayInput),
            new ActionRowBuilder().addComponents(monthInput),
            new ActionRowBuilder().addComponents(yearInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * טיפול בשמירת הטופס
     */
    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const day = parseInt(interaction.fields.getTextInputValue('bd_day'));
        const month = parseInt(interaction.fields.getTextInputValue('bd_month'));
        let yearStr = interaction.fields.getTextInputValue('bd_year');
        let year = yearStr ? parseInt(yearStr) : null;

        // ולידציה בסיסית
        if (isNaN(day) || day < 1 || day > 31 || isNaN(month) || month < 1 || month > 12) {
            return interaction.editReply('❌ תאריך לא תקין. נסה שוב.');
        }

        const userId = interaction.user.id;

        // חישוב גיל (אם יש שנה)
        let age = null;
        if (year) {
            const currentYear = new Date().getFullYear();
            age = currentYear - year;
        }

        // שמירה ל-DB המאוחד והנקי (identity.birthday)
        await db.collection('users').doc(userId).set({
            identity: {
                birthday: {
                    day: day,
                    month: month,
                    year: year,
                    age: age
                }
            }
        }, { merge: true });

        const embed = new EmbedBuilder()
            .setTitle('✅ נשמר בהצלחה!')
            .setDescription(`יום ההולדת שלך עודכן ל: **${day}/${month}${year ? '/' + year : ''}**`)
            .setColor('Green');

        await interaction.editReply({ embeds: [embed] });
    }

    /**
     * פאנל ניהול - צפייה בחסרים ושליחת תזכורת
     */
    async showAdminPanel(interaction) {
        await interaction.deferUpdate(); // מעדכן את ההודעה הקיימת
        
        // שליפת כל המשתמשים
        const snapshot = await db.collection('users').get();
        let missingCount = 0;
        let missingMentions = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            // בודקים אם חסר יום הולדת במיקום הנכון
            if (!data.identity?.birthday) {
                missingCount++;
                // אוספים ID רק כדי להציג דוגמה או כמות
                if (missingMentions.length < 50) missingMentions.push(doc.id); 
            }
        });

        const embed = new EmbedBuilder()
            .setTitle('🛡️ פאנל ניהול ימי הולדת')
            .setDescription(`סטטוס קהילה:\n\n❌ **חסרי יום הולדת:** ${missingCount} משתמשים\n✅ **מעודכנים:** ${snapshot.size - missingCount} משתמשים`)
            .setColor('Red');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_bd_remind_all')
                .setLabel(`שלח תזכורת לכולם (${missingCount})`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📢')
                .setDisabled(missingCount === 0)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }

    /**
     * שליחת תזכורת (תיוג פומבי בערוץ)
     */
    async sendReminders(interaction) {
        await interaction.update({ content: '📢 שולח תזכורות...', components: [] });

        const snapshot = await db.collection('users').get();
        let pingList = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.identity?.birthday) {
                pingList.push(`<@${doc.id}>`);
            }
        });

        if (pingList.length === 0) {
            return interaction.followUp({ content: '✅ כולם מעודכנים! אין למי לשלוח.', ephemeral: true });
        }

        // שליחת הודעה לערוץ הנוכחי (לא Ephemeral) כדי שיתייג אותם
        // מפצלים להודעות אם זה ארוך מדי (דיסקורד מגביל ל-2000 תווים)
        const chunks = [];
        let currentChunk = "📢 **תזכורת ימי הולדת!**\nהמשתמשים הבאים טרם עדכנו תאריך יום הולדת. בואו לעדכן כדי שנוכל לחגוג לכם!\n--> הקלידו `/birthday`\n\n";
        
        for (const mention of pingList) {
            if ((currentChunk + mention).length > 1900) {
                chunks.push(currentChunk);
                currentChunk = mention + " ";
            } else {
                currentChunk += mention + " ";
            }
        }
        chunks.push(currentChunk);

        // שליחת ההודעות לערוץ
        for (const msg of chunks) {
            await interaction.channel.send(msg);
        }

        await interaction.followUp({ content: '✅ התזכורות נשלחו בהצלחה לערוץ.', ephemeral: true });
    }
}

module.exports = new BirthdayInteractionHandler();