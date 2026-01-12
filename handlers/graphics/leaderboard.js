// 📁 handlers/graphics/leaderboard.js
const core = require('./core');

class LeaderboardRenderer {

    async generateImage(leaders, weekNum) {
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
                    <div class="sub-stats">VOICE: ${p.stats.voice}h | MSGS: ${p.stats.msgs}</div>
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
                
                * { box-sizing: border-box; }

                body {
                    margin: 0; padding: 40px; width: 880px; min-height: 100vh;
                    background: #1a1a1a; background-image: radial-gradient(circle at 50% 0%, #2a2a2a 0%, #1a1a1a 70%);
                    font-family: 'Heebo', sans-serif; color: white; display: flex; flex-direction: column; align-items: center;
                }

                .header { text-align: center; margin-bottom: 40px; position: relative; z-index: 2; width: 100%; }
                .title {
                    font-size: 48px; font-weight: 900; text-transform: uppercase;
                    background: linear-gradient(to right, #ffd700, #ff8c00);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                    text-shadow: 0 4px 15px rgba(255, 215, 0, 0.3); margin: 0;
                }
                .subtitle { font-size: 24px; color: #888; margin-top: 5px; letter-spacing: 2px; }

                /* MVP Section */
                .mvp-card {
                    background: linear-gradient(135deg, rgba(255,215,0,0.15), rgba(0,0,0,0.2));
                    border: 2px solid #ffd700; border-radius: 20px; padding: 20px 40px;
                    display: flex; align-items: center; gap: 30px; width: 100%; margin-bottom: 40px;
                    box-shadow: 0 0 40px rgba(255,215,0,0.15); position: relative; overflow: hidden;
                }
                .mvp-badge {
                    position: absolute; top: 0; left: 0; background: #ffd700; color: black;
                    padding: 8px 20px; border-bottom-right-radius: 15px; font-weight: 900; font-size: 14px;
                }
                .mvp-avatar {
                    width: 110px; height: 110px; border-radius: 50%; border: 4px solid #ffd700;
                    object-fit: cover; flex-shrink: 0; background-color: #333;
                }
                .mvp-info { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
                .mvp-info h1 { margin: 0; font-size: 36px; line-height: 1.2; }
                .mvp-info p { margin: 5px 0 0; color: #ccc; font-size: 18px; }
                .mvp-score { font-size: 48px; font-weight: 900; color: #ffd700; text-shadow: 0 2px 10px rgba(0,0,0,0.5); white-space: nowrap; }

                /* List Section */
                .list-container {
                    width: 100%; background: rgba(255,255,255,0.03); border-radius: 20px;
                    padding: 10px 0; border: 1px solid rgba(255,255,255,0.05);
                }
                .row { display: flex; align-items: center; padding: 15px 30px; border-bottom: 1px solid rgba(255,255,255,0.05); }
                .row:last-child { border-bottom: none; }
                .rank { font-size: 24px; font-weight: 900; color: #666; width: 60px; text-align: center; }
                .avatar-container { display: flex; align-items: center; justify-content: center; width: 70px; }
                .avatar-small { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.2); background-color: #333; }
                .info { flex-grow: 1; padding-right: 20px; }
                .name { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
                .sub-stats { font-size: 15px; color: #999; font-weight: 400; }
                .score { font-size: 26px; font-weight: bold; color: #4CAF50; text-shadow: 0 2px 5px rgba(0,0,0,0.3); }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">TOP LEGENDS</div>
                <div class="subtitle">WEEK #${weekNum} SUMMARY</div>
            </div>

            <div class="mvp-card">
                <div class="mvp-badge">👑 WEEKLY MVP</div>
                <img src="${topPlayer.avatar}" class="mvp-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <div class="mvp-info">
                    <h1>${topPlayer.name}</h1>
                    <p>VOICE: ${topPlayer.stats.voice}h • MSGS: ${topPlayer.stats.msgs}</p>
                </div>
                <div class="mvp-score">${topPlayer.score.toLocaleString()}</div>
            </div>

            <div class="list-container">${listItems}</div>
        </body>
        </html>`;

        // שימוש במנוע הליבה (Core)
        return core.render(html, 880, 1000, true);
    }
}

module.exports = new LeaderboardRenderer();