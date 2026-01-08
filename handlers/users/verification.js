// 📁 handlers/users/verification.js
const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const brain = require('../ai/brain'); 

class VerificationHandler {

    /**
     * בדיקה מקדימה: האם להציג מודאל או לאמת מיד?
     */
    async showVerificationModal(interaction) {
        const userId = interaction.user.id;
        // לוקחים את השם הכי עדכני מהדיסקורד עצמו כדי לא להגיד "Unknown"
        const currentName = interaction.member.displayName || interaction.user.username;
        
        try {
            // שליפת המשתמש מה-DB
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.exists ? userDoc.data() : null;

            // בדיקה אם המידע הקריטי כבר קיים
            // אנחנו בודקים גם בתוך identity וגם בשורש למקרה של מידע ישן
            const hasPhone = userData?.identity?.whatsappPhone || userData?.whatsappPhone;
            const hasBirthday = userData?.identity?.birthday || userData?.birthday;

            // תרחיש: המשתמש כבר מוכר ומלא בפרטים -> אימות מיידי ללא מודאל
            if (userData && hasPhone && hasBirthday) {
                await interaction.deferReply({ ephemeral: true });
                
                // הרצת אימות "שקט" כדי לוודא רולים וסטטוס + תיקון השם ב-DB אם היה Unknown
                const result = await this.verifyUser(interaction.member, {}, 'smart_check');
                
                // הודעה מותאמת אישית עם השם האמיתי
                await interaction.editReply({ 
                    content: `👋 היי **${currentName}**!\nאני רואה שכל הפרטים שלך כבר מעודכנים אצלי.\n\n${result.message}` 
                });
                return;
            }

            // תרחיש רגיל: חסרים פרטים -> פתיחת מודאל
            await this.openModal(interaction);

        } catch (error) {
            console.error('Smart Verify Error:', error);
            // במקרה של שגיאה בבדיקה, נפתח את המודאל כגיבוי
            await this.openModal(interaction);
        }
    }

    /**
     * בניית והצגת המודאל (פונקציית עזר פנימית)
     */
    async openModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('verification_modal_submit')
            .setTitle('אימות משתמש - פרטים נוספים');

        const bdayInput = new TextInputBuilder()
            .setCustomId('verify_bday')
            .setLabel('תאריך יום הולדת (DD/MM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('לדוגמה: 15/04')
            .setRequired(false)
            .setMaxLength(5);

        const phoneInput = new TextInputBuilder()
            .setCustomId('verify_phone')
            .setLabel('מספר טלפון (לחיבור וואטסאפ)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('05X-XXXXXXX')
            .setRequired(false)
            .setMaxLength(15);

        const platformInput = new TextInputBuilder()
            .setCustomId('verify_platform')
            .setLabel('פלטפורמת משחק עיקרית')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('PC / Xbox / PS5')
            .setRequired(false)
            .setMaxLength(20);

        const row1 = new ActionRowBuilder().addComponents(bdayInput);
        const row2 = new ActionRowBuilder().addComponents(phoneInput);
        const row3 = new ActionRowBuilder().addComponents(platformInput);

        modal.addComponents(row1, row2, row3);
        await interaction.showModal(modal);
    }

    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const bday = interaction.fields.getTextInputValue('verify_bday');
        const phone = interaction.fields.getTextInputValue('verify_phone');
        const platform = interaction.fields.getTextInputValue('verify_platform');

        const result = await this.verifyUser(interaction.member, { bday, phone, platform }, 'modal_form');
        await interaction.editReply({ content: result.message });
    }

    async verifyUser(member, data = {}, source = 'command') {
        try {
            const userId = member.id;
            const guild = member.guild;
            // שימוש בשם התצוגה הנוכחי ללוג ול-DB
            const currentDisplayName = member.displayName;

            log(`[Verification] 🛡️ מתחיל תהליך אימות עבור ${currentDisplayName} (${userId}) דרך ${source}...`);

            // 1. הכנת המידע ל-DB
            // אנחנו דורסים את ה-displayName עם השם הנוכחי כדי להעיף את ה-Unknown
            const updates = {
                'identity.discordId': userId,
                'identity.displayName': currentDisplayName, 
                'identity.fullName': member.user.username,
                'meta.isVerified': true,
                'meta.verifiedAt': new Date().toISOString(),
                'meta.verificationSource': source
            };

            if (data.phone) updates['identity.whatsappPhone'] = data.phone; 
            if (data.bday) updates['identity.birthday'] = data.bday;
            if (data.platform) updates['gaming.primaryPlatform'] = data.platform;

            await db.collection('users').doc(userId).set(updates, { merge: true });
            
            // 2. טיפול ברול
            let role = null;
            if (process.env.VERIFIED_ROLE_ID) {
                role = guild.roles.cache.get(process.env.VERIFIED_ROLE_ID);
            }
            if (!role) {
                role = guild.roles.cache.find(r => 
                    r.name.toLowerCase() === 'verified' || 
                    r.name.includes('מאומת') || 
                    r.name === 'Member'
                );
            }

            let message = '';
            if (role) {
                if (!member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    log(`[Verification] 👑 רול ${role.name} הוענק ל-${currentDisplayName}.`);
                    message = `✅ **אימות הושלם בהצלחה!**\nקיבלת את הרול: **${role.name}**.`;
                } else {
                    message = `✅ פרטיך עודכנו במערכת (הרול כבר קיים אצלך).`;
                }
            } else {
                message = `✅ פרטיך נקלטו במערכת, אך לא נמצא רול מתאים בשרת.`;
            }

            // 3. שליחת DM
            if (source !== 'smart_check') {
                this.sendWelcomeDM(member, data);
            }

            return { success: true, message };

        } catch (error) {
            log(`[Verification] ❌ שגיאה: ${error.message}`);
            return { success: false, message: '❌ אירעה שגיאה בתהליך האימות.' };
        }
    }

    async sendWelcomeDM(member, data) {
        try {
            let prompt = `המשתמש ${member.displayName} סיים אימות. `;
            
            if (!data.phone && !data.bday) {
                prompt += "הוא לא מילא פרטים (טלפון/יומולדת). תברך אותו ותשאל אם הוא רוצה להשלים אותם.";
            } else {
                prompt += "הוא מילא את הפרטים. תודה לו.";
            }

            const aiResponse = await brain.ask(member.id, 'discord', prompt);
            await member.send(aiResponse).catch(() => {});
        } catch (e) { console.error('AI DM Error:', e); }
    }
}

module.exports = new VerificationHandler();