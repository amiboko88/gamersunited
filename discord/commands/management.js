const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require('discord.js');
const matchmaker = require('../../handlers/matchmaker');
const store = require('../../whatsapp/store');
const dashboardHandler = require('../../handlers/users/dashboard'); // ✅ שחזור הדשבורד הישן

// טיפול ב-Circular Dependency: דורשים את הסוקט רק כשצריך
const getWhatsAppSock = () => {
    try {
        const { getWhatsAppSock } = require('../../whatsapp/index');
        return getWhatsAppSock();
    } catch (e) {
        console.error("Error loading WhatsApp Socket:", e);
        return null;
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('management')
        .setDescription('🛠️ מערכת ניהול מקיפה (דשבורד, וואטסאפ ומשתמשים)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        // שחזור הפקודה הישנה כתת-פקודה ראשית
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('📊 פאנל ניהול המערכת המקורי (סטטיסטיקות, ניקוי וסנכרון)')
        )
        // הפקודות החדשות
        .addSubcommand(subcommand =>
            subcommand
                .setName('link_wa')
                .setDescription('🔗 קישור ידני של משתמשי וואטסאפ (LID) למשתמשי דיסקורד')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('debug_wa')
                .setDescription('🛠️ כלי דיבוג לוואטסאפ (Store & Socket)')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'dashboard') {
                // ✅ קריאה ללוגיקה הישנה והטובה
                await dashboardHandler.showMainDashboard(interaction);
            }
            else if (subcommand === 'link_wa') {
                await handleLinkWa(interaction);
            }
            else if (subcommand === 'debug_wa') {
                await handleDebugWa(interaction);
            }
        } catch (error) {
            console.error(`Error executing management command (${subcommand}):`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ שגיאה בביצוע הפקודה.', ephemeral: true });
            } else {
                await interaction.followUp({ content: '❌ שגיאה בביצוע הפקודה.', ephemeral: true });
            }
        }
    }
};

// --- פונקציות העזר החדשות (Link WA & Debug WA) ---

async function handleLinkWa(interaction) {
    const orphans = await matchmaker.getOrphans();

    if (orphans.length === 0) {
        return interaction.reply({ content: '✅ הכל נקי. אין משתמשים לא מזוהים כרגע.', ephemeral: true });
    }

    // שלב 1: תפריט בחירת LID
    const options = orphans.slice(0, 25).map(o => ({
        label: `${o.name} (${o.lid.slice(-5)})`, // הצגת סוף ה-LID לזיהוי
        description: `💬 ${o.lastMsg}`,
        value: o.lid
    }));

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('mng_select_lid')
                .setPlaceholder('בחר משתמש וואטסאפ (LID)...')
                .addOptions(options)
        );

    const response = await interaction.reply({
        content: `🔎 **נמצאו ${orphans.length} משתמשים לא מקושרים.**\nבחר את מי לחבר:`,
        components: [row],
        ephemeral: true
    });

    const collector = response.createMessageComponentCollector({ time: 60000 });
    let selectedLid = null;

    collector.on('collect', async i => {
        if (i.customId === 'mng_select_lid') {
            selectedLid = i.values[0];

            const userSelectRow = new ActionRowBuilder()
                .addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId('mng_select_discord_user')
                        .setPlaceholder('בחר משתמש דיסקורד')
                );

            await i.update({
                content: `🔗 בחרת את LID: \`${selectedLid}\`.\nלאיזה משתמש דיסקורד לשייך אותו?`,
                components: [userSelectRow]
            });
        }

        else if (i.customId === 'mng_select_discord_user') {
            const targetUserId = i.values[0];

            if (!selectedLid) return; // הגנה

            // ביצוע הקישור
            const result = await matchmaker.linkUser(targetUserId, selectedLid);

            if (!result.success) {
                await i.update({ content: `❌ שגיאה: ${result.error}`, components: [] });
                collector.stop();
                return;
            }

            // תרחיש א': הצלחה מלאה
            if (result.status === 'complete') {
                await i.update({
                    content: `✅ **קישור בוצע בהצלחה!**\n<@${targetUserId}> חובר ל-LID.\n📱 טלפון מזוהה: ${result.phone}.`,
                    components: []
                });
                collector.stop();
            }
            // תרחיש ב': חסר טלפון - מודאל
            else if (result.status === 'needs_phone') {
                const modal = new ModalBuilder()
                    .setCustomId(`mng_phone_modal_${targetUserId}`)
                    .setTitle('הוספת מספר טלפון');

                const phoneInput = new TextInputBuilder()
                    .setCustomId('phone_number')
                    .setLabel("מספר טלפון (05X-XXXXXXX)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('0541234567');

                modal.addComponents(new ActionRowBuilder().addComponents(phoneInput));

                await i.showModal(modal);
                // המשך הטיפול במודאל מתבצע ע"י המתנה לאירוע כאן או ב-handler גלובלי
                try {
                    const submitted = await i.awaitModalSubmit({ time: 60000, filter: m => m.customId === `mng_phone_modal_${targetUserId}` });
                    const phone = submitted.fields.getTextInputValue('phone_number');
                    const updateRes = await matchmaker.updateUserPhone(targetUserId, phone);

                    if (updateRes.success) {
                        await submitted.reply({ content: `✅ **עודכן!**\n<@${targetUserId}> קושר וטלפון עודכן: ${updateRes.phone}.`, ephemeral: true });
                    } else {
                        await submitted.reply({ content: `⚠️ שגיאה בעדכון טלפון: ${updateRes.error}`, ephemeral: true });
                    }
                } catch (e) { console.log('Modal timeout'); }

                collector.stop();
            }
        }
    });
}

async function handleDebugWa(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const contacts = store.contacts;
        const sock = getWhatsAppSock();

        let report = `=== WhatsApp Debug Report ===\n`;
        report += `Time: ${new Date().toISOString()}\n`;
        report += `Connection Status: ${sock ? 'Connected 🟢' : 'Disconnected 🔴'}\n`;
        report += `Contacts in Memory: ${Object.keys(contacts).length}\n\n`;

        report += `=== ORPHANS (Waiting for Link) ===\n`;
        const orphans = await matchmaker.getOrphans();
        orphans.forEach(o => {
            report += `LID: ${o.lid} | Name: ${o.name} | Msg: ${o.lastMsg}\n`;
        });
        report += `\n`;

        report += `=== CONTACTS DUMP ===\n`;
        let mappedCount = 0;
        for (const [id, data] of Object.entries(contacts)) {
            if (data.lid || (data.id && data.id.includes('@'))) {
                const name = data.name || data.notify || data.verifiedName || "Unknown";
                const lid = data.lid || "No-LID";
                const jid = data.id || "No-JID";

                report += `Name: ${name}\nJID: ${jid}\nLID: ${lid}\n---\n`;
                mappedCount++;
            }
        }

        if (mappedCount === 0) report += "[!] Store appears empty.\n";

        const buffer = Buffer.from(report, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: 'wa_debug.txt' });

        await interaction.editReply({
            content: `📊 **דוח דיבוג מערכת**`,
            files: [attachment]
        });

    } catch (error) {
        console.error(error);
        await interaction.editReply(`❌ שגיאה: ${error.message}`);
    }
}