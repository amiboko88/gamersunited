const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder,
    ComponentType
} = require('discord.js');
const matchmaker = require('../../handlers/matchmaker');
const store = require('../../whatsapp/store');
const dashboardHandler = require('../../handlers/users/dashboard');
// נדרש עבור דוח דיבוג מעוצב (בהמשך נחליף לגראפיקה)
const { getSocket } = require('../../whatsapp/socket');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('management')
        .setDescription('🛠️ פאנל ניהול ראשי (דשבורד, וואטסאפ, מערכת)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await showMainMenu(interaction);
    }
};

/**
 * תפריט ראשי - כפתורים בלבד
 */
async function showMainMenu(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🛠️ מערכת ניהול GamersUnited')
        .setDescription('בחר כלי לניהול:')
        .setColor('#2b2d31')
        .addFields(
            { name: '📊 Dashboard', value: 'סטטיסטיקות שרת, משתמשים ופעילות.', inline: true },
            { name: '🔗 Link WhatsApp', value: 'חיבור ידני של מספרי טלפון/LID.', inline: true },
            { name: '🛠️ Debug System', value: 'דוח מצב טכני (וואטסאפ/DB).', inline: true }
        )
        .setFooter({ text: 'GamersUnited Admin Panel' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mng_btn_dashboard').setLabel('פתח דשבורד').setStyle(ButtonStyle.Primary).setEmoji('📊'),
        new ButtonBuilder().setCustomId('mng_btn_link').setLabel('קישור וואטסאפ').setStyle(ButtonStyle.Secondary).setEmoji('🔗'),
        new ButtonBuilder().setCustomId('mng_btn_debug').setLabel('דוח דיבוג').setStyle(ButtonStyle.Secondary).setEmoji('🛠️')
    );

    // שליחה ראשונית או עדכון
    const payload = { content: '', embeds: [embed], components: [row], ephemeral: true };
    let response;

    if (interaction.replied || interaction.deferred) {
        response = await interaction.editReply(payload);
    } else {
        response = await interaction.reply(payload);
    }

    // יצירת Collector לאינטראקציות
    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 }); // 5 דקות

    collector.on('collect', async i => {
        // בדיקת הרשאות (למרות שהפקודה חסומה, ליתר ביטחון)
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ התפריט הזה לא בשבילך.', ephemeral: true });
        }

        try {
            if (i.customId === 'mng_btn_dashboard') {
                await i.deferUpdate();
                await dashboardHandler.showMainDashboard(interaction); // מעביר את האינטראקציה המקורית לעריכה
                collector.stop();
            }
            else if (i.customId === 'mng_btn_link') {
                await handleLinkWa(i); // מעביר את האינטראקציה של הכפתור
            }
            else if (i.customId === 'mng_btn_debug') {
                await handleDebugWa(i);
            }
        } catch (error) {
            console.error(error);
            if (!i.replied) await i.reply({ content: '❌ שגיאה.', ephemeral: true });
        }
    });
}

// --- Link WA Logic ---

