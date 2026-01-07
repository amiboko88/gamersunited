// 📁 handlers/users/verification.js
const { GuildMember, EmbedBuilder } = require('discord.js');
const { ensureUserExists} = require('../../utils/userUtils'); // חיבור ל-DB המאוחד
const { log } = require('../../utils/logger');

// הגדרות רולים (וודא שה-ID נכונים)
const ROLES = {
    VERIFIED: '1133785002220466256', // המאומת
    GUEST: '1133784877209235527'     // האורח (להסרה)
};

/**
 * המערכת המלאה לאימות משתמשים
 * @param {GuildMember} member - אובייקט המשתמש מדיסקורד
 * @param {string} source - המקור שממנו הגיע האימות (פקודה/כפתור/אוטומטי)
 */
async function verifyUser(member, source = 'manual') {
    // 1. בדיקות תקינות בסיסיות
    if (!member || !member.guild) {
        log(`[Verification] ❌ ניסיון אימות נכשל: אובייקט Member לא תקין.`);
        return { success: false, message: '❌ שגיאה פנימית: משתמש לא תקין.' };
    }

    const userId = member.id;
    const displayName = member.displayName;

    log(`[Verification] 🔄 מתחיל תהליך אימות עבור ${displayName} (${userId}) דרך ${source}...`);

    try {
        // 2. וידוא שהבוט יכול לנהל רולים
        const botMember = member.guild.members.me;
        if (!botMember.permissions.has('ManageRoles')) {
            log(`[Verification] ❌ לבוט אין הרשאת ManageRoles!`);
            return { success: false, message: '❌ שגיאת מערכת: לבוט אין הרשאות לניהול רולים.' };
        }

        // 3. בדיקה אם המשתמש כבר מאומת (כדי לא לעשות עבודה כפולה)
        if (member.roles.cache.has(ROLES.VERIFIED)) {
            log(`[Verification] ⚠️ המשתמש ${displayName} כבר מאומת.`);
            // אנחנו עדיין נעדכן את ה-DB ליתר ביטחון, אבל נחזיר הודעה מתאימה
            await ensureUserExists(userId, displayName, 'discord');
            return { success: true, message: '✅ אתה כבר רשום ומאומת במערכת!' };
        }

        // 4. פעולות Database (החלק הכבד)
        // יוצרים/מושכים את המשתמש ומוודאים שהוא מסונכרן
        const userRef = await ensureUserExists(userId, displayName, 'discord');
        
        // עדכון ספציפי של שדה האימות + זמן
        await userRef.set({
            meta: {
                isVerified: true,
                verifiedAt: new Date().toISOString(),
                verificationSource: source
            },
            // מאתחלים נתונים בסיסיים אם חסרים
            economy: { xp: 0, balance: 0 }, 
            stats: { commandsUsed: 0 } 
        }, { merge: true });

        log(`[Verification] ✅ נתוני DB עודכנו עבור ${displayName}.`);

        // 5. ניהול רולים (דיסקורד)
        // הוספת רול המאומת
        const verifiedRole = member.guild.roles.cache.get(ROLES.VERIFIED);
        if (verifiedRole) {
            await member.roles.add(verifiedRole);
            log(`[Verification] ➕ רול ${verifiedRole.name} נוסף.`);
        } else {
            log(`[Verification] ❌ רול VERIFIED לא נמצא בשרת!`);
        }

        // הסרת רול האורח (אם קיים)
        const guestRole = member.guild.roles.cache.get(ROLES.GUEST);
        if (guestRole && member.roles.cache.has(ROLES.GUEST)) {
            await member.roles.remove(guestRole);
            log(`[Verification] ➖ רול ${guestRole.name} הוסר.`);
        }

        // 6. שליחת הודעה פרטית (בונוס)
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('✅ האימות עבר בהצלחה!')
                .setDescription(`ברוך הבא לקהילה, ${displayName}.\nיש לך גישה מלאה לערוצים ולבוט שמעון.`)
                .setColor('Green')
                .setTimestamp();
            
            await member.send({ embeds: [dmEmbed] });
        } catch (dmError) {
            log(`[Verification] ⚠️ לא ניתן לשלוח DM ל-${displayName} (פרטיות חסומה).`);
        }

        log(`[Verification] 🏁 תהליך האימות הושלם בהצלחה עבור ${displayName}.`);
        return { success: true, message: '✅ האימות בוצע בהצלחה! ברוך הבא לקהילה.' };

    } catch (error) {
        console.error(`[Verification] ❌ שגיאה קריטית:`, error);
        return { success: false, message: '❌ אירעה שגיאה בלתי צפויה בעת האימות. נסה שוב מאוחר יותר.' };
    }
}

module.exports = { verifyUser };