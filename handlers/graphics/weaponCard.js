const core = require('./core');

class WeaponCardRenderer {

    /**
     * @param {string} title - e.g. "BF6 META BUILD"
     * @param {Object} weapon - { name, image, attachments: [{part, name}] }
     */
    async generateCard(title, weapon) {
        const width = 800;
        const height = 500;

        const attList = weapon.attachments ? weapon.attachments.map(a => `
            <div class="att-item">
                <span class="att-part">${a.part}</span>
                <span class="att-name">${a.name}</span>
            </div>
        `).join('') : '<div class="no-att">Base Weapon (No Attachments)</div>';

        const imgSrc = weapon.image || 'https://www.callofduty.com/content/dam/atvi/callofduty/cod-touchui/mw3/home/hero/mw3-hero-desktop.jpg';

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Teko:wght@300;600&family=Orbitron:wght@700&display=swap');
                
                body {
                    margin: 0; padding: 0;
                    width: ${width}px; height: ${height}px;
                    font-family: 'Teko', sans-serif;
                    background: #121215;
                    background-image: radial-gradient(circle at 50% 0%, rgba(255, 215, 0, 0.1) 0%, transparent 50%);
                    color: white;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }

                .card {
                    width: 760px; height: 460px;
                    background: rgba(30, 30, 35, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.05);
                    border-radius: 20px;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.8);
                }

                /* Accent Line */
                .card::before {
                    content: '';
                    position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
                    background: linear-gradient(180deg, #ffd700, #ff8c00);
                }

                /* Left Side: Image & Title */
                .left-panel {
                    flex: 1.2;
                    position: relative;
                    display: flex; flex-direction: column;
                    justify-content: center; align-items: center;
                    padding: 20px;
                    background: rgba(0,0,0,0.2);
                }

                .title {
                    position: absolute; top: 20px; left: 25px;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 24px; color: rgba(255,255,255,0.5);
                    letter-spacing: 2px;
                }

                .weapon-name {
                    font-size: 64px; font-weight: 600;
                    color: #fff;
                    text-transform: uppercase;
                    line-height: 1;
                    margin-bottom: 10px;
                    text-shadow: 0 0 20px rgba(255,215,0,0.4);
                    text-align: center;
                }

                .weapon-img {
                    width: 90%;
                    height: auto;
                    max-height: 200px;
                    object-fit: contain;
                    filter: drop-shadow(0 10px 20px rgba(0,0,0,0.8));
                    transform: rotate(-2deg);
                }

                /* Right Side: Attachments */
                .right-panel {
                    flex: 1;
                    padding: 30px;
                    display: flex; flex-direction: column;
                    justify-content: center;
                    background: rgba(255,255,255,0.02);
                }

                .att-header {
                    font-size: 20px; color: #ffd700;
                    margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);
                    padding-bottom: 5px; text-transform: uppercase;
                }

                .att-item {
                    display: flex; flex-direction: column;
                    margin-bottom: 12px;
                }
                
                .att-part {
                    font-size: 16px; color: #888;
                }
                
                .att-name {
                    font-size: 24px; color: #fff; line-height: 1;
                }

            </style>
        </head>
        <body>
            <div class="card">
                <div class="left-panel">
                    <div class="title">${title}</div>
                    <div class="weapon-name">${weapon.name}</div>
                    <img src="${imgSrc}" class="weapon-img">
                </div>
                <div class="right-panel">
                    <div class="att-header">Recommended Build</div>
                    ${attList}
                </div>
            </div>
        </body>
        </html>`;

        return core.render(html, width, height, false); // Standard render, no fullPage needed
    }
}

module.exports = new WeaponCardRenderer();
