const core = require('./core');
const path = require('path');
const fs = require('fs');

class ShabbatCardRenderer {

    async generateCard(type, data) {
        // data = { parasha, time, exitTime, cities: [{name, time}...], customText }
        const width = 1200;
        const height = 1200; // High Res Square

        // Load Logo (OnlyG)
        const logoPath = path.join(__dirname, '../../assets/onlyg.png');
        let logoBase64 = '';
        if (fs.existsSync(logoPath)) {
            logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
        }

        // Themes - Premium Dark Mode
        const theme = type === 'entry' ? {
            bg: 'linear-gradient(135deg, #1a1a1a 0%, #000000 100%)', // Pure Dark
            accent: '#D4AF37', // Metallic Gold
            glow: 'rgba(212, 175, 55, 0.3)',
            icon: '🕯️'
        } : {
            bg: 'linear-gradient(135deg, #0f172a 0%, #020617 100%)', // Dark Navy/Slate
            accent: '#38bdf8', // Cyan/Blue
            glow: 'rgba(56, 189, 248, 0.3)',
            icon: '🍷'
        };

        const otherCitiesHtml = data.cities ? data.cities.map(c => `
            <div class="city-item">
                <span class="city-name">${c.name}</span>
                <span class="city-time">${c.time}</span>
            </div>
        `).join('') : '';

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;700;900&family=Assistant:wght@600;800&display=swap');
                
                body {
                    margin: 0; padding: 0;
                    width: ${width}px; height: ${height}px;
                    font-family: 'Heebo', sans-serif;
                    background: ${theme.bg};
                    display: flex; justify-content: center; align-items: center;
                    color: white;
                }

                /* Background Pattern Overlay */
                body::before {
                    content: '';
                    position: absolute; top:0; left:0; width:100%; height:100%;
                    background-image: radial-gradient(${theme.glow} 1px, transparent 1px);
                    background-size: 50px 50px;
                    opacity: 0.2;
                    z-index: -1;
                }

                .card-container {
                    width: 1080px; height: 1080px;
                    display: flex; flex-direction: column;
                    align-items: center;
                    justify-content: space-between;
                    padding: 80px 40px;
                    box-sizing: border-box;
                    background: rgba(20, 20, 20, 0.6);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 40px;
                    box-shadow: 0 40px 100px -20px rgba(0,0,0,0.8);
                    position: relative;
                    backdrop-filter: blur(40px);
                }

                /* Header */
                .header-section {
                    display: flex; flex-direction: column; align-items: center;
                    width: 100%;
                    margin-bottom: 10px; /* Reduced from 20px */
                    flex-shrink: 0;
                }

                .logo {
                    width: ${type === 'exit' ? '380px' : '280px'}; /* Larger for Exit, smaller for Entry to save space */
                    height: auto;
                    filter: drop-shadow(0 0 35px ${theme.glow});
                    margin-bottom: ${type === 'exit' ? '10px' : '20px'}; /* Tighter spacing */
                }

                .main-title {
                    font-size: 100px; /* Reduced from 110px */
                    font-weight: 900;
                    margin: 0; line-height: 1;
                    letter-spacing: -2px;
                    background: linear-gradient(to bottom, #ffffff, #aaaaaa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    text-transform: uppercase;
                    padding-bottom: 10px;
                }

                /* Content Center */
                .content-section {
                    flex-grow: 1;
                    width: 100%;
                    display: flex; flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding-top: ${type === 'exit' ? '0px' : '10px'}; /* Remove top padding for exit */
                }

                /* >>> ENTRY SPECIFIC <<< */
                .entry-time-wrapper {
                    display: flex; flex-direction: column; align-items: center;
                    margin-bottom: 20px; /* Reduced from 40px */
                }
                
                .time-label {
                    font-size: 28px; /* Reduced */
                    font-weight: 300; letter-spacing: 2px;
                    text-transform: uppercase; opacity: 0.8; margin-bottom: 5px;
                }

                .huge-time {
                    font-size: 200px; /* Reduced from 250px to save space */
                    font-weight: 800;
                    font-family: 'Assistant', sans-serif;
                    line-height: 0.85;
                    color: ${theme.accent};
                    text-shadow: 0 0 80px ${theme.glow};
                    letter-spacing: -10px;
                    margin: -5px 0;
                }

                .exit-time-badge {
                    margin-top: 20px; /* Reduced from 30px */
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 10px 40px; /* Reduced padding */
                    border-radius: 50px;
                    font-size: 32px; /* Reduced */
                    font-weight: 300;
                    display: flex; align-items: center; gap: 15px;
                }
                
                .exit-time-badge strong {
                    font-weight: 700; color: white;
                }

                .observance-tag {
                    margin-top: 20px;
                    font-size: 22px; opacity: 0.5; font-weight: 300;
                    display: flex; align-items: center; gap: 10px;
                }

                .parasha-tag {
                    position: absolute; top: 40px; right: 40px; /* Moved up */
                    font-size: 24px; font-weight: 700;
                    background: ${theme.accent};
                    color: black;
                    padding: 8px 25px;
                    border-radius: 100px;
                    box-shadow: 0 10px 30px ${theme.glow};
                }

                /* >>> EXIT SPECIFIC <<< */
                .exit-content {
                    display: flex; flex-direction: column; align-items: center;
                    width: 100%;
                    margin-top: 0px; /* Removed top margin */
                }

                .shavua-tov-title {
                    font-size: 180px; /* Bigger */
                    font-weight: 800;
                    line-height: 1.1;
                    margin-bottom: 0px; /* Tight */
                    background: linear-gradient(to bottom, #ffffff, #dddddd);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    filter: drop-shadow(0 10px 30px rgba(0,0,0,0.5));
                    padding: 0 20px;
                }

                .exit-subtitle {
                    font-size: 50px; font-weight: 300;
                    color: ${theme.accent};
                    margin-bottom: 40px; /* Reduced from 60 */
                    letter-spacing: 1px;
                }

                .ai-box {
                    width: 90%;
                    max-width: 950px;
                    background: rgba(0,0,0,0.3);
                    border-left: 12px solid ${theme.accent};
                    padding: 35px;
                    border-radius: 0 30px 30px 0;
                    text-align: right;
                    margin-bottom: 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                }

                .ai-text {
                    font-size: 48px; font-weight: 500; line-height: 1.3;
                    color: #ffffff;
                }

                /* Footer Grid */
                .cities-footer {
                    display: flex; justify-content: space-evenly;
                    width: 100%;
                    border-top: 1px solid rgba(255,255,255,0.1);
                    padding-top: 30px; /* Reduced */
                    margin-top: auto;
                    padding-bottom: 10px; /* Safety padding */
                }

                .city-item {
                    display: flex; flex-direction: column; align-items: center;
                }
                .city-name { font-size: 24px; opacity: 0.6; margin-bottom: 5px; }
                .city-time { font-size: 45px; font-weight: 700; color: white; font-family: 'Assistant', sans-serif;}

                .brand-footer {
                    position: absolute; bottom: 20px;
                    font-size: 16px; opacity: 0.3; letter-spacing: 3px; text-transform: uppercase;
                }

            </style>
        </head>
        <body>
            <div class="card-container">
                
                <!-- Parasha Tag (Entry Only) -->
                ${type === 'entry' ? `<div class="parasha-tag">פרשת ${data.parasha}</div>` : ''}

                <!-- Header: Logo -->
                <div class="header-section">
                    <img src="${logoBase64}" class="logo" />
                    ${type === 'entry' ? '<div class="main-title">שבת שלום</div>' : ''}
                </div>

                <!-- Main Content -->
                <div class="content-section">
                    
                    <!-- ENTRY LAYOUT -->
                    ${type === 'entry' ? `
                        <div class="entry-time-wrapper">
                            <span class="time-label">כניסת השבת (ת"א)</span>
                            <div class="huge-time">${data.time}</div>
                        </div>

                        <div class="exit-time-badge">
                            <span>צאת השבת:</span>
                            <strong>${data.exitTime || '--:--'}</strong>
                        </div>

                        <div class="observance-tag">
                            🤖 שמעון שומר שבת
                        </div>
                    ` : ''}

                    <!-- EXIT LAYOUT -->
                    ${type === 'exit' ? `
                        <div class="exit-content">
                            <div class="shavua-tov-title">שבוע טוב!</div>
                            <div class="exit-subtitle">בשורות טובות גיימרים יקרים</div>
                            
                            <div class="ai-box">
                                <div class="ai-text">${data.customText || "יאללה חוזרים ללובי..."}</div>
                            </div>
                        </div>
                    ` : ''}

                </div>

                <!-- Footer: Cities (Entry) Or Spacer (Exit) -->
                ${type === 'entry' && data.cities ? `
                    <div class="cities-footer">
                        ${otherCitiesHtml}
                    </div>
                ` : '<div style="flex-grow:0.5;"></div>'}

                <div class="brand-footer">Gamers United Community</div>
            </div>
        </body>
        </html>`;

        return core.render(html, width, height, false);
    }
}

module.exports = new ShabbatCardRenderer();
