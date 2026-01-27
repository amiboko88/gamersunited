const core = require('./core');

class NewsCardRenderer {

    async generateNewsCard(item) {
        // item: { title, summary, date, link, type (optional) }

        const width = 1200;
        const height = 675; // 16:9 Aspect Ratio

        // Determine Theme based on Title/Type
        let themeColor = '#00e676'; // Default Green
        let bgImage = 'https://www.callofduty.com/content/dam/atvi/callofduty/cod-touchui/mw3/home/hero/mw3-hero-desktop.jpg';
        let category = "GAME UPDATE";

        const t = item.title.toLowerCase();
        if (t.includes('warzone') || t.includes('cod') || t.includes('call of duty')) {
            themeColor = '#00e676'; // Toxic Green
            category = "WARZONE INTEL";
            bgImage = 'https://www.callofduty.com/content/dam/atvi/callofduty/cod-touchui/mw3/home/hero/mw3-hero-desktop.jpg';
        } else if (t.includes('battlefield') || t.includes('bf6')) {
            themeColor = '#00bcd4'; // Cyan
            category = "BATTLEFIELD REPORT";
            bgImage = 'https://cdn.cloudflare.steamstatic.com/steam/apps/1517290/capsule_616x353.jpg';
        } else if (t.includes('nvidia') || t.includes('geforce')) {
            themeColor = '#76b900'; // Nvidia Green
            category = "NVIDIA DRIVER UPDATE";
            bgImage = 'https://images.nvidia.com/aem-dam/Solutions/geforce/news/geforce-rtx-40-series-announcement/geforce-rtx-40-series-announcement-article-social.jpg';
        } else if (t.includes('fifa') || t.includes('fc26')) {
            themeColor = '#fff'; // White
            category = "EA SPORTS FC";
            bgImage = 'https://media.contentapi.ea.com/content/dam/ea/fc/fc-25/common/fc25-hero-md-7.jpg.adapt.crop191x100.1200w.jpg';
        }

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;500;700;900&family=Orbitron:wght@700;900&display=swap');
                
                * { box-sizing: border-box; }
                
                body {
                    margin: 0; padding: 0;
                    width: ${width}px; height: ${height}px;
                    font-family: 'Heebo', sans-serif;
                    background: #000;
                    overflow: hidden;
                    display: flex;
                    position: relative;
                }

                .bg {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    background-image: url('${bgImage}');
                    background-size: cover; background-position: center;
                    filter: brightness(0.4) blur(0px);
                    z-index: 0;
                }

                .overlay {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    background: linear-gradient(90deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 50%, rgba(0,0,0,0.4) 100%);
                    z-index: 1;
                }

                .content {
                    position: relative; z-index: 2;
                    width: 75%;
                    padding: 60px;
                    display: flex; flex-direction: column; justify-content: center;
                    border-left: 10px solid ${themeColor};
                }

                .category {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 32px; font-weight: 900;
                    color: ${themeColor};
                    text-transform: uppercase;
                    letter-spacing: 5px;
                    margin-bottom: 20px;
                    display: flex; align-items: center;
                }

                .category::before {
                    content: '⚡'; margin-right: 15px;
                }

                .title {
                    font-size: 56px; font-weight: 900; color: #fff;
                    line-height: 1.1;
                    margin-bottom: 30px;
                    text-transform: uppercase;
                    text-shadow: 0 5px 15px rgba(0,0,0,0.5);
                }

                .summary {
                    font-size: 28px; line-height: 1.4; color: #ddd;
                    max-width: 90%;
                    margin-bottom: 40px;
                    background: rgba(255,255,255,0.05);
                    padding: 20px; border-radius: 10px;
                    border-left: 5px solid rgba(255,255,255,0.1);
                }

                .footer {
                    display: flex; align-items: center;
                    font-size: 24px; color: #888;
                    font-weight: 500;
                }
                
                .footer-item {
                    margin-right: 30px;
                    display: flex; align-items: center;
                }
                .icon { margin-right: 10px; }

                /* Glitch Effect on Title */
                .title span { color: ${themeColor}; }

            </style>
        </head>
        <body>
            <div class="bg"></div>
            <div class="overlay"></div>
            <div class="content">
                <div class="category">${category}</div>
                <div class="title">${item.title.replace('UPDATE:', '').replace('Update:', '')}</div>
                <div class="summary">${item.aiSummary || item.summary}</div>
                
                <div class="footer">
                    <div class="footer-item">
                        <span class="icon">📅</span> ${new Date().toLocaleDateString('he-IL')}
                    </div>
                    <div class="footer-item">
                        <span class="icon">🤖</span> Shimon Intel Systems
                    </div>
                </div>
            </div>
        </body>
        </html>`;

        return core.render(html, width, height, false);
    }
}

module.exports = new NewsCardRenderer();
