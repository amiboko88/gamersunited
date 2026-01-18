const { log } = require('../../utils/logger');
const { sendDirectMessage } = require('../../whatsapp/index');

// ניהול מצבי שיחה בזכרון (Memory Store)
// במערכת גדולה יותר נשתמש ב-Redis/Firestore, כאן זה מספיק
const userStates = new Map();

// מצבים
const STATES = {
    IDLE: 'IDLE',
    WAITING_FOR_NAME: 'WAITING_FOR_NAME',
    WAITING_FOR_DISCORD_TAG: 'WAITING_FOR_DISCORD_TAG'
};

const ADMIN_PHONE = '0526800647';

async function handleSyncCommand(ctx) {
    const userId = ctx.from.id.toString();
    const name = ctx.from.first_name;

    log(`[Telegram Flow] ${name} התחיל תהליך סנכרון.`);

    userStates.set(userId, { state: STATES.WAITING_FOR_NAME, step: 1 });

    await ctx.reply(`אהלן ${name}! 👋\nאני שמעון, הבוט של GamersUnited.\n\nכדי שאוכל לחבר אותך לדיסקורד ולעדכן לך דרגות, אני צריך לזהות אותך.\n\n**איך קוראים לך בדיסקורד?** (שם משתמש או כינוי בשרת)`);
}

async function handleMessage(ctx) {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    if (!userStates.has(userId)) return false; // לא בתהליך

    const session = userStates.get(userId);

    if (session.state === STATES.WAITING_FOR_NAME) {
        session.discordName = text;
        session.state = STATES.WAITING_FOR_DISCORD_TAG; // או סיום

        await ctx.reply(`תודה! ומה המספר טלפון שלך? (אופציונלי - עוזר לזיהוי בוואטסאפ)\nאם לא בא לך, כתוב "דלג".`);
        return true;
    }

    if (session.state === STATES.WAITING_FOR_DISCORD_TAG) {
        session.phone = text === "דלג" ? "לא צויין" : text;

        // סיום התהליך
        await ctx.reply(`קיבלתי! ✅\nשולח את הפרטים למנהל לאישור ידני. ברגע שיאושר תקבל התראה.\n\nתודה רבה! 🙏`);

        // ניקוי סטייט
        userStates.delete(userId);

        // דיווח למנהל
        notifyAdmin(ctx.from, session.discordName, session.phone);
        return true;
    }

    return false;
}

async function notifyAdmin(tgUser, discordName, phone) {
    const report = `🔔 *בקשת סנכרון חדשה מטלגרם*\n\n` +
        `👤 *שם בטלגרם:* ${tgUser.first_name} ${tgUser.last_name || ''}\n` +
        `🆔 *TG ID:* ${tgUser.id}\n` +
        `🎮 *שם בדיסקורד:* ${discordName}\n` +
        `📱 *טלפון:* ${phone}\n\n` +
        `יש להיכנס לדשבורד בדיסקורד -> ניהול -> טלגרם כדי לאשר את החיבור.`;

    await sendDirectMessage(ADMIN_PHONE, report);
}

module.exports = { handleSyncCommand, handleMessage };
