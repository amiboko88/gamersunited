// 📁 handlers/generateHelpImage.js
const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 800;
const PADDING = 60;
const OUTPUT_DIR = path.resolve(__dirname, '..', 'assets');
const FONT_PATH = path.join(OUTPUT_DIR, 'Rubik-Regular.ttf'); // נצטרך להוריד את הפונט הזה

// הגדרות עיצוב
const config = {
    bgColor: '#2C2F33', // רקע כהה
    primaryColor: '#FFFFFF', // טקסט ראשי (לבן)
    secondaryColor: '#B0B8BF', // טקסט משני (אפור בהיר)
    accentColor: '#7289DA', // כותרות (Discord Blurple)
    fontFamily: 'Rubik, Segoe UI, Arial, sans-serif',
    titleSize: 52,
    sectionSize: 36,
    commandSize: 26,
    lineHeight: 1.6
};

// רשימת הפקודות המלאה
const commandSections = {
    user: [
        {
            title: '🎵 פקודות קול ומוזיקה',
            commands: [
                { name: '/שירים', desc: 'מנגן שיר מהמאגר' },
                { name: '/סאונדבורד', desc: 'משמיע סאונד מצחיק בערוץ' },
                { name: '/פיפו', desc: 'מחלק את הערוץ הקולי לקבוצות' },
            ]
        },
        {
            title: '🎂 ימי הולדת וקהילה',
            commands: [
                { name: '/הוסף_יום_הולדת', desc: 'מוסיף את יום ההולדת שלך' },
                { name: '/ימי_הולדת', desc: 'מציג את רשימת החוגגים' },
                { name: '/היום_הולדת_הבא', desc: 'מי החוגג הבא בתור?' },
                { name: '/מצטיין_שבוע', desc: 'מציג את המצטיינים בפעילות' },
            ]
        },
        {
            title: '✅ אימות וכללי',
            commands: [
                { name: '/אימות', desc: 'מאמת אותך בשרת (לחדשים)' },
                { name: '/עזרה', desc: 'מציג את פאנל העזרה הזה' },
            ]
        }
    ],
    admin: [
        {
            title: '👑 פקודות ניהול ראשיות',
            commands: [
                { name: '/ניהול משתמשים', desc: 'פאנל ניהול אי-פעילות' },
                { name: '/בדיקת_חדשים', desc: 'מציג את 10 המצטרפים האחרונים' },
                { name: '/תווים', desc: 'מציג דוח שימוש ב-TTS' },
            ]
        },
        {
            title: '🎙️ פקודות הקלטה ו-TTS',
            commands: [
                { name: '/הקלטה', desc: 'מקליט את הערוץ ל-30 שניות' },
                { name: '/הקלטות', desc: 'פאנל ניהול ההקלטות האישיות' },
                { name: '/tts', desc: 'הכרזת TTS קולית בערוץ (בקרוב)' },
            ]
        },
        {
            title: '🔧 פקודות תשתית',
            commands: [
                { name: '/updaterules', desc: 'עדכון הודעת החוקים' },
                { name: '... (ופקודות נוספות)', desc: 'כמו leaderboard, rulestats וכו\'' },
            ]
        }
    ]
};

// פונקציית עזר לרישום הפונט (חשוב לעברית)
function setupFonts() {
    try {
        if (fs.existsSync(FONT_PATH)) {
            registerFont(FONT_PATH, { family: 'Rubik' });
            log('[Help Image] הפונט Rubik נטען בהצלחה.');
        } else {
            log(`[Help Image] ⚠️ אזהרה: הפונט Rubik לא נמצא בנתיב: ${FONT_PATH}. משתמש בפונט ברירת מחדל.`);
            config.fontFamily = 'Segoe UI, Arial, sans-serif'; // Fallback
        }
    } catch (error) {
        log('❌ [Help Image] שגיאה בטעינת הפונט:', error.message);
        config.fontFamily = 'Segoe UI, Arial, sans-serif'; // Fallback
    }
}

// פונקציית עזר לציור טקסט עם גלישת שורות
function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, currentY);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    context.fillText(line, x, currentY);
    return currentY;
}

/**
 * @param {'user' | 'admin'} type
 */
async function generateHelpImage(type) {
    setupFonts();

    const canvas = createCanvas(IMAGE_WIDTH, IMAGE_HEIGHT);
    const ctx = canvas.getContext('2d');
    
    ctx.direction = 'rtl'; // חשוב מאוד לעברית!

    // 1. צבע רקע
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

    // 2. כותרת ראשית
    const title = type === 'admin' ? '👑 פקודות מנהל' : '👤 פקודות משתמש';
    ctx.font = `bold ${config.titleSize}px ${config.fontFamily}`;
    ctx.fillStyle = config.accentColor;
    ctx.textAlign = 'right';
    ctx.fillText(title, IMAGE_WIDTH - PADDING, PADDING + config.titleSize);

    // 3. ציור הפקודות
    const sections = commandSections[type] || [];
    let currentY = PADDING + config.titleSize + 80; // התחלה מתחת לכותרת
    const startX = IMAGE_WIDTH - PADDING;
    const commandLineHeight = config.commandSize * config.lineHeight;

    for (const section of sections) {
        // כותרת סעיף
        ctx.font = `bold ${config.sectionSize}px ${config.fontFamily}`;
        ctx.fillStyle = config.accentColor;
        ctx.fillText(section.title, startX, currentY);
        currentY += config.sectionSize * config.lineHeight;

        // פקודות בסעיף
        for (const cmd of section.commands) {
            // שם הפקודה
            ctx.font = `bold ${config.commandSize}px ${config.fontFamily}`;
            ctx.fillStyle = config.primaryColor;
            ctx.fillText(cmd.name, startX, currentY);

            // תיאור הפקודה
            ctx.font = `normal ${config.commandSize - 2}px ${config.fontFamily}`;
            ctx.fillStyle = config.secondaryColor;
            
            // צייר את התיאור מתחת לפקודה עם הזחה קלה
            wrapText(ctx, cmd.desc, startX - 20, currentY + commandLineHeight - 15, IMAGE_WIDTH - PADDING * 2, commandLineHeight);

            currentY += commandLineHeight * 1.5; // ריווח בין פקודות
        }
        currentY += 30; // ריווח בין סעיפים
    }

    // 4. שמירת הקובץ
    const outPath = path.join(OUTPUT_DIR, type === 'admin' ? 'help_admin.png' : 'help_user.png');
    const out = fs.createWriteStream(outPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    return new Promise((resolve, reject) => {
        out.on('finish', () => {
            log(`✅ [Help Image] התמונה נוצרה ונשמרה: ${outPath}`);
            resolve(outPath);
        });
        out.on('error', (err) => {
            log(`❌ [Help Image] שגיאה בשמירת התמונה: ${err.message}`);
            reject(err);
        });
    });
}

module.exports = generateHelpImage;