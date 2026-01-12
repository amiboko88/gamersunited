// 📁 handlers/audio/render.js
const puppeteer = require('puppeteer');

class PlaylistRenderer {

    async generatePlaylistImage(tracks) {
        // לוקחים עד 20 שירים כדי שהתמונה לא תהיה ארוכה מדי
        const displayTracks = tracks.slice(0, 20); 
        
        const listItems = displayTracks.map((t, index) => `
            <div class="row">
                <div class="icon">🎵</div>
                <div class="info">
                    <div class="name">${t.name}</div>
                </div>
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

                body {
                    margin: 0;
                    padding: 40px;
                    width: 800px;
                    min-height: 600px;
                    background: #121212;
                    background-image: radial-gradient(circle at 100% 0%, #2a2a2a 0%, #121212 70%);
                    font-family: 'Heebo', sans-serif;
                    color: white;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    width: 100%;
                    border-bottom: 2px solid #25D366; /* ירוק וואטסאפ */
                    padding-bottom: 20px;
                }
                
                .title {
                    font-size: 48px;
                    font-weight: 900;
                    text-transform: uppercase;
                    color: #25D366;
                    text-shadow: 0 4px 15px rgba(37, 211, 102, 0.4);
                    margin: 0;
                }

                .subtitle {
                    font-size: 22px;
                    color: #aaa;
                    margin-top: 5px;
                }

                .list-container {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .row {
                    display: flex;
                    align-items: center;
                    background: rgba(255,255,255,0.05);
                    padding: 15px 25px;
                    border-radius: 12px;
                    border-left: 4px solid transparent;
                    transition: all 0.2s;
                }

                .row:nth-child(odd) { background: rgba(255,255,255,0.03); }

                .icon { font-size: 24px; margin-left: 15px; }
                
                .info { flex-grow: 1; }
                .name { font-size: 20px; font-weight: bold; color: #eee; }
                
                .number {
                    font-size: 24px;
                    font-weight: 900;
                    color: #555;
                }

                .footer {
                    margin-top: 40px;
                    font-size: 18px;
                    color: #666;
                    text-align: center;
                }

            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">SHIMON DJ</div>
                <div class="subtitle">רשימת השירים בשרת</div>
            </div>

            <div class="list-container">
                ${listItems}
            </div>

            <div class="footer">
                כדי לנגן, כתוב: "שמעון תנגן את [שם השיר]"
            </div>
        </body>
        </html>`;

        let browser = null;
        try {
            browser = await puppeteer.launch({ 
                headless: 'new', 
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 800, height: 1000, deviceScaleFactor: 2 });
            await page.setContent(html, { waitUntil: 'networkidle0' });
            
            const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
            await page.setViewport({ width: 800, height: bodyHeight, deviceScaleFactor: 2 });

            const buffer = await page.screenshot({ type: 'png', fullPage: true });
            return buffer;

        } catch (err) {
            console.error(`❌ [PlaylistRender] Error: ${err.message}`);
            return null;
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }
}

module.exports = new PlaylistRenderer();