// 📁 handlers/users/verification.js
const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const brain = require('../ai/brain'); 

class VerificationHandler {

    /**
     * פתיחת מודאל לאיסוף פרטים (שלב 1)
     */
    async showVerificationModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('verification_modal_submit')
            .setTitle('אימות משתמש - פרטים נוספים');

        const bdayInput = new TextInputBuilder()
            .setCustomId('verify_bday')
            .setLabel('תאריך יום הולדת (DD/MM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('לדוגמה: 15/04')
            .setRequired(false) // אופציונלי
            .setMaxLength(5);

        const phoneInput = new TextInputBuilder()
            .setCustomId('verify_phone')
            .setLabel('מספר טלפון (לחיבור וואטסאפ)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('05X-XXXXXXX')
            .setRequired(false) // אופציונלי
            .setMaxLength(15);

        const platformInput = new TextInputBuilder()
            .setCustomId('verify_platform')
            .setLabel('פלטפורמת משחק עיקרית')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('PC / Xbox / PS5')
            .setRequired(false) // אופציונלי
            .setMaxLength(20);

        const row1 = new ActionRowBuilder().addComponents(bdayInput);
        const row2 = new ActionRowBuilder().addComponents(phoneInput);
        const row3 = new ActionRowBuilder().addComponents(platformInput);

        modal.addComponents(row1, row2, row3);
        await interaction.showModal(modal);
    }

    /**
     * טיפול בנתונים מהמודאל וביצוע האימות (שלב 2)
     */
    async handleModalSubmit(interaction) {
        // מניעת שגיאת "Application did not respond"
        await interaction.deferReply({ ephemeral: true });

        const bday = interaction.fields.getTextInputValue('verify_bday');
        const phone = interaction.fields.getTextInputValue('verify_phone');
        const platform = interaction.fields.getTextInputValue('verify_platform');

        // הרצת האימות בפועל
        const result = await this.verifyUser(interaction.member, { bday, phone, platform }, 'modal_form');
        
        await interaction.editReply({ content: result.message });
    }

    /**
     * הלוגיקה המרכזית של האימות (שימושית גם לקונסולות אוטומטי)
     */
    async verifyUser(member, data = {}, source = 'command') {
        try {
            const userId = member.id;
            const guild = member.guild;

            log(`[Verification] 🛡️ מתחיל תהליך אימות עבור ${member.displayName} (${userId}) דרך ${source}...`);

            // 1. הכנת המידע ל-DB (מבנה מאוחד)
            const updates = {
                'identity.discordId': userId,
                'identity.displayName': member.displayName,
                'identity.fullName': member.user.username, // ברירת מחדל
                'meta.isVerified': true,
                'meta.verifiedAt': new Date().toISOString(),
                'meta.verificationSource': source
            };

            // הוספת שדות אופציונליים רק אם הוזנו (כדי לא לדרוס דברים קיימים עם NULL)
            if (data.phone) updates['identity.whatsappPhone'] = data.phone; 
            if (data.bday) updates['identity.birthday'] = data.bday;
            if (data.platform) updates['gaming.primaryPlatform'] = data.platform;

            // עדכון DB
            await db.collection('users').doc(userId).set(updates, { merge: true });
            log(`[Verification] ✅ נתוני DB עודכנו עבור ${member.displayName}.`);

            // 2. טיפול ברול (מנגנון חכם)
            let role = null;
            
            // נסיון 1: ENV
            if (process.env.VERIFIED_ROLE_ID) {
                role = guild.roles.cache.get(process.env.VERIFIED_ROLE_ID);
            }

            // נסיון 2: חיפוש לפי שם
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
                    log(`[Verification] 👑 רול ${role.name} הוענק ל-${member.displayName}.`);
                    message = `✅ **אימות הושלם בהצלחה!**\nקיבלת את הרול: **${role.name}**.`;
                } else {
                    message = `✅ פרטיך עודכנו במערכת (כבר היית מאומת).`;
                }
            } else {
                log(`[Verification] ⚠️ לא נמצא רול מתאים לחלוקה.`);
                message = `✅ פרטיך נקלטו במערכת, אך לא נמצא רול מתאים בשרת. פנה למנהל.`;
            }

            // 3. שליחת DM חכם (AI Follow-up)
            this.sendWelcomeDM(member, data);

            return { success: true, message };

        } catch (error) {
            log(`[Verification] ❌ שגיאה: ${error.message}`);
            return { success: false, message: '❌ אירעה שגיאה בתהליך האימות.' };
        }
    }

    /**
     * שליחת הודעה פרטית חכמה
     */
    async sendWelcomeDM(member, data) {
        try {
            let prompt = `המשתמש ${member.displayName} הרגע סיים תהליך אימות. `;
            
            if (!data.phone && !data.bday) {
                prompt += "הוא לא מילא את הטלפון ולא את יום ההולדת. תברך אותו על ההצטרפות ותשאל אותו בעדינות אם הוא רוצה לספר לך מתי יום ההולדת שלו כדי שתחגוג לו, ואם בא לו עדכונים לוואטסאפ.";
            } else if (data.phone && !data.bday) {
                prompt += "הוא מילא טלפון אבל לא יום הולדת. תודה לו על הטלפון ותשאל מתי יום ההולדת.";
            } else if (!data.phone && data.bday) {
                prompt += "הוא מילא יום הולדת אבל לא טלפון. תאחל לו מזל טוב מראש ותשאל אם הוא רוצה לחבר את הוואטסאפ.";
            } else {
                prompt += "הוא מילא את כל הפרטים! תודה לו ותגיד לו שהוא אלוף.";
            }

            // יצירת תשובה מהמוח
            const aiResponse = await brain.ask(member.id, 'discord', prompt);
            
            await member.send(aiResponse).catch(() => {
                log(`[Verification] ⚠️ לא ניתן לשלוח DM ל-${member.displayName}.`);
            });

        } catch (e) {
            console.error('AI DM Error:', e);
        }
    }
}

module.exports = new VerificationHandler();