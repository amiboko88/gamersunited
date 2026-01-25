const core = require('./core');

class CampaignRenderer {

    async generateInviteCard(userData) {
        if (!userData) return null;

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;700;900&display=swap');
                
                body {
                    margin: 0; padding: 0; width: 1000px; height: 600px;
                    background: #0f172a;
                    font-family: 'Outfit', sans-serif;
                    color: white;
                    display: flex; justify-content: center; align-items: center;
                    overflow: hidden;
                    position: relative;
                }

                /* Background Effects */
                .bg-gradient {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    background: radial-gradient(circle at 70% 30%, rgba(56, 189, 248, 0.15), transparent 60%),
                                radial-gradient(circle at 30% 70%, rgba(139, 92, 246, 0.15), transparent 60%);
                }
                
                .grid {
                    position: absolute; width: 200%; height: 200%;
                    background-image: 
                        linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
                    background-size: 40px 40px;
                    transform: perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px);
                    opacity: 0.5;
                }

                .container {
                    position: relative; z-index: 10;
                    display: flex; flex-direction: row; align-items: center; gap: 60px;
                    background: rgba(30, 41, 59, 0.6);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 30px;
                    padding: 50px 80px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }

                .left-col {
                    display: flex; flex-direction: column; align-items: center;
                }

                .avatar {
                    width: 200px; height: 200px;
                    border-radius: 50%;
                    border: 6px solid #fbbf24;
                    box-shadow: 0 0 40px rgba(251, 191, 36, 0.3);
                    object-fit: cover;
                }

                .name {
                    margin-top: 20px;
                    font-size: 42px; font-weight: 900;
                    text-transform: uppercase; letter-spacing: 2px;
                    background: linear-gradient(to right, #fbbf24, #f59e0b);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                }

                .rank {
                    font-size: 18px; color: #94a3b8; font-weight: 600;
                    margin-top: 5px;
                    background: rgba(0,0,0,0.3); padding: 5px 15px; border-radius: 20px;
                }

                .right-col {
                    display: flex; flex-direction: column; gap: 20px;
                }

                .title {
                    font-size: 24px; color: #e2e8f0; font-weight: 300;
                    border-left: 4px solid #3b82f6; padding-right: 15px;
                    line-height: 1.4;
                }

                .stats {
                    display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
                    margin-top: 20px;
                }

                .stat-box {
                    background: rgba(15, 23, 42, 0.5);
                    padding: 15px 25px;
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.05);
                }

                .val { font-size: 32px; font-weight: 700; color: white; }
                .label { font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }

                .footer {
                    margin-top: 20px; font-size: 16px; color: #94a3b8; font-style: italic;
                }

            </style>
        </head>
        <body>
            <div class="bg-gradient"></div>
            <div class="grid"></div>

            <div class="container">
                <div class="left-col">
                    <img src="${userData.avatar}" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="name">${userData.name}</div>
                    <div class="rank">LEGACY MEMBER</div>
                </div>

                <div class="right-col">
                    <div class="title">
                        האגדה מספרת שהיית אחד הטובים.<br>
                        הנתונים שלך עדיין שמורים אצלנו.
                    </div>

                    <div class="stats">
                        <div class="stat-box">
                            <div class="val">${userData.stats.voiceHours || '0'}h</div>
                            <div class="label">שעות דיבור</div>
                        </div>
                        <div class="stat-box">
                            <div class="val">${userData.level || 1}</div>
                            <div class="label">רמת פרופיל</div>
                        </div>
                    </div>

                    <div class="footer">
                        "הבית תמיד פתוח למי שזוכר מאיפה הוא בא."
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        return core.render(html, 1000, 600);
    }
}

module.exports = new CampaignRenderer();
