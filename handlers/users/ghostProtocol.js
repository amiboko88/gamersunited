const admin = require('firebase-admin');
const db = admin.firestore();
const bountyCard = require('../graphics/bountyCard');
const { log } = require('../../utils/logger');
const config = require('../ai/config');

const COLLECTION = 'bounties';
const METADATA_DOC = 'current_hunt';
const HUNT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 Hours
const COOLDOWN_DAYS = 30; // Don't hunt the same ghost for 30 days

class GhostProtocol {

    constructor() {
        this.client = null; // WhatsApp Client
        this.discordClient = null;
        this.mainGroupId = process.env.WHATSAPP_MAIN_GROUP_ID;
    }

    init(discordClient, whatsappSock) {
        this.discordClient = discordClient;
        this.client = whatsappSock;
    }

    /**
     * 🟢 מתחיל ציד חדש (נקרא ע"י Cron)
     */
    async startHunt() {
        if (!this.client || !this.mainGroupId) {
            log('❌ [GhostProtocol] WhatsApp Client not ready.');
            return;
        }

        try {
            // 1. בדיקה אם כבר יש ציד פעיל
            const statusDoc = await db.collection(COLLECTION).doc(METADATA_DOC).get();
            if (statusDoc.exists && statusDoc.data().status === 'active') {
                const startTime = statusDoc.data().startTime.toDate().getTime();
                if (Date.now() - startTime < HUNT_DURATION_MS) {
                    log('⚠️ [GhostProtocol] Hunt already in progress.');
                    return; // עדיין רץ
                } else {
                    await this.endHunt(); // הסתיים בזמן שהמערכת הייתה למטה? נסיים אותו.
                }
            }

            // 2. מציאת רוח רפאים
            const ghost = await this.findNextGhost();
            if (!ghost) {
                log('✅ [GhostProtocol] No eligible ghosts found.');
                return;
            }

            // 3. אימות ושליפת תמונה עדכנית מדיסקורד
            // (אם ה-URL ב-DB ישן, התמונה תהיה שבורה. חייבים Fetch טרי)
            let freshUser = null;
            let avatarUrl = 'https://i.imgur.com/XF8h7gV.png'; // ברירת מחדל

            try {
                freshUser = await this.discordClient.users.fetch(ghost.id);
                avatarUrl = freshUser.displayAvatarURL({ extension: 'png', size: 512 });
            } catch (err) {
                log(`⚠️ [GhostProtocol] Failed to fetch Discord user ${ghost.id}. Using DB/Default avatar.`);
                // Fallback 1: WhatsApp Avatar (from PFP Sync)
                if (ghost.identity?.avatar_whatsapp) {
                    avatarUrl = ghost.identity.avatar_whatsapp;
                    log(`✅ [GhostProtocol] Using WhatsApp PFP for ${ghost.username}`);
                }
                // Fallback 2: General Avatar URL
                else if (ghost.avatarUrl) avatarUrl = ghost.avatarUrl;
            }

            // Enhanced Check: If Discord returns default avatar, but we have a WhatsApp one, PREFER WhatsApp.
            // (Ghost users often have default Discord avatars)
            if (avatarUrl.includes('embed/avatars') && ghost.identity?.avatar_whatsapp) {
                avatarUrl = ghost.identity.avatar_whatsapp;
                log(`✅ [GhostProtocol] Overriding default Discord avatar with WhatsApp PFP for ${ghost.username}`);
            }

            // יצירת הפוסטר עם התמונה המאומתת
            const posterBuffer = await bountyCard.generateCard(ghost.username, avatarUrl, 1000);

            // 4. שמירת מצב הציד
            await db.collection(COLLECTION).doc(METADATA_DOC).set({
                status: 'active',
                target: {
                    id: ghost.id, // Discord ID
                    phone: ghost.mobile, // Target Phone (Critical for detection)
                    username: ghost.username
                },
                startTime: admin.firestore.FieldValue.serverTimestamp(),
                participants: {}, // מעקב אחרי הודעות משתמשים: { lid: count }
                messageCount: 0
            });

            // 5. סימון המשתמש שניצוד (כדי שלא נחפור לו שוב בקרוב)
            await db.collection('users').doc(ghost.id).update({
                'meta.lastHunted': admin.firestore.FieldValue.serverTimestamp()
            });

            // 6. שליחת ההודעה לקבוצה
            const caption =
                `🚨 **המבוקש המסתורי** 🚨

חברים, יש פה חפרפרת.
הבחור הזה (${ghost.username}) נמצא אצלנו ברשימות, קיים במערכת... אבל בוואטסאפ? גופה. 👻

הוא קורא הכל ולא מגיב. יושב בצללים.
הגיע הזמן להוציא אותו לאור.

💰 **הפרס:** ₪1000 (במשחק) לראשון שגורם לו לכתוב הודעה בקבוצה!
מכירים אותו? תייגו, תתקשרו, תצעקו מתחת לבית.

יש לכם 3 שעות מעכשיו. צא החוצה יא פחדן! ⏳`;

            if (this.client) {
                await this.client.sendMessage(this.mainGroupId, {
                    image: posterBuffer,
                    caption: caption
                });
            }

            log(`👻 [GhostProtocol] Started hunt on ${ghost.username}`);

            // תזמון סיום בעוד 3 שעות
            setTimeout(() => this.endHunt(), HUNT_DURATION_MS);

        } catch (error) {
            log(`❌ [GhostProtocol] Start Error: ${error.message}`);
        }
    }

