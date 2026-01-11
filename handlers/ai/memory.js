// 📁 handlers/ai/memory.js
const { log } = require('../../utils/logger');

// מפתח: Platform_UserID, ערך: מערך הודעות
const conversationHistory = new Map();
const MAX_HISTORY = 12; // זוכר 12 הודעות אחרונות
const TTL = 30 * 60 * 1000; // מנקה אחרי 30 דקות

class MemoryManager {
    constructor() {
        setInterval(() => this.cleanup(), TTL);
    }

    getKey(platform, userId) {
        return `${platform}_${userId}`;
    }

    addMessage(platform, userId, role, content) {
        const key = this.getKey(platform, userId);
        if (!conversationHistory.has(key)) {
            conversationHistory.set(key, { msgs: [], time: Date.now() });
        }
        
        const session = conversationHistory.get(key);
        session.msgs.push({ role, content });
        session.time = Date.now();

        if (session.msgs.length > MAX_HISTORY) session.msgs.shift();
    }

    getHistory(platform, userId) {
        const session = conversationHistory.get(this.getKey(platform, userId));
        return session ? session.msgs : [];
    }

    cleanup() {
        const now = Date.now();
        for (const [key, val] of conversationHistory) {
            if (now - val.time > TTL) conversationHistory.delete(key);
        }
    }
}

module.exports = new MemoryManager();