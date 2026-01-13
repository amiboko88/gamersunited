// 📁 handlers/graphics/leaderboard.js
const core = require('./core');

class LeaderboardRenderer {

    async generateImage(leaders, weekNum) {
        if (!leaders || leaders.length === 0) return null;

        const topPlayer = leaders[0];

        // בניית שורות הטבלה (מקום 2 ומטה)
        const listItems = leaders.slice(1).map((p, index) => `
            <div class="row">
                <div class="rank">#${index + 2}</div>
                <div class="avatar-wrapper-small">
                    <img src="${p.avatar}" class="avatar-small" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                </div>
                <div class="info">
                    <div class="name">${p.name}</div>
                    <div class="sub-stats">VOICE: <span class="highlight">${p.stats.voice}h</span> • MSGS: <span class="highlight">${p.stats.msgs}</span></div>
                </div>
                <div class="score">${p.score.toLocaleString()}</div>
            </div>
        `).join('');

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                
                * { box-sizing: border-box; }

                body {
                    margin: 0; padding: 50px; width: 900px; min-height: 100vh;
                    background: #101010;
                    background-image: radial-gradient(circle at 50% -20%, #202025 0%, #101010 60%);
                    font-family: 'Outfit', sans-serif; 
                    color: white; 
                    display: flex; flex-direction: column; align-items: center;
                }

                /* כותרת */
                .header-container { text-align: center; margin-bottom: 40px; }
                .main-title {
                    font-size: 60px; font-weight: 900;
                    letter-spacing: -2px; line-height: 1;
                    background: linear-gradient(to bottom, #fff, #999);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                    text-transform: uppercase; margin: 0;
                }
                .sub-title {
                    font-size: 20px; color: #666; font-weight: 700; letter-spacing: 4px;
                    margin-top: 5px; text-transform: uppercase;
                }

                /* כרטיס MVP */
                .mvp-card {
                    width: 100%; height: 160px;
                    background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), rgba(0,0,0,0));
                    border: 1px solid rgba(255, 215, 0, 0.3);
                    border-left: 6px solid #ffd700;
                    border-radius: 12px;
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0 40px;
                    margin-bottom: 30px;
                    position: relative;
                    box-shadow: 0 0 50px rgba(255, 215, 0, 0.1);
                    margin-top: 20px;
                }

                .mvp-badge {
                    position: absolute; top: -12px; left: 30px;
                    background: #ffd700; color: #000;
                    padding: 4px 12px; border-radius: 20px;
                    font-weight: 900; font-size: 12px;
                    letter-spacing: 1px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    display: flex; align-items: center; gap: 5px;
                }

                .mvp-left { display: flex; align-items: center; gap: 30px; }
                
                .mvp-avatar {
                    width: 90px; height: 90px; border-radius: 50%;
                    border: 3px solid #ffd700; box-shadow: 0 0 20px rgba(255,215,0,0.3);
                    object-fit: cover;
                }

                .mvp-details h1 { font-size: 38px; margin: 0; line-height: 1; font-weight: 800; }
                .mvp-details p { margin: 5px 0 0; color: #aaa; font-size: 14px; font-weight: 500; }
                
                .mvp-score {
                    font-size: 50px; font-weight: 900; color: #ffd700;
                    text-shadow: 0 0 30px rgba(255, 215, 0, 0.4);
                }

                /* רשימה */
                .list-container { width: 100%; display: flex; flex-direction: column; gap: 8px; }
                
                .row {
                    display: flex; align-items: center;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 12px; padding: 10px 25px;
                    transition: transform 0.2s;
                    height: 80px;
                }

                /* הדגשת טופ 3 */
                .row:nth-child(1) { border-left: 4px solid silver; background: linear-gradient(90deg, rgba(192,192,192,0.1), transparent); }
                .row:nth-child(2) { border-left: 4px solid #cd7f32; background: linear-gradient(90deg, rgba(205,127,50,0.1), transparent); }
                
                .rank {
                    font-size: 24px; font-weight: 900; color: #444; width: 40px; /* Reduced width to pull avatar left */
                    text-align: right;
                }
                
                .avatar-wrapper-small { 
                    margin-right: 15px; /* Reduced from 25px */
                    margin-left: 15px; /* Added spacing from rank */
                    display: flex; align-items: center; justify-content: center;
                }
                .avatar-small {
                    width: 48px; height: 48px; border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.1); object-fit: cover;
                }
                
                .info { flex: 1; display: flex; flex-direction: column; justify-content: center; }
                .name { font-size: 20px; font-weight: 700; color: #eee; margin-bottom: 2px; }
                .sub-stats { font-size: 13px; color: #666; }
                .sub-stats .highlight { color: #888; font-weight: 600; }

                .score {
                    font-size: 26px; font-weight: 800; color: #00e676;
                    text-shadow: 0 0 15px rgba(0, 230, 118, 0.2);
                }

            </style>
        </head>
        <body>
            <div class="header-container">
                <div class="main-title">TOP LEGENDS</div>
                <div class="sub-title">WEEK #${weekNum} SUMMARY</div>
            </div>

            <div class="mvp-card">
                <div class="mvp-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="black"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" /></svg>
                    WEEKLY MVP
                </div>
                <div class="mvp-left">
                    <img src="${topPlayer.avatar}" class="mvp-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="mvp-details">
                        <h1>${topPlayer.name}</h1>
                        <p>VOICE: ${topPlayer.stats.voice}h • MSGS: ${topPlayer.stats.msgs}</p>
                    </div>
                </div>
                <div class="mvp-score">${topPlayer.score.toLocaleString()}</div>
            </div>

            <div class="list-container">${listItems}</div>
        </body>
        </html>`;

        // שימוש במנוע הליבה (Core)
        return core.render(html, 900, 1100, true);
    }
}

module.exports = new LeaderboardRenderer();