// 📁 handlers/users/verification.js
const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../../utils/firebase');
const { log, logRoleChange } = require('../../utils/logger'); // הוספתי logRoleChange למקרה הצורך
const brain = require('../ai/brain'); 

class VerificationHandler {

    /**
     * בדיקה מקדימה: האם להציג מודאל או לאמת מיד?
     */
    async showVerificationModal(interaction) {
        const userId = interaction.user.id;
        const currentName = interaction.member.displayName || interaction.user.username;
        
        try {
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.exists ? userDoc.data() : null;

            const hasPhone = userData?.identity?.whatsappPhone || userData?.whatsappPhone;
            const hasBirthday = userData?.identity?.birthday || userData?.birthday;

            // אימות שקט אם המידע קיים
            if (userData && hasPhone && hasBirthday) {
                await interaction.deferReply({ ephemeral: true });
                const result = await this.verifyUser(interaction.member, {}, 'smart_check');
                
                await interaction.editReply({ 
                    content: `👋 היי **${currentName}**!\nאני רואה שכל הפרטים שלך כבר מעודכנים אצלי.\n\n${result.message}` 
                });
                return;
            }

            await this.openModal(interaction);

        } catch (error) {
            console.error('Smart Verify Error:', error);
            await this.openModal(interaction);
        }
    }

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

        modal.addComponents(
            new ActionRowBuilder().addComponents(bdayInput),
            new ActionRowBuilder().addComponents(phoneInput),
            new ActionRowBuilder().addComponents(platformInput)
        );
        
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

    /**
     * הפונקציה הראשית - כאן בוצע התיקון ל-DB
     */
    async verifyUser(member, data = {}, source = 'command') {
        try {
            const userId = member.id;
            const guild = member.guild;
            const currentDisplayName = member.displayName;

            log(`[Verification] 🛡️ מתחיל תהליך אימות עבור ${currentDisplayName} (${userId}) דרך ${source}...`);

            // --- ✅ תיקון קריטי: מבנה אובייקט מקונן (Nested Object) ---
            // זה מונע את יצירת השדות עם הנקודות ('identity.name')
            
            const updates = {
                identity: {
                    discordId: userId,
                    displayName: currentDisplayName,
                    fullName: member.user.username,
                    isBot: member.user.bot,
                    avatarURL: member.user.displayAvatarURL()
                },
                meta: {
                    isVerified: true,
                    verifiedAt: new Date().toISOString(),
                    verificationSource: source,
                    lastSeen: new Date().toISOString()
                }
            };

            // הוספת שדות אופציונליים רק אם קיימים
            if (data.phone) updates.identity.whatsappPhone = data.phone; 
            if (data.bday) {
                // מנסה לפרק תאריך אם הגיע בפורמט טקסט
                const parts = data.bday.split('/');
                if (parts.length === 2) {
                    updates.identity.birthday = { 
                        day: parseInt(parts[0]), 
                        month: parseInt(parts[1]) 
                    };
                } else {
                    updates.identity.birthdayString = data.bday; // גיבוי
                }
            }
            if (data.platform) {
                updates.gaming = { primaryPlatform: data.platform };
            }

            // שמירה בטוחה
            await db.collection('users').doc(userId).set(updates, { merge: true });
            
            // --- סוף תיקון DB ---

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

            // 3. שליחת DM עם המוח של שמעון
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
            let prompt = `המשתמש ${member.displayName} סיים אימות בדיסקורד. `;
            
            if (!data.phone && !data.bday) {
                prompt += "הוא בחר לא למלא פרטים נוספים (טלפון/יומולדת). תברך אותו קצר ותציע לו בעדינות לעדכן בהמשך אם ירצה.";
            } else {
                prompt += "הוא מילא את כל הפרטים כמו מלך. תודה לו בחום.";
            }

            const aiResponse = await brain.ask(member.id, 'discord', prompt);
            await member.send(aiResponse).catch(() => {});
        } catch (e) { console.error('AI DM Error:', e); }
    }
}

module.exports = new VerificationHandler();