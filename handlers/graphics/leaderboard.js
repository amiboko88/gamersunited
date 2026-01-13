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
                .header-container { text-align: center; margin-bottom: 50px; }
                .main-title {
                    font-size: 60px; font-weight: 900;
                    letter-spacing: -2px; line-height: 1;
                    background: linear-gradient(to bottom, #fff, #999);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                    text-transform: uppercase; margin: 0;
                }
                .sub-title {
                    font-size: 20px; color: #666; font-weight: 700; letter-spacing: 4px;
                    margin-top: 10px; text-transform: uppercase;
                }

                /* כרטיס MVP */
                .mvp-card {
                    width: 100%; height: 180px;
                    background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), rgba(0,0,0,0));
                    border: 1px solid rgba(255, 215, 0, 0.3);
                    border-left: 6px solid #ffd700;
                    border-radius: 12px;
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0 50px;
                    margin-bottom: 40px;
                    position: relative;
                    box-shadow: 0 0 50px rgba(255, 215, 0, 0.1);
                }

                .mvp-badge {
                    position: absolute; top: -15px; left: 30px;
                    background: #ffd700; color: #000;
                    padding: 5px 15px; border-radius: 20px;
                    font-weight: 900; font-size: 14px;
                    letter-spacing: 1px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                }

                .mvp-left { display: flex; align-items: center; gap: 30px; }
                
                .mvp-avatar {
                    width: 100px; height: 100px; border-radius: 50%;
                    border: 3px solid #ffd700; box-shadow: 0 0 20px rgba(255,215,0,0.3);
                    object-fit: cover;
                }

                .mvp-details h1 { font-size: 42px; margin: 0; line-height: 1; font-weight: 800; }
                .mvp-details p { margin: 8px 0 0; color: #aaa; font-size: 16px; font-weight: 500; }
                
                .mvp-score {
                    font-size: 56px; font-weight: 900; color: #ffd700;
                    text-shadow: 0 0 30px rgba(255, 215, 0, 0.4);
                }

                /* רשימה */
                .list-container { width: 100%; display: flex; flex-direction: column; gap: 10px; }
                
                .row {
                    display: flex; align-items: center;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 12px; padding: 15px 30px;
                    transition: transform 0.2s;
                }
                
                .rank {
                    font-size: 24px; font-weight: 900; color: #444; width: 50px;
                }
                
                .avatar-wrapper-small { margin-right: 20px; }
                .avatar-small {
                    width: 50px; height: 50px; border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.1); object-fit: cover;
                }
                
                .info { flex: 1; display: flex; flex-direction: column; }
                .name { font-size: 20px; font-weight: 700; color: #eee; }
                .sub-stats { font-size: 14px; color: #666; margin-top: 2px; }
                .sub-stats .highlight { color: #888; font-weight: 600; }

                .score {
                    font-size: 28px; font-weight: 800; color: #00e676;
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
                <div class="mvp-badge">WEEKLY MVP 👑</div>
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