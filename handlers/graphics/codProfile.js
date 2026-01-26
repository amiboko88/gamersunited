const core = require('./core');

class CodProfileRenderer {

    async generateProfileCard(username, avatarUrl, stats, periodText = "WEEKLY") {
        // stats: { matches, kills, damage, score, kdr, bestPlacement }

        const width = 1200;
        const height = 600;

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;500;700;900&family=Orbitron:wght@700;900&display=swap');
                
                * { box-sizing: border-box; }
                
                body {
                    margin: 0; padding: 0;
                    width: ${width}px; height: ${height}px;
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'Heebo', sans-serif;
                    background: #000;
                    background-image: url('https://www.callofduty.com/content/dam/atvi/callofduty/cod-touchui/mw3/home/hero/mw3-hero-desktop.jpg');
                    background-size: cover; background-position: center;
                    overflow: hidden;
                }

                .card {
                    width: 1100px; height: 500px;
                    background: rgba(10, 10, 12, 0.85);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 40px;
                    display: flex;
                    position: relative;
                    box-shadow: 0 0 50px rgba(0,0,0,0.8);
                    border-left: 10px solid #ffd700;
                }

                /* Left Side - Avatar & Identity */
                .sidebar {
                    width: 350px;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    border-left: 1px solid rgba(255,255,255,0.05); /* RTL flipped visually */
                    background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent);
                    position: relative;
                }
                
                .avatar {
                    width: 200px; height: 200px;
                    border-radius: 50%;
                    border: 5px solid #ffd700;
                    box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
                    object-fit: cover;
                }

                .username {
                    margin-top: 20px;
                    font-size: 40px; font-weight: 900; color: #fff;
                    text-transform: uppercase;
                    text-align: center;
                    line-height: 1;
                    max-width: 300px;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }

                .tag {
                    margin-top: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 5px 20px; border-radius: 20px;
                    font-size: 18px; color: #aaa; letter-spacing: 2px;
                }

                /* Right Side - Stats Grid */
                .content {
                    flex: 1;
                    padding: 40px 60px;
                    display: flex; flex-direction: column;
                }

                .header {
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 40px;
                    border-bottom: 2px solid rgba(255,255,255,0.1);
                    padding-bottom: 20px;
                }
                
                .title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 48px; color: white; letter-spacing: 5px;
                    text-shadow: 0 0 20px rgba(255,255,255,0.3);
                }
                .period {
                    font-size: 24px; color: #00e676; font-weight: 700;
                    text-transform: uppercase; letter-spacing: 3px;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 30px;
                }

                .stat-box {
                    background: rgba(255,255,255,0.03);
                    border-radius: 20px;
                    padding: 20px 30px;
                    border: 1px solid rgba(255,255,255,0.05);
                    display: flex; flex-direction: column; justify-content: center;
                }

                .stat-value {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 60px; font-weight: 900; color: #fff;
                    line-height: 1;
                }
                .stat-label {
                    font-size: 18px; font-weight: 500; color: #888;
                    margin-top: 5px; letter-spacing: 2px;
                }

                /* Colors */
                .val-kd { color: #ffd700; text-shadow: 0 0 20px rgba(255,215,0,0.4); }
                .val-kills { color: #00e676; }
                .val-dmg { color: #ff3d00; }
                .val-matches { color: #2979ff; }

            </style>
        </head>
        <body>
            <div class="card">
                <div class="sidebar">
                    <img src="${avatarUrl}" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="username">${username}</div>
                    <div class="tag">OPERATOR</div>
                </div>
                <div class="content">
                    <div class="header">
                        <div class="title">WARZONE</div>
                        <div class="period">${periodText}</div>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-value val-kd">${stats.kdr}</div>
                            <div class="stat-label">K/D RATIO</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value val-kills">${stats.kills.toLocaleString()}</div>
                            <div class="stat-label">TOTAL KILLS</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value val-dmg">${(stats.damage / 1000).toFixed(1)}k</div>
                            <div class="stat-label">DAMAGE</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value val-matches">${stats.matches}</div>
                            <div class="stat-label">MATCHES</div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        return core.render(html, width, height, false);
    }
}

module.exports = new CodProfileRenderer();
