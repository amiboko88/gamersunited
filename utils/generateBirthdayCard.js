// 📁 utils/generateBirthdayCard.js (מעודכן לשימוש ב-Puppeteer)
const puppeteer = require('puppeteer'); // ייבוא ספריית Puppeteer
const axios = require('axios'); // נשאר עבור הורדת תמונות פרופיל אם תרצה לשמור מקומית קודם
const fs = require('fs/promises'); // לטיפול בקבצים אם נרצה לשמור תמונה זמנית

// פונקציית עזר ליצירת קונפטי ב-HTML/CSS
function generateConfettiHTML(amount = 80) {
    let confettiPieces = '';
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];
    for (let i = 0; i < amount; i++) {
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const randomX = Math.random() * 100;
        const randomY = Math.random() * 100;
        const randomSize = Math.random() * 8 + 5;
        const randomSpeed = Math.random() * 3 + 2;
        const randomRotation = Math.random() * 360;
        const randomDelay = Math.random() * 2; // כדי לפזר את התחלת האנימציה

        confettiPieces += `
            <div class="confetti-piece" style="
                left: ${randomX}%;
                top: ${randomY}%;
                width: ${randomSize}px;
                height: ${randomSize}px;
                background-color: ${randomColor};
                animation-duration: ${randomSpeed}s;
                animation-delay: ${randomDelay}s;
                transform: rotate(${randomRotation}deg);
                opacity: ${Math.random() * 0.8 + 0.3};
            "></div>
        `;
    }
    return confettiPieces;
}

module.exports = async function generateBirthdayCard({ fullName, birthdate, profileUrl }) {
    // חישוב גיל
    const [day, month, year] = birthdate.split('.');
    const now = new Date();
    let age = now.getFullYear() - parseInt(year);
    const bdayThisYear = new Date(now.getFullYear(), parseInt(month) - 1, parseInt(day));
    if (now < bdayThisYear) age--;

    // קוד ה-HTML וה-CSS כולו כסטרינג (האימוג'י בתוך ה-HTML יטופלו על ידי Chromium)
    const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>יום הולדת שמח!</title>
            <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Noto Sans Hebrew', sans-serif; /* פונט שמוטען מגוגל פונטים */
                    margin: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 240px; /* גובה מינימלי */
                    background: linear-gradient(135deg, #fbc2eb, #a6c1ee); /* רקע עם גרדיאנט נעים */
                    padding: 30px;
                    box-sizing: border-box;
                    overflow: hidden; /* למנוע גלילה אם הקונפטי יוצא מהמסך */
                }

                .banner-container {
                    background-color: white;
                    border-radius: 15px;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
                    display: flex;
                    align-items: center;
                    padding: 30px;
                    width: 680px; /* רוחב קבוע */
                    height: 200px; /* גובה קבוע לבאנר עצמו */
                    box-sizing: border-box;
                    position: relative; /* עבור מיקום הלוגו */
                    overflow: hidden; /* לוודא שהצל והקונפטי לא יוצאים מהגבול */
                }

                .profile-image {
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    object-fit: cover;
                    margin-left: 20px; /* רווח בין התמונה לטקסט */
                    border: 5px solid #e91e63; /* מסגרת לתמונה */
                    flex-shrink: 0; /* למנוע כיווץ של התמונה */
                }

                .text-content {
                    flex-grow: 1;
                    text-align: right;
                }

                .greeting {
                    font-size: 2.5em;
                    color: #e91e63;
                    margin-bottom: 10px;
                    font-weight: bold;
                    line-height: 1.2;
                }

                .details {
                    font-size: 1.2em;
                    color: #333;
                    margin-bottom: 5px;
                }

                .age {
                    font-size: 1.5em;
                    color: #007bff;
                    font-weight: bold;
                }

                /* קונפטי - אנימציה מתמדת */
                .confetti {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    top: 0;
                    left: 0;
                    pointer-events: none;
                    overflow: hidden; /* וודא שהקונפטי נשאר בתוך הבאנר */
                }

                .confetti-piece {
                    position: absolute;
                    background: #f06292;
                    border-radius: 50%;
                    opacity: 0.7;
                    animation: confetti-fall linear infinite; /* אנימציה אינסופית */
                }

                @keyframes confetti-fall {
                    0% { transform: translateY(-100%) rotate(0deg); opacity: 0.8; }
                    100% { transform: translateY(200%) rotate(720deg); opacity: 0; }
                }

                /* לוגו בפינה שמאלית תחתונה */
                .logo {
                    position: absolute;
                    bottom: 15px;
                    left: 15px;
                    width: 50px; /* גודל הלוגו */
                    height: 50px;
                    object-fit: contain;
                }
            </style>
        </head>
        <body>
            <div class="banner-container">
                <img src="${profileUrl}" alt="תמונת פרופיל" class="profile-image">
                <div class="text-content">
                    <h1 class="greeting">🎉 מזל טוב ל־${fullName}! 🎉</h1>
                    <p class="details">📅 תאריך: ${birthdate}</p>
                    <p class="age">🎂 גיל: ${age}</p>
                </div>
                <div class="confetti">
                    ${generateConfettiHTML(80)} </div>
                <img src="https://i.imgur.com/your_onlyg_logo_url.png" alt="Logo" class="logo"> </div>
        </body>
        </html>
    `;

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new', // או true
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
        const page = await browser.newPage();

        // הגדרת גודל עמוד כך שיתאים לגודל הבאנר
        await page.setViewport({ width: 680 + (30*2), height: 240 + (30*2), deviceScaleFactor: 2 }); // רוחב וגובה הבאנר + הפדינג של הבאדי, scaleFactor משפר איכות

        // טען את התוכן HTML
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' }); // המתן עד שאין פעילות רשת (כולל טעינת תמונות ופונטים)

        // המתן לטעינת תמונת הפרופיל והפונטים
        await page.waitForSelector('.profile-image', { visible: true, timeout: 5000 }).catch(() => console.warn('תמונת פרופיל לא נטענה בזמן.'));
        // ניתן להוסיף המתנה ספציפית לפונטים אם הם קריטיים, אך waitUntil: 'networkidle0' לרוב מספיק
        
        // צלם מסך של ה-banner-container בלבד
        const bannerElement = await page.$('.banner-container');
        if (!bannerElement) {
            throw new Error('לא נמצא אלמנט .banner-container לצילום.');
        }

        const imageBuffer = await bannerElement.screenshot({ type: 'png', omitBackground: true }); // omitBackground: true אם רוצים רק את הבאנר בלי הרקע של ה-body

        return imageBuffer;

    } catch (error) {
        console.error('❌ שגיאה ביצירת באנר יום הולדת עם Puppeteer:', error);
        throw error; // זרוק את השגיאה הלאה לטיפול
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};