async function handleLinkWa(interaction) {
    const orphans = await matchmaker.getOrphans(); // עדיין מחזיר את כולם, נסנן בהמשך אם צריך

    // סינון: (אופציונלי) פה אפשר לסנן משתמשים שכבר מקושרים אם המידע זמין בזיכרון
    // כרגע נציג את כולם כי אולי המשתמש רוצה לתקן קישור שגוי

    if (orphans.length === 0) {
        return interaction.reply({ content: '✅ הכל נקי. אין יתומים (LIDs) שממתינים לקישור.', ephemeral: true });
    }

    const options = orphans.slice(0, 25).map(o => ({
        label: `${o.name} (${o.lid.slice(-5)})`,
        description: `💬 ${o.lastMsg || 'No msg'}`,
        value: o.lid
    }));

    const select = new StringSelectMenuBuilder()
        .setCustomId('mng_select_lid')
        .setPlaceholder(`בחר משתמש לקישור (${orphans.length} ממתינים)...`)
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);

    // עדכון ההודעה הקיימת עם התפריט החדש
    await interaction.update({
        content: '**🔗 קישור משתמשים:**\nבחר משתמש וואטסאפ (LID) מהרשימה כדי לחבר אותו למשתמש דיסקורד.',
        embeds: [],
        components: [row]
    });

    // כאן הטיפול עובר ל-EventHandler הגלובלי (או שנצטרך להוסיף קולקטור חדש אם רוצים לוגיקה מקומית)
    // הערה: בדיסקורד כדאי לטפל ב-Components גלובלית ב-interactionCreate, אבל כאן נשתמש בקולקטור מקומי לפשטות

    const msg = await interaction.fetchReply();
    const filter = i => i.user.id === interaction.user.id;
    const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'mng_select_lid') {
            const selectedLid = i.values[0];

            // שלב 2: בחירת משתמש דיסקורד
            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('mng_select_discord')
                .setPlaceholder('בחר את משתמש הדיסקורד המתאים');

            const row2 = new ActionRowBuilder().addComponents(userSelect);

            await i.update({
                content: `🔗 בחרת את LID: \`${selectedLid}\`.\nעכשיו בחר **מי זה** בדיסקורד:`,
                components: [row2]
            });

            // שומרים את ה-LID בקונטקסט של הקולקטור (או משתנה מקומי)
            collector.lid = selectedLid;
        }
        else if (i.customId === 'mng_select_discord') {
            const targetUserId = i.values[0];
            const lid = collector.lid;

            if (!lid) return i.reply({ content: '❌ שגיאה: איבדתי את ה-LID.', ephemeral: true });

            // ביצוע הקישור
            const result = await matchmaker.linkUser(targetUserId, lid);

            if (!result.success) {
                return i.update({ content: `❌ שגיאה: ${result.error}`, components: [] });
            }

            if (result.status === 'complete') {
                await i.update({ content: `✅ **חובר בהצלחה!**\n<@${targetUserId}> סונכרן עם ה-LID הזה.\n📱 טלפון: ${result.phone}`, components: [] });
            }
            else if (result.status === 'needs_phone') {
                // הצגת מודאל
                const modal = new ModalBuilder()
                    .setCustomId(`mng_modal_phone_${targetUserId}`)
                    .setTitle('השלמת פרטים')
                    .addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('phone').setLabel('מספר טלפון').setStyle(TextInputStyle.Short).setPlaceholder('054...')
                    ));

                await i.showModal(modal);

                // המתנה למודאל
                try {
                    const submitted = await i.awaitModalSubmit({ time: 60000, filter: s => s.customId === `mng_modal_phone_${targetUserId}` });
                    const phone = submitted.fields.getTextInputValue('phone');
                    await matchmaker.updateUserPhone(targetUserId, phone);
                    await submitted.reply({ content: '✅ **עודכן וחובר!**', ephemeral: true });
                } catch (e) { }
            }
            collector.stop();
        }
    });
}

// --- Debug WA Logic ---

async function handleDebugWa(interaction) {
    await interaction.deferUpdate();

    // כאן נשתמש בגרפיקה החדשה בעתיד. בינתיים נציג טקסט משופר.
    try {
        const contacts = store.contacts;
        const sock = getSocket(); // מהסוקט החדש
        const orphans = await matchmaker.getOrphans();

        let statusColor = sock ? '#00e676' : '#d50000';
        let statusText = sock ? 'מחובר 🟢' : 'מנותק 🔴';

        const embed = new EmbedBuilder()
            .setTitle('🛠️ דוח דיבוג מערכת')
            .setColor(statusColor)
            .addFields(
                { name: 'חיבור', value: statusText, inline: true },
                { name: 'אנשי קשר בזיכרון', value: `${Object.keys(contacts).length}`, inline: true },
                { name: 'יתומים (Orphans)', value: `${orphans.length}`, inline: true }
            )
            .setTimestamp();

        if (orphans.length > 0) {
            const list = orphans.map(o => `\`${o.lid.slice(0, 10)}...\` (${o.name})`).join('\n');
            embed.addFields({ name: 'רשימת יתומים', value: list });
        }

        // יצירת קובץ טקסט מלא למקרה הצורך
        if (Object.keys(contacts).length > 0) {
            // ... לוגיקה ליצירת קובץ כמו קודם ...
        }

        await interaction.editReply({ embeds: [embed], components: [], content: '' });

    } catch (error) {
        console.error(error);
        await interaction.editReply({ content: `❌ שגיאה בדיבוג: ${error.message}` });
    }
}