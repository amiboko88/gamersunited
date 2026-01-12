// 📁 handlers/graphics/profile.js
const core = require('./core');

class ProfileRenderer {
    
    /**
     * מחשב את ה-XP הדרוש לרמה הבאה (לצורך הבר הגרפי)
     */
    _getNextLevelXp(level) {
        return 5 * (level ** 2) + 50 * level + 100;
    }

    async generateLevelUpCard(username, level, xp, avatarUrl) {
        // חישוב אחוז התקדמות
        const nextLevelXp = this._getNextLevelXp(level);
        const prevLevelXp = this._getNextLevelXp(level - 1);
        
        // XP בתוך הרמה הנוכחית
        const currentLevelProgress = xp - prevLevelXp;
        const levelRange = nextLevelXp - prevLevelXp;
        
        let progressPercent = Math.floor((currentLevelProgress / levelRange) * 100);
        if (progressPercent > 100) progressPercent = 100;
        if (progressPercent < 0) progressPercent = 0; // הגנה לרמה 1

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;700&display=swap');
                
                body {
                    margin: 0; padding: 0;
                    width: 700px; height: 250px;
                    background: #050505;
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'Rajdhani', sans-serif;
                    color: white;
                    overflow: hidden;
                }

                .card {
                    width: 660px; height: 210px;
                    background: linear-gradient(135deg, rgba(20,20,20,0.9), rgba(10,10,20,0.95));
                    border: 2px solid #333;
                    border-radius: 20px;
                    position: relative;
                    display: flex;
                    align-items: center;
                    padding: 0 40px;
                    box-shadow: 0 0 30px rgba(0, 255, 255, 0.1);
                    overflow: hidden;
                }

                /* אפקט רקע טכנולוגי */
                .card::before {
                    content: ''; position: absolute; top: 0; right: 0;
                    width: 300px; height: 100%;
                    background: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,255,255,0.03) 10px, rgba(0,255,255,0.03) 20px);
                }

                .avatar-container {
                    position: relative;
                    width: 140px; height: 140px;
                    margin-right: 35px;
                }

                .avatar {
                    width: 100%; height: 100%;
                    border-radius: 50%;
                    border: 4px solid #00ffff;
                    object-fit: cover;
                    box-shadow: 0 0 25px rgba(0, 255, 255, 0.4);
                }

                .level-badge {
                    position: absolute; bottom: -10px; right: -10px;
                    background: #ff0055;
                    color: white;
                    padding: 5px 15px;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 18px;
                    box-shadow: 0 0 15px rgba(255, 0, 85, 0.6);
                    border: 2px solid #111;
                }

                .info {
                    flex: 1;
                    z-index: 2;
                }

                .title {
                    color: #00ffff;
                    font-size: 18px;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    margin-bottom: 5px;
                    text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
                }

                .username {
                    font-size: 42px;
                    font-weight: 700;
                    margin: 0;
                    line-height: 1;
                    text-shadow: 0 5px 15px rgba(0,0,0,0.5);
                }

                .progress-container {
                    margin-top: 25px;
                    width: 100%;
                }

                .progress-labels {
                    display: flex; justify-content: space-between;
                    font-size: 16px; color: #888; margin-bottom: 5px;
                    font-weight: 600;
                }

                .progress-bar-bg {
                    width: 100%; height: 12px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 6px;
                    overflow: hidden;
                }

                .progress-bar-fill {
                    height: 100%;
                    width: ${progressPercent}%;
                    background: linear-gradient(90deg, #00ffff, #0088ff);
                    box-shadow: 0 0 15px rgba(0, 255, 255, 0.6);
                    border-radius: 6px;
                    transition: width 1s ease-out;
                }

            </style>
        </head>
        <body>
            <div class="card">
                <div class="avatar-container">
                    <img src="${avatarUrl}" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="level-badge">${level}</div>
                </div>
                <div class="info">
                    <div class="title">Level Up!</div>
                    <div class="username">${username}</div>
                    
                    <div class="progress-container">
                        <div class="progress-labels">
                            <span>XP: ${xp.toLocaleString()}</span>
                            <span>Next: ${nextLevelXp.toLocaleString()}</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill"></div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        return core.render(html, 700, 250);
    }
}

module.exports = new ProfileRenderer();