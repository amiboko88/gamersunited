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
                    margin: 0; padding: 60px; width: 1400px; min-height: 100vh;
                    background: #101010;
                    background-image: radial-gradient(circle at 50% -20%, #202025 0%, #101010 60%);
                    /* Added Emoji fonts to fallback stack */
                    font-family: 'Outfit', 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', sans-serif; 
                    color: white; 
                    display: flex; flex-direction: column; align-items: center;
                }

                /* כותרת */
                .header-container { text-align: center; margin-bottom: 50px; }
                .main-title {
                    font-size: 80px; font-weight: 900;
                    letter-spacing: -2px; line-height: 1;
                    background: linear-gradient(to bottom, #fff, #999);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                    text-transform: uppercase; margin: 0;
                }
                .sub-title {
                    font-size: 26px; color: #666; font-weight: 700; letter-spacing: 6px;
                    margin-top: 10px; text-transform: uppercase;
                }

                /* כרטיס MVP */
                .mvp-card {
                    width: 100%; height: 220px;
                    background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), rgba(0,0,0,0));
                    border: 1px solid rgba(255, 215, 0, 0.3);
                    border-left: 8px solid #ffd700;
                    border-radius: 24px;
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0 60px;
                    margin-bottom: 50px;
                    position: relative;
                    box-shadow: 0 0 80px rgba(255, 215, 0, 0.15);
                    margin-top: 20px;
                }

                .mvp-badge {
                    position: absolute; top: -16px; left: 40px;
                    background: #ffd700; color: #000;
                    padding: 8px 20px; border-radius: 30px;
                    font-weight: 900; font-size: 16px;
                    letter-spacing: 1.5px;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.4);
                    display: flex; align-items: center; gap: 8px;
                }

                .mvp-left { display: flex; align-items: center; gap: 40px; }
                
                .mvp-avatar {
                    width: 130px; height: 130px; border-radius: 50%;
                    border: 4px solid #ffd700; box-shadow: 0 0 30px rgba(255,215,0,0.3);
                    object-fit: cover;
                }

                .mvp-details h1 { 
                    font-size: 56px; margin: 0; line-height: 1; font-weight: 800; 
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 600px;
                }
                .mvp-details p { margin: 10px 0 0; color: #aaa; font-size: 20px; font-weight: 500; }
                
                .mvp-score {
                    font-size: 70px; font-weight: 900; color: #ffd700;
                    text-shadow: 0 0 40px rgba(255, 215, 0, 0.4);
                }

                /* רשימה */
                .list-container { width: 100%; display: flex; flex-direction: column; gap: 15px; }
                
                .row {
                    display: flex; align-items: center;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 18px; padding: 0 40px;
                    transition: transform 0.2s;
                    height: 100px;
                }

                /* הדגשת טופ 3 */
                .row:nth-child(1) { border-left: 6px solid silver; background: linear-gradient(90deg, rgba(192,192,192,0.1), transparent); }
                .row:nth-child(2) { border-left: 6px solid #cd7f32; background: linear-gradient(90deg, rgba(205,127,50,0.1), transparent); }
                
                .rank {
                    font-size: 34px; font-weight: 900; color: #444; width: 60px;
                    text-align: right;
                }
                
                .avatar-wrapper-small { 
                    margin-right: 25px;
                    margin-left: 25px;
                    display: flex; align-items: center; justify-content: center;
                }
                .avatar-small {
                    width: 64px; height: 64px; border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.15); object-fit: cover;
                }
                
                .info { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
                .name { 
                    font-size: 28px; font-weight: 700; color: #eee; margin-bottom: 4px; 
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .sub-stats { font-size: 18px; color: #666; }
                .sub-stats .highlight { color: #999; font-weight: 600; }

                .score {
                    font-size: 40px; font-weight: 800; color: #00e676;
                    text-shadow: 0 0 20px rgba(0, 230, 118, 0.25);
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="black"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" /></svg>
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
        // רוחב 1400 נותן מראה רחב וגדול ("Premium")
        // גובה הותאם כדי לאפשר רווחים יפים יותר
        return core.render(html, 1400, 1800, true);
    }
}

module.exports = new LeaderboardRenderer();