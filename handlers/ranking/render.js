// 📁 handlers/ranking/render.js
const puppeteer = require('puppeteer');
const { log } = require('../../utils/logger');

class RankingRenderer {

    async generateLeaderboardImage(leaders, weekNum) {
        if (!leaders || leaders.length === 0) return null;

        const topPlayer = leaders[0]; // ה-MVP

        // בניית שורות הטבלה (מקום 2 ומטה)
        const listItems = leaders.slice(1).map((p, index) => `
            <div class="row">
                <div class="rank">#${index + 2}</div>
                <div class="avatar-container">
                    <img src="${p.avatar}" class="avatar-small" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                </div>
                <div class="info">
                    <div class="name">${p.name}</div>
                    <div class="sub-stats">🎙️ ${p.stats.voice}h | 🎮 ${p.stats.games}h | 💬 ${p.stats.msgs}</div>
                </div>
                <div class="score">${p.score.toLocaleString()} pts</div>
            </div>
        `).join('');

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
                
                body {
                    margin: 0;
                    padding: 40px;
                    background: #1a1a1a;
                    background-image: radial-gradient(circle at 50% 0%, #2a2a2a 0%, #1a1a1a 70%);
                    font-family: 'Heebo', sans-serif;
                    color: white;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 800px;
                    box-sizing: border-box;
                }

                .header {
                    text-align: center;
                    margin-bottom: 40px;
                    position: relative;
                    z-index: 2;
                }
                
                .title {
                    font-size: 48px;
                    font-weight: 900;
                    text-transform: uppercase;
                    background: linear-gradient(to right, #ffd700, #ff8c00);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    text-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
                }

                .subtitle {
                    font-size: 24px;
                    color: #888;
                    margin-top: 5px;
                    letter-spacing: 2px;
                }

                /* MVP Section */
                .mvp-card {
                    background: linear-gradient(135deg, rgba(255,215,0,0.1), rgba(0,0,0,0));
                    border: 2px solid #ffd700;
                    border-radius: 20px;
                    padding: 20px 40px;
                    display: flex;
                    align-items: center;
                    gap: 30px;
                    width: 100%;
                    margin-bottom: 40px;
                    box-shadow: 0 0 30px rgba(255,215,0,0.1);
                    position: relative;
                    overflow: hidden;
                }
                
                .mvp-badge {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    background: #ffd700;
                    color: black;
                    padding: 5px 15px;
                    border-radius: 10px;
                    font-weight: bold;
                    font-size: 14px;
                }

                .mvp-avatar {
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    border: 4px solid #ffd700;
                    object-fit: cover;
                }

                .mvp-info h1 { margin: 0; font-size: 32px; }
                .mvp-info p { margin: 5px 0 0; color: #ccc; font-size: 18px; }
                .mvp-score { 
                    margin-right: auto; 
                    font-size: 42px; 
                    font-weight: 900; 
                    color: #ffd700;
                }

                /* List Section */
                .list-container {
                    width: 100%;
                    background: rgba(255,255,255,0.03);
                    border-radius: 20px;
                    padding: 10px;
                }

                .row {
                    display: flex;
                    align-items: center;
                    padding: 15px 20px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    transition: all 0.2s;
                }

                .row:last-child { border-bottom: none; }
                
                .rank {
                    font-size: 24px;
                    font-weight: bold;
                    color: #666;
                    width: 50px;
                }

                .avatar-small {
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    margin-left: 20px;
                }

                .info { flex-grow: 1; }
                .name { font-size: 20px; font-weight: bold; }
                .sub-stats { font-size: 14px; color: #888; margin-top: 2px; }
                
                .score {
                    font-size: 24px;
                    font-weight: bold;
                    color: #4CAF50;
                }

            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">LEADERBOARD</div>
                <div class="subtitle">WEEK #${weekNum} SUMMARY</div>
            </div>

            <div class="mvp-card">
                <div class="mvp-badge">👑 MVP</div>
                <img src="${topPlayer.avatar}" class="mvp-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <div class="mvp-info">
                    <h1>${topPlayer.name}</h1>
                    <p>🎙️ ${topPlayer.stats.voice}h • 🎮 ${topPlayer.stats.games}h • 💬 ${topPlayer.stats.msgs}</p>
                </div>
                <div class="mvp-score">${topPlayer.score.toLocaleString()}</div>
            </div>

            <div class="list-container">
                ${listItems}
            </div>
        </body>
        </html>`;

        let browser = null;
        try {
            browser = await puppeteer.launch({ 
                headless: 'new', 
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            });
            const page = await browser.newPage();
            // רזולוציה גבוהה
            await page.setViewport({ width: 880, height: 100, deviceScaleFactor: 2 }); 
            await page.setContent(html, { waitUntil: 'networkidle0' });
            
            // התאמת גובה דינמית
            const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
            await page.setViewport({ width: 880, height: bodyHeight, deviceScaleFactor: 2 });

            const buffer = await page.screenshot({ type: 'png', fullPage: true });
            return buffer;
        } catch (err) {
            log(`❌ [RankingRender] Error: ${err.message}`);
            return null;
        } finally {
            if (browser) await browser.close();
        }
    }
}

module.exports = new RankingRenderer();