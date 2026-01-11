// 📁 discord/commands/debug_wa.js
const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const store = require('../../whatsapp/store'); // ה-Store הידני שלנו
const waIndex = require('../../whatsapp/index'); // כדי לקבל את הסוקט

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug_wa')
        .setDescription('🛠️ כלי דיבוג לוואטסאפ (Store & Socket)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const contacts = store.contacts;
            const sock = waIndex.getWhatsAppSock();
            
            // בניית דוח סטטוס
            let report = `=== WhatsApp Debug Report ===\n`;
            report += `Time: ${new Date().toISOString()}\n`;
            report += `Connection Status: ${sock ? 'Connected 🟢' : 'Disconnected 🔴'}\n`;
            report += `Total Contacts in Store: ${Object.keys(contacts).length}\n\n`;

            report += `=== CONTACTS DUMP (LID -> JID) ===\n`;
            
            let mappedCount = 0;
            for (const [id, data] of Object.entries(contacts)) {
                // מציג רק אנשי קשר מעניינים (שיש להם גם LID וגם מספר)
                if (data.lid || (data.id && data.id.includes('@'))) {
                    const name = data.name || data.notify || data.verifiedName || "Unknown";
                    const lid = data.lid || "No-LID";
                    const jid = data.id || "No-JID"; // המספר האמיתי
                    
                    report += `Name: ${name}\n`;
                    report += `JID (Phone): ${jid}\n`;
                    report += `LID (Key):  ${lid}\n`;
                    report += `----------------------------\n`;
                    mappedCount++;
                }
            }

            if (mappedCount === 0) {
                report += "\n[!] ה-Store ריק או לא מכיל מיפויים עדיין. נסה לשלוח הודעה בוואטסאפ כדי לעורר אותו.";
            }

            const buffer = Buffer.from(report, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: 'wa_debug_report.txt' });

            await interaction.editReply({ 
                content: `📊 דוח דיבוג וואטסאפ מוכן.\nנמצאו ${Object.keys(contacts).length} רשומות בזיכרון.`, 
                files: [attachment] 
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ שגיאה בהפקת דוח: ${error.message}`);
        }
    }
};