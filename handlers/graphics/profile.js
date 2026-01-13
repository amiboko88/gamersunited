// 📁 handlers/graphics/profile.js
const core = require('./core');

class ProfileRenderer {

    /**
     * מחשב את ה-XP הדרוש לרמה הבאה (לצורך הבר הגרפי)
     */
    _getNextLevelXp(level) {
        return 5 * (level ** 2) + 50 * level + 100;
    }

    async generateLevelUpCard(username, level, xp, avatarUrl, rankName = "GAMER") {
        // חישוב אחוז התקדמות
        const nextLevelXp = this._getNextLevelXp(level);
        const prevLevelXp = this._getNextLevelXp(level - 1);

        // XP בתוך הרמה הנוכחית
        const currentLevelProgress = xp - prevLevelXp;
        const levelRange = nextLevelXp - prevLevelXp;

        let progressPercent = Math.floor((currentLevelProgress / levelRange) * 100);
        if (progressPercent > 100) progressPercent = 100;
        if (progressPercent < 0) progressPercent = 0;

        // עיצוב פרימיום חדש (Glassmorphism & Neon)
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                
                body {
                    margin: 0; padding: 0;
                    width: 800px; height: 300px;
                    background: transparent;
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'Outfit', sans-serif;
                }

                .card {
                    width: 760px; height: 260px;
                    background: rgba(20, 20, 25, 0.85);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 24px;
                    position: relative;
                    display: flex;
                    align-items: center;
                    padding: 0 50px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                    overflow: hidden;
                    backdrop-filter: blur(20px);
                }

                /* רקע זוהר */
                .glow-bg {
                    position: absolute; width: 400px; height: 400px;
                    background: radial-gradient(circle, rgba(255,0,85,0.15) 0%, transparent 70%);
                    top: -100px; right: -100px; z-index: 0;
                }

                .glow-bg-2 {
                    position: absolute; width: 300px; height: 300px;
                    background: radial-gradient(circle, rgba(0,255,255,0.1) 0%, transparent 70%);
                    bottom: -50px; left: -50px; z-index: 0;
                }

                .avatar-wrapper {
                    position: relative;
                    width: 160px; height: 160px;
                    margin-right: 40px;
                    z-index: 2;
                }

                .avatar {
                    width: 100%; height: 100%;
                    border-radius: 50%;
                    border: 4px solid #fff;
                    object-fit: cover;
                    box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
                }

                .rank-badge {
                    position: absolute; bottom: 0; right: 0;
                    background: linear-gradient(45deg, #ff0055, #ff5500);
                    color: white;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-weight: 800;
                    font-size: 14px;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    border: 2px solid #1a1a1a;
                    box-shadow: 0 5px 15px rgba(255, 0, 85, 0.4);
                }

                .content { flex: 1; z-index: 2; color: white; }

                .header { margin-bottom: 25px; }
                .username { font-size: 48px; font-weight: 900; line-height: 1; margin-bottom: 5px; text-shadow: 0 2px 10px rgba(0,0,0,0.3); }
                .subtitle { color: #888; font-size: 18px; font-weight: 500; letter-spacing: 1px; }

                .stats-container { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 10px; }
                .xp-text { font-size: 20px; font-weight: 700; color: #ccc; }
                .xp-text span { color: #fff; }
                .level-text { font-size: 24px; font-weight: 900; color: #00ffff; }

                .progress-bg {
                    width: 100%; height: 14px;
                    background: rgba(255,255,255,0.08);
                    border-radius: 7px;
                    overflow: hidden;
                    position: relative;
                }

                .progress-fill {
                    height: 100%; width: ${progressPercent}%;
                    background: linear-gradient(90deg, #00ffff, #0066ff);
                    border-radius: 7px;
                    box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
                }

            </style>
        </head>
        <body>
            <div class="card">
                <div class="glow-bg"></div>
                <div class="glow-bg-2"></div>
                
                <div class="avatar-wrapper">
                    <img src="${avatarUrl}" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="rank-badge">${rankName}</div>
                </div>
                
                <div class="content">
                    <div class="header">
                        <div class="username">${username}</div>
                        <div class="subtitle">MEMBER PROFILE</div>
                    </div>

                    <div class="stats-container">
                        <div class="xp-text"><span>${xp.toLocaleString()}</span> / ${nextLevelXp.toLocaleString()} XP</div>
                        <div class="level-text">LEVEL ${level}</div>
                    </div>

                    <div class="progress-bg">
                        <div class="progress-fill"></div>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        return core.render(html, 800, 300);
    }
}

module.exports = new ProfileRenderer();