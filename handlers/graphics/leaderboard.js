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
                    margin: 0; padding: 60px; width: 1800px;
                    background: #101010;
                    background-image: radial-gradient(circle at 50% -20%, #202025 0%, #101010 60%);
                    /* Robust Layout & Fonts for 3344 Squares Issue */
                    font-family: 'Outfit', 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', 'Arial', sans-serif; 
                    color: white; 
                    display: flex; flex-direction: column; align-items: center;
                }

                /* כותרת */
                .header-container { text-align: center; margin-bottom: 60px; }
                .main-title {
                    font-size: 100px; font-weight: 900;
                    letter-spacing: -3px; line-height: 1;
                    background: linear-gradient(to bottom, #fff, #999);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                    text-transform: uppercase; margin: 0;
                }
                .sub-title {
                    font-size: 32px; color: #666; font-weight: 700; letter-spacing: 8px;
                    margin-top: 15px; text-transform: uppercase;
                }

                /* כרטיס MVP */
                .mvp-card {
                    width: 100%; height: 320px;
                    background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), rgba(0,0,0,0));
                    border: 1px solid rgba(255, 215, 0, 0.3);
                    border-left: 10px solid #ffd700;
                    border-radius: 30px;
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0 80px;
                    margin-bottom: 60px;
                    position: relative;
                    box-shadow: 0 0 100px rgba(255, 215, 0, 0.2);
                    margin-top: 30px;
                }

                .mvp-badge {
                    position: absolute; top: -20px; left: 60px;
                    background: #ffd700; color: #000;
                    padding: 10px 30px; border-radius: 40px;
                    font-weight: 900; font-size: 20px;
                    letter-spacing: 2px;
                    box-shadow: 0 5px 25px rgba(0,0,0,0.4);
                    display: flex; align-items: center; gap: 10px;
                }

                .mvp-left { display: flex; align-items: center; gap: 50px; }
                
                .mvp-avatar {
                    width: 200px; height: 200px; border-radius: 50%;
                    border: 6px solid #ffd700; box-shadow: 0 0 40px rgba(255,215,0,0.4);
                    object-fit: cover;
                }

                .mvp-details h1 { 
                    font-size: 72px; margin: 0; line-height: 1.1; font-weight: 800; 
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 650px;
                }
                .mvp-details p { margin: 15px 0 0; color: #bbb; font-size: 28px; font-weight: 500; }
                
                .mvp-score {
                    font-size: 90px; font-weight: 900; color: #ffd700;
                    text-shadow: 0 0 50px rgba(255, 215, 0, 0.5);
                }

                /* רשימה */
                .list-container { width: 100%; display: flex; flex-direction: column; gap: 25px; }
                
                .row {
                    display: flex; align-items: center;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 24px; padding: 0 50px;
                    transition: transform 0.2s;
                    height: 160px;
                }

                /* הדגשת טופ 3 */
                .row:nth-child(1) { border-left: 8px solid silver; background: linear-gradient(90deg, rgba(192,192,192,0.1), transparent); }
                .row:nth-child(2) { border-left: 8px solid #cd7f32; background: linear-gradient(90deg, rgba(205,127,50,0.1), transparent); }
                
                .rank {
                    font-size: 48px; font-weight: 900; color: #555; width: 80px;
                    text-align: right;
                }
                
                .avatar-wrapper-small { 
                    margin-right: 40px;
                    margin-left: 40px;
                    display: flex; align-items: center; justify-content: center;
                }
                .avatar-small {
                    width: 100px; height: 100px; border-radius: 50%;
                    border: 3px solid rgba(255,255,255,0.2); object-fit: cover;
                }
                
                .info { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
                .name { 
                    font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 8px; 
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .sub-stats { font-size: 24px; color: #888; }
                .sub-stats .highlight { color: #bbb; font-weight: 600; }

                .score {
                    font-size: 60px; font-weight: 800; color: #00e676;
                    text-shadow: 0 0 30px rgba(0, 230, 118, 0.3);
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="black"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" /></svg>
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
        // רוחב 1800 נותן מראה רחב וגדול ("Premium")
        // גובה הותאם ל-5 שורות מרווחות
        return core.render(html, 1800, 1600, true);
    }
    /**
     * מחולל טבלת מובילים לוורזון (COD)
     * @param {Array} players - { rank, name, avatar, kills, damage, matches, kdr }
     * @param {String} periodText - "Last 7 Days" / "All Time"
     */
    async generateCODLeaderboard(players, periodText) {
        if (!players || players.length === 0) return null;

        const rows = players.map((p, index) => {
            const rank = index + 1;
            let rankClass = 'rank-regular';
            let rowClass = 'row';
            if (rank === 1) { rankClass = 'rank-1'; rowClass += ' row-1'; }
            if (rank === 2) { rankClass = 'rank-2'; rowClass += ' row-2'; }
            if (rank === 3) { rankClass = 'rank-3'; rowClass += ' row-3'; }

            return `
            <div class="${rowClass}">
                <div class="cell-rank">
                    <div class="${rankClass}">${rank}</div>
                </div>
                <div class="cell-player">
                    <img src="${p.avatar}" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="name-box">
                        <div class="name">${p.name}</div>
                        <div class="sub-name">${p.matches} Matches Played</div>
                    </div>
                </div>
                <div class="cell-stat">
                    <div class="stat-value text-orange">${p.damage.toLocaleString()}</div>
                    <div class="stat-label">DAMAGE</div>
                </div>
                <div class="cell-stat">
                    <div class="stat-value text-green">${p.kills.toLocaleString()}</div>
                    <div class="stat-label">KILLS</div>
                </div>
                <div class="cell-stat">
                    <div class="stat-value text-blue">${p.matches > 0 ? (p.kills / p.matches).toFixed(1) : '0.0'}</div>
                    <div class="stat-label">AVG KILLS</div>
                </div>
            </div>
            `;
        }).join('');

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;500;700;900&family=Outfit:wght@700;900&display=swap');
                
                * { box-sizing: border-box; }

                body {
                    margin: 0; padding: 60px; width: 1400px;
                    background: #0a0a0a;
                    background-image: 
                        linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)),
                        url('https://www.callofduty.com/content/dam/atvi/callofduty/cod-touchui/mw3/home/hero/mw3-hero-desktop.jpg');
                    background-size: cover; background-position: center;
                    font-family: 'Heebo', sans-serif; 
                    color: white; 
                    display: flex; flex-direction: column; align-items: center;
                }

                .header {
                    text-align: center; margin-bottom: 50px;
                    text-shadow: 0 10px 30px rgba(0,0,0,0.8);
                }
                .main-title {
                    font-family: 'Outfit', sans-serif;
                    font-size: 80px; font-weight: 900;
                    text-transform: uppercase; letter-spacing: 5px;
                    background: linear-gradient(to right, #ffffff, #a0a0a0);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                    margin: 0;
                }
                .sub-title {
                    font-size: 30px; font-weight: 500; color: #00e676;
                    text-transform: uppercase; letter-spacing: 3px;
                    margin-top: 10px;
                    background: rgba(0, 230, 118, 0.1);
                    padding: 5px 20px; border-radius: 20px;
                    display: inline-block;
                    border: 1px solid rgba(0, 230, 118, 0.3);
                }

                .table-container {
                    width: 100%;
                    display: flex; flex-direction: column; gap: 15px;
                }

                .row {
                    display: flex; align-items: center;
                    height: 120px;
                    background: rgba(20, 20, 20, 0.85);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 20px;
                    padding: 0 40px;
                    transition: all 0.2s;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                }

                /* Rank Styles */
                .row-1 { border: 2px solid #ffd700; background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), rgba(20, 20, 20, 0.9)); transform: scale(1.02); }
                .row-2 { border-left: 8px solid #c0c0c0; }
                .row-3 { border-left: 8px solid #cd7f32; }

                .cell-rank { width: 80px; display: flex; justify-content: center; }
                .rank-regular { font-size: 40px; font-weight: 700; color: #555; }
                .rank-1 { font-size: 50px; font-weight: 900; color: #ffd700; text-shadow: 0 0 20px rgba(255,215,0,0.6); }
                .rank-2 { font-size: 45px; font-weight: 900; color: #c0c0c0; }
                .rank-3 { font-size: 45px; font-weight: 900; color: #cd7f32; }

                .cell-player { flex: 1; display: flex; align-items: center; gap: 30px; margin-right: 30px; }
                .avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.1); }
                .row-1 .avatar { border-color: #ffd700; box-shadow: 0 0 20px rgba(255,215,0,0.3); }

                .name-box { display: flex; flex-direction: column; justify-content: center; }
                .name { font-size: 36px; font-weight: 700; color: white; line-height: 1.1; }
                .sub-name { font-size: 20px; font-weight: 400; color: #888; margin-top: 4px; }

                .cell-stat { width: 180px; text-align: center; }
                .stat-value { font-size: 40px; font-weight: 900; line-height: 1; }
                .stat-label { font-size: 14px; font-weight: 500; color: #666; letter-spacing: 2px; margin-top: 5px; }

                .text-green { color: #00e676; text-shadow: 0 0 15px rgba(0, 230, 118, 0.2); }
                .text-orange { color: #ff9100; }
                .text-blue { color: #2979ff; }

            </style>
        </head>
        <body>
            <div class="header">
                <div class="main-title">WARZONE ELITE</div>
                <div class="sub-title">${periodText}</div>
            </div>

            <div class="table-container">
                ${rows}
            </div>
        </body>
        </html>`;

        const height = 300 + (players.length * 135);
        return core.render(html, 1400, height, false);
    }

}

module.exports = new LeaderboardRenderer();