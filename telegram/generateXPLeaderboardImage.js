const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function generateXPLeaderboardImage(users) {
    const now = new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

    // פונקציית עזר להמרת מילישניות לפורמט קריא (שעות, דקות, שניות)
    function formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        const remainingSeconds = seconds % 60;

        let parts = [];
        if (hours > 0) parts.push(`${hours} שעות`);
        if (remainingMinutes > 0) parts.push(`${remainingMinutes} דק'`);
        if (remainingSeconds > 0) parts.push(`${remainingSeconds} שנ'`);

        return parts.length ? parts.join(', ') : '0 שנ\'';
    }

    const userRows = users.map((user, index) => {
        const rankEmoji = ["🥇", "🥈", "🥉"][index] || (index + 1).toString(); // אימוג'י ל-3 הראשונים, מספר לשאר
        const xpBarWidth = (user.xp / users[0].xp) * 100; // חישוב רוחב פס ה-XP יחסית לראשון
        const totalVoiceTime = formatTime(user.totalVoiceTime);

        return `
            <div class="user-row">
                <div class="rank">${rankEmoji}</div>
                <img src="${user.avatarURL}" class="avatar" />
                <div class="user-info">
                    <span class="username">${user.username}</span>
                    <span class="level">רמה ${user.level}</span>
                    <div class="xp-bar-container">
                        <div class="xp-bar" style="width: ${xpBarWidth}%;"></div>
                        <span class="xp-text">${user.xp.toLocaleString()} XP</span>
                    </div>
                    <span class="voice-time">זמן קול: ${totalVoiceTime}</span>
                </div>
            </div>
        `;
    }).join('');

    const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>XP Leaderboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
    <style>
        body {
            margin: 0;
            padding: 0;
            /* רקע משופר: גראדיאנט עמוק עם אפקטים עדינים */
            background: 
                linear-gradient(135deg, #1a2a3a 0%, #0d1a26 100%),
                radial-gradient(circle at 10% 20%, rgba(50, 0, 100, 0.2) 0%, transparent 50%),
                radial-gradient(circle at 90% 80%, rgba(0, 70, 70, 0.15) 0%, transparent 50%);
            font-family: 'Noto Sans Hebrew', 'Noto Color Emoji', sans-serif;
            color: #e0e0e0;
            width: 1200px; /* רוחב תמונה קבוע */
            min-height: 800px; /* גובה מינימלי, יגדל לפי תוכן */
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px 0; /* פאדינג עליון ותחתון */
            box-sizing: border-box;
            overflow: hidden;
        }
        .container {
            width: 90%;
            max-width: 1000px;
            background-color: rgba(18, 26, 36, 0.7); /* רקע כהה יותר, שקוף מעט */
            border-radius: 20px;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6);
            padding: 30px;
            display: flex;
            flex-direction: column;
            gap: 20px; /* מרווח בין האלמנטים בתוך הקונטיינר */
        }
        .title {
            font-size: 55px; /* הקטנה קלה של גודל הכותרת */
            color: #ffd700; /* צבע זהב */
            text-align: center;
            font-weight: bold;
            margin-bottom: 20px; /* הקטנת מרווח תחתון של הכותרת */
            text-shadow: 0 0 10px rgba(255, 215, 0, 0.5), 0 0 20px rgba(255, 215, 0, 0.3);
        }
        .user-row {
            display: flex;
            align-items: center;
            background-color: rgba(25, 35, 45, 0.8); /* רקע כהה יותר לשורת משתמש */
            border-radius: 15px;
            padding: 15px 25px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
            transition: transform 0.2s ease-in-out;
            border-left: 5px solid transparent; /* מסגרת צדדית דינמית */
        }
        .user-row:hover {
            transform: translateY(-5px);
            border-left-color: #4CAF50; /* ירוק כשמרחפים */
        }
        .user-row:nth-child(1) { border-left-color: #FFD700; } /* זהב למקום ראשון */
        .user-row:nth-child(2) { border-left-color: #C0C0C0; } /* כסף למקום שני */
        .user-row:nth-child(3) { border-left-color: #CD7F32; } /* ארד למקום שלישי */

        .rank {
            font-size: 45px; /* גודל אימוג'י/מספר מוגדל */
            margin-left: 20px; /* מרווח משמאל */
            flex-shrink: 0;
        }
        .avatar {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            margin-left: 20px;
            border: 4px solid #3498db; /* מסגרת כחולה */
            object-fit: cover;
            flex-shrink: 0;
        }
        .user-info {
            display: flex;
            flex-direction: column;
            flex-grow: 1; /* תופס את שאר המקום */
        }
        .username {
            font-size: 28px;
            font-weight: bold;
            color: #7afffc; /* צבע טורקיז בהיר */
            margin-bottom: 5px;
        }
        .level {
            font-size: 20px;
            color: #a0a0a0;
            margin-bottom: 8px;
        }
        .xp-bar-container {
            width: 100%;
            height: 15px;
            background-color: #333;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 5px;
            position: relative;
        }
        .xp-bar {
            height: 100%;
            background: linear-gradient(to right, #4CAF50, #8bc34a); /* ירוק-בהיר יותר */
            border-radius: 10px;
            transition: width 0.5s ease-in-out;
        }
        .xp-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 14px;
            font-weight: bold;
            color: #fff;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
        }
        .voice-time {
            font-size: 18px;
            color: #b0c4de; /* צבע כחול אפור עדין */
            margin-top: 5px;
        }
        .footer {
            margin-top: 30px; /* מרווח עליון מהטבלה */
            text-align: right;
            width: 90%;
            max-width: 1000px;
            padding-left: 30px; /* מרווח מהשמאל (בגלל RTL) */
            font-size: 18px;
            color: #95a5a6;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="title">🏆 לוח מנהיגי XP</div>
        ${userRows}
    </div>
    <div class="footer">עודכן: ${now}</div>
</body>
</html>`;

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--font-render-hinting=none',
            '--disable-gpu',
            '--enable-font-antialiasing',
            '--disable-lcd-text'
        ]
    });

    const page = await browser.newPage();
    // גובה נשאר אוטומטי, רוחב מוגדר ב-CSS
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 }); // הגדלת scale factor לחדות טובה יותר
    await page.setContent(html, { waitUntil: 'networkidle0' });

    await page.evaluateHandle('document.fonts.ready');

    const buffer = await page.screenshot({ type: 'png', fullPage: true }); // צילום עמוד מלא
    await browser.close();
    return buffer;
}

module.exports = generateXPLeaderboardImage;