// 📁 handlers/economy/gameManager.js

const { getSocket } = require('../../whatsapp/socket');
const graphics = require('../graphics/index'); // ✅ ייבוא המערכת הגרפית המודולרית
const { getUserRef } = require('../../utils/userUtils');
const admin = require('firebase-admin');
const db = admin.firestore();
const { economy } = require('../../config/settings');

class GameManager {
    constructor() {
        this.currentMatch = {
            active: false,
            p1: null,
            p2: null,
            pot: 0,
            bets: [],
            chatId: null
        };

        // טעינת מצב שמור אם קיים
        this.loadState();
    }

    async loadState() {
        try {
            const doc = await db.collection('system_metadata').doc('economy').get();
            if (doc.exists && doc.data().currentMatch?.active) {
                this.currentMatch = doc.data().currentMatch;
                console.log('🔄 [GameManager] שוחזר משחק פעיל מ-DB');
            }
        } catch (e) {
            console.error('Failed to load game state:', e);
        }
    }

    async saveState() {
        try {
            await db.collection('system_metadata').doc('economy').set({
                currentMatch: this.currentMatch,
                lastUpdate: new Date().toISOString()
            }, { merge: true });
        } catch (e) {
            console.error('Failed to save game state:', e);
        }
    }

    async checkAvailability(p1Name, p2Name) {
        // ✅ Lazy Load כדי למנוע מעגל: Brain -> Match -> GameManager -> Discord -> Brain
        const { client } = require('../../discord/index');

        if (!client) return { available: false, reason: "Discord Disconnected" };

        const guild = client.guilds.cache.first();
        if (!guild) return { available: false, reason: "Guild Not Found" };

        const members = await guild.members.fetch();
        const member1 = members.find(m => m.displayName.toLowerCase().includes(p1Name.toLowerCase()));
        const member2 = members.find(m => m.displayName.toLowerCase().includes(p2Name.toLowerCase()));

        if (!member1 || !member2) return { available: false, reason: "שחקנים לא נמצאו בדיסקורד." };

        const isOnline1 = member1.voice.channelId;
        const isOnline2 = member2.voice.channelId;

        if (!isOnline1 || !isOnline2) {
            return { available: false, reason: "OFFLINE", p1: member1, p2: member2 };
        }

        return { available: true, p1: member1, p2: member2 };
    }

    async startMatch(p1Name, p2Name, chatId) {
        if (this.currentMatch.active) return "יש כבר משחק פעיל! תסיימו אותו קודם.";

        const check = await this.checkAvailability(p1Name, p2Name);

        if (!check.available) {
            // אם הם קיימים בדיסקורד אך לא מחוברים, ננסה למצוא את הטלפון שלהם לתיוג
            let p1Info = p1Name;
            let p2Info = p2Name;

            if (check.p1) {
                const phone1 = await this.getPhoneByDiscordId(check.p1.id);
                p1Info = phone1 ? `@${phone1}` : check.p1.displayName;
            }
            if (check.p2) {
                const phone2 = await this.getPhoneByDiscordId(check.p2.id);
                p2Info = phone2 ? `@${phone2}` : check.p2.displayName;
            }

            return `STATUS: PROMOTER_MODE. Reason: ${check.reason}. Targets: ${p1Info} vs ${p2Info}. Instruct the AI to tag them using these numbers.`;
        }

        this.currentMatch = {
            active: true,
            p1: { name: check.p1.displayName, id: check.p1.id, score: 0, avatar: check.p1.user.displayAvatarURL({ extension: 'png' }) },
            p2: { name: check.p2.displayName, id: check.p2.id, score: 0, avatar: check.p2.user.displayAvatarURL({ extension: 'png' }) },
            pot: 0,
            bets: [],
            chatId: chatId,
            messageId: null,
            startTime: Date.now()
        };

        await this.saveState(); // שמירה ל-DB
        await this.updateMatchCard();
        await this.broadcastUpdate("🔥 המשחק התחיל! ההימורים פתוחים 🔥");
        return "MATCH_STARTED";
    }