    /**
     * 📩 מאזין לכל הודעה בקבוצה (נקרא מ-index.js)
     */
    async onGroupMessage(msg) {
        // בדיקה מהירה בזיכרון אם יש ציד פעיל כדי לא להכביד על ה-DB כל הודעה
        // (בפרודקשן עדיף מטמון, כאן נקרא ל-DB עבור הדיוק)
        const statusDoc = await db.collection(COLLECTION).doc(METADATA_DOC).get();
        if (!statusDoc.exists || statusDoc.data().status !== 'active') return;

        const data = statusDoc.data();
        const senderId = msg.key.participant || msg.key.remoteJid;

        // נירמול מספר טלפון להשוואה
        const senderPhone = senderId.split('@')[0];
        const targetPhone = data.target.phone.replace(/[^0-9]/g, '');

        // 1. האם המבוקש דיבר??
        if (senderPhone.includes(targetPhone) || targetPhone.includes(senderPhone)) {
            await this.handleGhostCapture(senderId, data);
            return;
        }

        // 2. עדכון מונה משתתפים (Hunters)
        const participants = data.participants || {};
        participants[senderId] = (participants[senderId] || 0) + 1;

        await db.collection(COLLECTION).doc(METADATA_DOC).update({
            participants: participants,
            messageCount: admin.firestore.FieldValue.increment(1)
        });
    }

    /**
     * 🏆 המבוקש נתפס!
     */
    async handleGhostCapture(ghostLid, matchData) {
        log(`👻 [GhostProtocol] GHOST CAPTURED! LID: ${ghostLid}`);

        // מציאת הצייד המוביל (מי חפר הכי הרבה לפני שהרוח יצאה?)
        const participants = matchData.participants || {};
        let topHunter = null;
        let maxMsgs = 0;

        for (const [lid, count] of Object.entries(participants)) {
            if (count > maxMsgs) {
                maxMsgs = count;
                topHunter = lid;
            }
        }

        // חיבור ל-Brain לתגובה חכמה
        const brain = require('../ai/brain');
        const response = await brain.generateInternal(`
        SYSTEM: You are Shimon. The "Ghost Hunt" was a SUCCESS.
        The target "${matchData.target.username}" finally spoke in the WhatsApp group!
        The top hunter who pressured them was phone number ending in ${topHunter ? topHunter.slice(-4) : 'UNKNOWN'}.
        
        TASK: Write a celebration message.
        - Mock the ghost for finally waking up.
        - Praise the hunters.
        - Announce the 1000 Shekel prize.
        - Be toxic/funny. Hebrew only.
        `);

        if (this.client) {
            await this.client.sendMessage(this.mainGroupId, { text: `🚨 **הרוח נתפסה!** 🚨\n\n${response}` });
        }

        // סיום הציד
        await db.collection(COLLECTION).doc(METADATA_DOC).update({ status: 'captured', endTime: admin.firestore.FieldValue.serverTimestamp() });

        // עדכון LID למשתמש במסד! (הערך המוסף האמיתי)
        await db.collection('users').doc(matchData.target.id).update({
            lid: ghostLid // שיוך אוטומטי!
        });
    }

    /**
     * 🛑 סיום הציד (Timeout)
     */
    async endHunt() {
        const statusDoc = await db.collection(COLLECTION).doc(METADATA_DOC).get();
        if (!statusDoc.exists || statusDoc.data().status !== 'active') return;

        const data = statusDoc.data();
        const totalMsgs = data.messageCount || 0;

        const brain = require('../ai/brain');
        let prompt = "";

        if (totalMsgs > 10) {
            // הייתה פעילות, אבל הרוח לא יצאה
            // נותנים פרס למשתתף הכי פעיל
            const participants = data.participants || {};
            let topHunter = null;
            let maxMsgs = 0;
            for (const [lid, count] of Object.entries(participants)) {
                if (count > maxMsgs) { maxMsgs = count; topHunter = lid; }
            }

            prompt = `
            SYSTEM: The Ghost Hunt ended efficiently but FAILED to catch the ghost "${data.target.username}".
            However, the group was active (${totalMsgs} messages).
            Top contributor was phone ending in ${topHunter ? topHunter.slice(-4) : '...'}.
            
            TASK: Write a summary.
            - Mock the ghost for being a coward/dead.
            - Praise the group for trying.
            - Award 500 Shekels to the top contributor for effort.
            `;
        } else {
            // שקט מוחלט (בית קברות)
            prompt = `
            SYSTEM: The Ghost Hunt FAILED miserably.
            Target "${data.target.username}" ignored us.
            The group was SILENT (Dead).
            
            TASK: Write a disappointed, toxic rant.
            - Call them all NPCs / Corpses.
            - Say you are closing the shop for today.
            `;
        }

        const response = await brain.generateInternal(prompt + "\nLanguage: Hebrew. Tone: Toxic Shimon.");

        if (this.client) {
            await this.client.sendMessage(this.mainGroupId, { text: response });
        }

        await db.collection(COLLECTION).doc(METADATA_DOC).update({ status: 'timeout', endTime: admin.firestore.FieldValue.serverTimestamp() });
    }

    async findNextGhost() {
        // שליפה חכמה: יש טלפון, אין LID, ולא ניצוד לאחרונה
        const snapshot = await db.collection('users')
            .where('mobile', '!=', null)
            .get();

        const candidates = [];
        const now = Date.now();

        snapshot.forEach(doc => {
            const d = doc.data();
            // Critical Check: Phone Exists AND LID Missing
            if (d.mobile && (!d.lid || d.lid.length < 5)) {
                // בדיקת Cooldown
                if (d.meta?.lastHunted) {
                    const lastHunted = d.meta.lastHunted.toDate().getTime();
                    if ((now - lastHunted) < (COOLDOWN_DAYS * 24 * 60 * 60 * 1000)) return;
                }
                candidates.push({ id: doc.id, ...d });
            }
        });

        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}

module.exports = new GhostProtocol();
