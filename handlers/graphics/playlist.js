// 📁 handlers/graphics/playlist.js
const core = require('./core');

class PlaylistRenderer {
    async generateImage(tracks) {
        const displayTracks = tracks.slice(0, 20); 
        const listItems = displayTracks.map((t, index) => `
            <div class="row">
                <div class="icon">🎵</div>
                <div class="info"><div class="name">${t.name}</div></div>
                <div class="number">#${index + 1}</div>
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
                body { margin: 0; padding: 40px; width: 800px; min-height: 600px; background: #121212; background-image: radial-gradient(circle at 100% 0%, #2a2a2a 0%, #121212 70%); font-family: 'Heebo', sans-serif; color: white; display: flex; flex-direction: column; align-items: center; }
                .header { text-align: center; margin-bottom: 30px; width: 100%; border-bottom: 2px solid #25D366; padding-bottom: 20px; }
                .title { font-size: 48px; font-weight: 900; color: #25D366; margin: 0; }
                .subtitle { font-size: 22px; color: #aaa; margin-top: 5px; }
                .list-container { width: 100%; display: flex; flex-direction: column; gap: 10px; }
                .row { display: flex; align-items: center; background: rgba(255,255,255,0.05); padding: 15px 25px; border-radius: 12px; }
                .row:nth-child(odd) { background: rgba(255,255,255,0.03); }
                .name { font-size: 20px; font-weight: bold; color: #eee; }
                .number { font-size: 24px; font-weight: 900; color: #555; margin-right: auto; }
            </style>
        </head>
        <body>
            <div class="header"><div class="title">SHIMON DJ</div><div class="subtitle">רשימת השירים בשרת</div></div>
            <div class="list-container">${listItems}</div>
        </body>
        </html>`;

        return core.render(html, 800, null, true);
    }
}

module.exports = new PlaylistRenderer();