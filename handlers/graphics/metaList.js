const core = require('./core');

class MetaListRenderer {

    /**
     * @param {string} title - e.g. "ABSOLUTE META", "BF6 LOADOUTS"
     * @param {Array} weapons - Array of { name, image, attachments: [{part, name}] }
     */
    async generateList(title, weapons) {

        const width = 1200;
        // Height not fixed, we use fullPage render
        const height = 800;

        // 1. Build Weapon Cards HTML
        const cardsHtml = weapons.map(w => {
            const attMap = w.attachments ? w.attachments.slice(0, 5).map(a => `
                <div class="att-row">
                    <span class="att-part">${a.part}:</span>
                    <span class="att-name">${a.name}</span>
                </div>
            `).join('') : '<div class="no-att">No Attachments Data</div>';

            const imgSrc = w.image || 'https://www.callofduty.com/content/dam/atvi/callofduty/cod-touchui/mw3/home/hero/mw3-hero-desktop.jpg';

            return `
            <div class="weapon-card">
                <div class="card-header">
                    <div class="weapon-name">${w.name}</div>
                </div>
                <div class="card-body">
                    <div class="weapon-img-container">
                        <img src="${imgSrc}" class="weapon-img" onerror="this.style.display='none'">
                    </div>
                    <div class="att-list">
                        ${attMap}
                    </div>
                </div>
            </div>
            `;
        }).join('');

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Teko:wght@300;500;700&family=Orbitron:wght@700;900&display=swap');
                
                * { box-sizing: border-box; }
                
                body {
                    margin: 0; padding: 20px; /* Reduced from 40px */
                    width: ${width}px;
                    font-family: 'Teko', sans-serif;
                    background: #0f0f12;
                    background-image: radial-gradient(circle at 10% 20%, rgba(255, 215, 0, 0.05) 0%, transparent 20%),
                                      radial-gradient(circle at 90% 80%, rgba(0, 230, 118, 0.05) 0%, transparent 20%);
                    color: white;
                }

                .container {
                    display: flex; flex-direction: column; align-items: center;
                }

                .main-title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 70px; /* Slightly smaller to prevent chop */
                    font-weight: 900;
                    color: #fff;
                    text-transform: uppercase;
                    margin-bottom: 30px;
                    letter-spacing: 8px;
                    text-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
                    border-bottom: 4px solid #ffd700;
                    padding-bottom: 5px;
                    text-align: center;
                    width: 100%;
                }

                .grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr); /* 2 Columns */
                    gap: 30px;
                    width: 100%;
                }

                .weapon-card {
                    background: rgba(30, 30, 35, 0.9);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 15px;
                    overflow: hidden;
                    display: flex; flex-direction: column;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    position: relative;
                }

                .weapon-card::before {
                    content: '';
                    position: absolute; top: 0; left: 0; width: 5px; height: 100%;
                    background: #ffd700;
                }

                .card-header {
                    background: rgba(0,0,0,0.4);
                    padding: 15px 25px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                .weapon-name {
                    font-size: 42px; font-weight: 700;
                    color: #ffd700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }

                .card-body {
                    padding: 20px;
                    display: flex;
                    align-items: center; /* row layout: img left, atts right */
                }

                .weapon-img-container {
                    width: 40%;
                    display: flex; align-items: center; justify-content: center;
                    margin-right: 20px;
                }

                .weapon-img {
                    width: 100%;
                    height: auto;
                    object-fit: contain;
                    filter: drop-shadow(0 0 10px rgba(0,0,0,0.8));
                }

                .att-list {
                    flex: 1;
                    background: rgba(0,0,0,0.3);
                    padding: 15px;
                    border-radius: 10px;
                }

                .att-row {
                    display: flex; justify-content: space-between;
                    margin-bottom: 5px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    padding-bottom: 2px;
                }
                .att-row:last-child { border: none; margin: 0; }

                .att-part {
                    color: #888; font-size: 20px; font-weight: 300;
                    text-transform: uppercase;
                }
                .att-name {
                    color: #fff; font-size: 22px; font-weight: 500;
                    text-align: right;
                }

                .no-att { color: #555; font-style: italic; font-size: 18px; }

            </style>
        </head>
        <body>
            <div class="container">
                <div class="main-title">${title}</div>
                <div class="grid">
                    ${cardsHtml}
                </div>
            </div>
        </body>
        </html>`;

        // Render full page to capture all cards
        return core.render(html, width, height, true);
    }
}

module.exports = new MetaListRenderer();
