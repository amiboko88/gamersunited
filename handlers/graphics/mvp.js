const core = require('./core');

class MVPRenderer {

    /**
     * מייצר תמונת הכרזה אומנותית ל-MVP
     * @param {Object} mvpData { name, avatar, stats: { voice, msgs }, score }
     */
    async generateCard(mvpData) {
        if (!mvpData) return null;

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap'); /* פונט מלכותי */

                * { box-sizing: border-box; }

                body {
                    margin: 0; padding: 0; width: 1200px; height: 1200px;
                    background: #000;
                    font-family: 'Outfit', sans-serif;
                    color: white;
                    display: flex; justify-content: center; align-items: center;
                    overflow: hidden;
                    position: relative;
                }

                /* רקע אומנותי */
                .background {
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    background: radial-gradient(circle at 50% 30%, #4a3b00 0%, #000000 70%);
                    z-index: 0;
                    opacity: 0.8;
                }
                
                .particles {
                    position: absolute; width: 100%; height: 100%;
                    background-image: url('https://cdn.discordapp.com/attachments/1111111111/1111111111/dust_particles.png'); /* Placeholder if needed, or CSS dots */
                    opacity: 0.4; mix-blend-mode: screen;
                    z-index: 1;
                }

                /* טבעת זהב מסתובבת (אפקט ויזואלי) */
                .ring {
                    position: absolute; top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    width: 700px; height: 700px;
                    border: 2px solid rgba(255, 215, 0, 0.1);
                    border-radius: 50%;
                    z-index: 1;
                }
                .ring::before {
                    content: ''; position: absolute; top: -10px; left: 50%;
                    width: 20px; height: 20px; background: #ffd700;
                    border-radius: 50%; box-shadow: 0 0 20px #ffd700;
                }

                /* קונטיינר ראשי */
                .card-content {
                    position: relative; z-index: 10;
                    display: flex; flex-direction: column; align-items: center;
                    text-align: center;
                    width: 100%;
                }

                /* כתר */
                .crown-icon {
                    font-size: 120px;
                    filter: drop-shadow(0 0 30px #ffd700);
                    margin-bottom: -40px; z-index: 20;
                    animation: float 3s ease-in-out infinite;
                }

                /* תמונת פרופיל */
                .avatar-container {
                    position: relative;
                    margin: 20px 0;
                }
                
                .avatar {
                    width: 350px; height: 350px;
                    border-radius: 50%;
                    border: 10px solid #ffd700;
                    box-shadow: 0 0 100px rgba(255, 215, 0, 0.5), inset 0 0 50px rgba(0,0,0,0.5);
                    object-fit: cover;
                }

                /* שם המנצח */
                .name {
                    font-family: 'Cinzel', serif; /* מראה מלכותי */
                    font-size: 110px; font-weight: 900;
                    color: #fff;
                    text-shadow: 0 10px 30px rgba(0,0,0,0.8);
                    margin: 20px 0 10px;
                    letter-spacing: 5px;
                    background: linear-gradient(to bottom, #ffd700, #b8860b);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                }

                /* כותרת משנית */
                .title {
                    font-size: 32px; font-weight: 700;
                    letter-spacing: 12px;
                    color: rgba(255, 255, 255, 0.6);
                    text-transform: uppercase;
                    margin-bottom: 50px;
                }

                /* סטטיסטיקות */
                .stats-row {
                    display: flex; gap: 80px;
                    background: rgba(0,0,0,0.6);
                    padding: 30px 60px;
                    border-radius: 50px;
                    border: 1px solid rgba(255, 215, 0, 0.3);
                    backdrop-filter: blur(10px);
                }

                .stat-item { display: flex; flex-direction: column; align-items: center; }
                .stat-value { font-size: 60px; font-weight: 900; color: #fff; line-height: 1; }
                .stat-label { font-size: 20px; color: #ffd700; font-weight: 700; margin-top: 10px; letter-spacing: 2px; }

                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-20px); }
                }

            </style>
        </head>
        <body>
            <div class="background"></div>
            <div class="ring"></div>
            
            <div class="card-content">
                <div class="crown-icon">👑</div>
                
                <div class="avatar-container">
                    <img src="${mvpData.avatar}" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                </div>

                <div class="name">${mvpData.name}</div>
                <div class="title">LEADERBOARD MVP</div>

                <div class="stats-row">
                    <div class="stat-item">
                        <div class="stat-value">${mvpData.stats.voice}h</div>
                        <div class="stat-label">VOICE HOURS</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${mvpData.stats.msgs}</div>
                        <div class="stat-label">MESSAGES</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${mvpData.score.toLocaleString()}</div>
                        <div class="stat-label">TOTAL SCORE</div>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        // רינדור ריבועי גדול (1200x1200) לאינסטגרם/דיסקורד
        return core.render(html, 1200, 1200, false);
    }
}

module.exports = new MVPRenderer();
