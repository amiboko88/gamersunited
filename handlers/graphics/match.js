// 📁 handlers/graphics/match.js
const core = require('./core');

class MatchRenderer {
    async generateCard(p1Name, p1Score, p2Name, p2Score, potSize, status, p1Avatar, p2Avatar) {
        // Fallbacks
        const p1Img = p1Avatar || "https://cdn.discordapp.com/embed/avatars/1.png";
        const p2Img = p2Avatar || "https://cdn.discordapp.com/embed/avatars/2.png";

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Teko:wght@300;700&display=swap');
                body {
                    margin: 0; padding: 0;
                    width: 800px; height: 400px;
                    background: #000;
                    background-image: linear-gradient(45deg, #1a0b0b 25%, #0b0b1a 75%);
                    color: white;
                    font-family: 'Teko', sans-serif;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    border: 4px solid #333; box-sizing: border-box;
                }
                .top-bar { 
                    font-size: 30px; letter-spacing: 5px; color: #ff3333; text-shadow: 0 0 10px red; margin-bottom: 20px;
                    animation: pulse 1s infinite; text-transform: uppercase;
                }
                .arena { display: flex; align-items: center; width: 100%; justify-content: space-around; }
                .player { display: flex; flex-direction: column; align-items: center; width: 30%; }
                .avatar { 
                    width: 120px; height: 120px; border-radius: 50%; border: 5px solid white; 
                    box-shadow: 0 0 20px rgba(255,255,255,0.2); object-fit: cover;
                }
                .p-name { font-size: 40px; margin-top: 10px; text-transform: uppercase; }
                .score { font-size: 90px; line-height: 1; font-weight: bold; }
                .vs { font-size: 80px; font-style: italic; color: #555; }
                .pot-container {
                    margin-top: 20px; background: rgba(0,255,0,0.1); 
                    padding: 5px 40px; border-radius: 50px; border: 2px solid #00ff00;
                    display: flex; flex-direction: column; align-items: center;
                }
                .pot-label { font-size: 20px; color: #aaa; margin: 0; }
                .pot-value { font-size: 40px; color: #00ff00; text-shadow: 0 0 15px lime; line-height: 1; margin: 0; }
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
            </style>
        </head>
        <body>
            <div class="top-bar">🔴 ${status} 🔴</div>
            <div class="arena">
                <div class="player" style="color: #ff5555;">
                    <img src="${p1Img}" class="avatar" style="border-color: #ff5555;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/1.png'">
                    <div class="p-name">${p1Name}</div>
                    <div class="score">${p1Score}</div>
                </div>
                <div class="vs">VS</div>
                <div class="player" style="color: #5555ff;">
                    <img src="${p2Img}" class="avatar" style="border-color: #5555ff;" onerror="this.src='https://cdn.discordapp.com/embed/avatars/2.png'">
                    <div class="p-name">${p2Name}</div>
                    <div class="score">${p2Score}</div>
                </div>
            </div>
            <div class="pot-container">
                <div class="pot-label">TOTAL POT</div>
                <div class="pot-value">₪${potSize}</div>
            </div>
        </body>
        </html>`;

        // שימוש במנוע הליבה
        return core.render(html, 800, 400);
    }
}

module.exports = new MatchRenderer();