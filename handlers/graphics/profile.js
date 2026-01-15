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

        // עיצוב פרימיום למקסימום גודל (Full Bleed)
        // שינינו ל-1000x350 כדי לתת איכות גבוהה יותר ותחושת "Wide"
        const width = 1000;
        const height = 350;

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                
                body {
                    margin: 0; padding: 0;
                    width: ${width}px; height: ${height}px;
                    background: #141419; /* צבע רקע כהה קבוע למניעת שוליים לבנים */
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'Outfit', sans-serif;
                    overflow: hidden;
                }

                .card {
                    width: 100%; height: 100%;
                    background: linear-gradient(135deg, #1a1a20 0%, #0d0d10 100%);
                    position: relative;
                    display: flex;
                    align-items: center;
                    padding: 0 60px; /* ריווח פנימי */
                    box-sizing: border-box;
                }

                /* אפקטי רקע מתקדמים */
                .glow-blob {
                    position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.4;
                }
                .glow-1 { top: -50%; right: -20%; width: 600px; height: 600px; background: #ff0055; }
                .glow-2 { bottom: -50%; left: -10%; width: 500px; height: 500px; background: #00ffff; }

                /* שכבת זכוכית עליונה */
                .glass-overlay {
                    position: absolute; inset: 0;
                    background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 100%);
                    z-index: 1;
                }

                .avatar-wrapper {
                    position: relative;
                    width: 200px; height: 200px;
                    margin-right: 50px;
                    z-index: 5;
                    filter: drop-shadow(0 0 20px rgba(0,0,0,0.5));
                }

                .avatar {
                    width: 100%; height: 100%;
                    border-radius: 50%;
                    border: 6px solid rgba(255,255,255,0.9);
                    object-fit: cover;
                }

                .rank-badge {
                    position: absolute; bottom: 5px; right: 50%; transform: translateX(50%);
                    background: linear-gradient(90deg, #ff0055, #ff3300);
                    color: white;
                    padding: 5px 18px;
                    border-radius: 12px;
                    font-weight: 900;
                    font-size: 16px;
                    text-transform: uppercase;
                    box-shadow: 0 5px 15px rgba(255, 0, 85, 0.5);
                    border: 2px solid #141419;
                    white-space: nowrap;
                }

                .content { flex: 1; z-index: 5; color: white; display: flex; flex-direction: column; justify-content: center; }

                .header { margin-bottom: 20px; }
                .username { font-size: 64px; font-weight: 900; line-height: 1; margin-bottom: 5px; text-shadow: 0 5px 15px rgba(0,0,0,0.5); }
                .subtitle { color: rgba(255,255,255,0.5); font-size: 20px; font-weight: 600; letter-spacing: 4px; text-transform: uppercase; }

                .stats-row { 
                    display: flex; align-items: flex-end; justify-content: space-between; 
                    width: 100%; margin-bottom: 12px;
                }

                .level-badge {
                    font-size: 32px; font-weight: 900; 
                    color: #00ffff;
                    text-shadow: 0 0 20px rgba(0,255,255,0.6);
                }

                .xp-info { font-size: 22px; font-weight: 600; color: #888; }
                .xp-info span { color: #fff; }

                .progress-track {
                    width: 100%; height: 24px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 12px;
                    overflow: hidden;
                    position: relative;
                    border: 1px solid rgba(255,255,255,0.1);
                }

                .progress-bar {
                    height: 100%; width: ${progressPercent}%;
                    background: linear-gradient(90deg, #00ffff, #0055ff);
                    border-radius: 12px;
                    box-shadow: 0 0 30px rgba(0, 255, 255, 0.4);
                    position: relative;
                }
                
                /* אפקט ברק על הבר */
                .progress-bar::after {
                    content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
                    transform: skewX(-20deg) translateX(-100%);
                    animation: shine 2s infinite;
                }

                @keyframes shine { 100% { transform: skewX(-20deg) translateX(200%); } }

            </style>
        </head>
        <body>
            <div class="card">
                <div class="glow-blob glow-1"></div>
                <div class="glow-blob glow-2"></div>
                <div class="glass-overlay"></div>
                
                <div class="avatar-wrapper">
                    <img src="${avatarUrl}" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="rank-badge">${rankName}</div>
                </div>
                
                <div class="content">
                    <div class="header">
                        <div class="username">${username}</div>
                        <div class="subtitle">Level Up</div>
                    </div>

                    <div class="stats-row">
                        <div class="xp-info"><span>${xp.toLocaleString()}</span> / ${nextLevelXp.toLocaleString()} XP</div>
                        <div class="level-badge">LEVEL ${level}</div>
                    </div>

                    <div class="progress-track">
                        <div class="progress-bar"></div>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        return core.render(html, width, height); // רינדור בגודל המלא
    }
}

module.exports = new ProfileRenderer();