    async updateScore(targetPlayerName, increment) {
        if (!this.currentMatch.active) return "אין משחק פעיל.";

        let updated = false;
        if (this.currentMatch.p1.name.toLowerCase().includes(targetPlayerName.toLowerCase())) {
            this.currentMatch.p1.score += increment;
            updated = true;
        } else if (this.currentMatch.p2.name.toLowerCase().includes(targetPlayerName.toLowerCase())) {
            this.currentMatch.p2.score += increment;
            updated = true;
        }

        if (updated) {
            await this.broadcastUpdate(`עדכון סקור!`);
            return `Score Updated. ${this.currentMatch.p1.name}: ${this.currentMatch.p1.score} - ${this.currentMatch.p2.name}: ${this.currentMatch.p2.score}`;
        }
        return "לא זיהיתי את השחקן.";
    }

    async placeBet(userId, amount, onWho) {
        if (!this.currentMatch.active) return "אין משחק פעיל.";
        if (amount <= 0) return "סכום לא חוקי.";

        const userRef = await getUserRef(userId, 'whatsapp');
        const doc = await userRef.get();
        const balance = doc.data()?.economy?.balance || 0;

        if (balance < amount) return `אין לך מספיק כסף. יש לך רק ₪${balance}`;

        await userRef.update({ 'economy.balance': admin.firestore.FieldValue.increment(-amount) });

        this.currentMatch.pot += amount;
        this.currentMatch.bets.push({ userId, amount, onWho });

        if (amount >= economy.bigBetThreshold) await this.broadcastUpdate(`💰 הימור כבד! מישהו שם ${amount} על ${onWho}`);

        return "Bet Accepted";
    }

    async endMatch(winnerName) {
        if (!this.currentMatch.active) return "אין משחק.";

        let winnerSide = null;
        if (this.currentMatch.p1.name.toLowerCase().includes(winnerName.toLowerCase())) winnerSide = this.currentMatch.p1.name;
        if (this.currentMatch.p2.name.toLowerCase().includes(winnerName.toLowerCase())) winnerSide = this.currentMatch.p2.name;

        if (!winnerSide) return "לא זיהיתי את המנצח בשמות השחקנים.";

        const winningBets = this.currentMatch.bets.filter(b => winnerSide.toLowerCase().includes(b.onWho.toLowerCase()));
        const totalWinningAmount = winningBets.reduce((sum, b) => sum + b.amount, 0);

        if (totalWinningAmount > 0) {
            for (const bet of winningBets) {
                const share = bet.amount / totalWinningAmount;
                const prize = Math.floor(this.currentMatch.pot * share);

                const ref = await getUserRef(bet.userId, 'whatsapp');
                await ref.update({
                    'economy.balance': admin.firestore.FieldValue.increment(prize),
                    'stats.casinoWins': admin.firestore.FieldValue.increment(1)
                });
            }
        }

        await this.broadcastUpdate(`🏁 המשחק נגמר! המנצח: ${winnerSide} (קופה חולקה)`);
        this.currentMatch.active = false;
        await this.saveState(); // שמירה (כדי לסמן שנגמר)
        return `Game Over. Winner: ${winnerSide}. Pot Distributed.`;
    }

    async getPhoneByDiscordId(discordId) {
        try {
            const snapshot = await db.collection('users').where('discord.id', '==', discordId).limit(1).get();
            if (snapshot.empty) return null;
            return snapshot.docs[0].id; // ה-ID של המסמך הוא מספר הטלפון
        } catch (e) {
            return null;
        }
    }

    async broadcastUpdate(caption) {
        const sock = getSocket();
        if (!sock || !this.currentMatch.chatId) return;

        // ✅ שימוש במערכת המודולרית החדשה
        const buffer = await graphics.match.generateCard(
            this.currentMatch.p1.name, this.currentMatch.p1.score,
            this.currentMatch.p2.name, this.currentMatch.p2.score,
            this.currentMatch.pot,
            "LIVE MATCH",
            this.currentMatch.p1.avatar,
            this.currentMatch.p2.avatar
        );

        if (buffer) {
            await sock.sendMessage(this.currentMatch.chatId, { image: buffer, caption: caption });
        }
    }
}

module.exports = new GameManager();