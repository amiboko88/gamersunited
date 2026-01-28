const core = require('./core');

class NewsCardRenderer {

    async generateNewsCard(item) {
        // ... (Existing implementation kept for backwards compatibility)
        return this.generatePatchReport(item); // Redirecting to new report style for testing
    }

    async generatePatchReport(data) {
        // data: { title, summary, date, sections: [ { title: "Fixes", content: ["..."], type: "fixes" }, { title: "Weapons", content: ["..."], type: "buffs" } ] }

        const width = 1200;

        // Dynamic Height Calculation
        let totalLines = 0;
        const sections = data.sections || [];
        sections.forEach(s => {
            totalLines += 3; // Title + Padding
            if (Array.isArray(s.content)) totalLines += s.content.length;
            else totalLines += 5; // Text block approx
        });

        const contentHeight = totalLines * 50; // Approx px per line
        const headerFooterHeight = 600;
        const height = Math.max(1600, contentHeight + headerFooterHeight);

        const themeColor = '#00e676'; // Warzone Green
        const bgImage = 'https://www.callofduty.com/content/dam/atvi/callofduty/cod-touchui/mw3/home/hero/mw3-hero-desktop.jpg';

        // Construct HTML Loop for Sections
        let sectionsHtml = '';

        // Legacy Summary Fallback
        if (!data.sections && (data.aiSummary || data.summary)) {
            sections.push({ title: "HIGHLIGHTS", content: (data.aiSummary || data.summary).split('<br>').map(s => s.trim()), type: 'highlights' });
        }

        sections.forEach(sec => {
            let listItems = '';
            let sectionClass = '';

            // Determine Class based on Type
            if (sec.type === 'buffs') sectionClass = 'buff-section';
            else if (sec.type === 'nerfs') sectionClass = 'nerf-section';
            else sectionClass = 'normal-section';

            if (Array.isArray(sec.content)) {
                sec.content.forEach(line => {
                    // Clean line (remove previous manual tags if any)
                    const cleanLine = line.replace(/\[Buff\]/g, '').replace(/\[Nerf\]/g, '').trim();
                    listItems += `<li>${cleanLine}</li>`;
                });
            } else {
                listItems = `<div class="text-block">${sec.content}</div>`;
            }

            sectionsHtml += `
            <div class="report-section ${sectionClass}">
                <div class="section-title">${sec.title}</div>
                <ul class="section-list">
                    ${listItems}
                </ul>
            </div>`;
        });

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;700;900&display=swap');
                
                * { box-sizing: border-box; }
                
                body {
                    margin: 0; padding: 0;
                    width: ${width}px;
                    min-height: 1600px; /* Base Height */
                    font-family: 'Heebo', sans-serif;
                    background: #111;
                    color: #fff;
                    display: flex; flex-direction: column;
                    border: 5px solid ${themeColor};
                }

                .header {
                    height: 350px;
                    flex-shrink: 0;
                    background-image: url('${bgImage}');
                    background-size: cover; background-position: center;
                    position: relative;
                    display: flex; flex-direction: column; justify-content: flex-end;
                    padding: 40px;
                }
                
                .overlay {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    background: linear-gradient(0deg, #111 0%, rgba(0,0,0,0.6) 100%);
                }

                .header-content {
                    position: relative; z-index: 2;
                    text-align: right;
                }

                .badge {
                    background: ${themeColor}; color: #000;
                    padding: 5px 15px; font-weight: 900; font-size: 24px;
                    display: inline-block; margin-bottom: 15px;
                    text-transform: uppercase;
                }

                .main-title {
                    font-size: 80px; font-weight: 900; line-height: 0.9;
                    text-transform: uppercase;
                    text-shadow: 0 4px 20px rgba(0,0,0,0.8);
                }

                .date-row {
                    font-size: 32px; color: #aaa; margin-top: 10px; font-weight: 300;
                }

                .body-content {
                    flex: 1;
                    padding: 50px;
                    background: #111;
                    /* Texture overlay */
                    background-image: radial-gradient(circle at 50% 50%, #222 1px, transparent 1px);
                    background-size: 20px 20px;
                }

                .report-section {
                    margin-bottom: 40px;
                    background: rgba(255,255,255,0.03);
                    padding: 25px;
                    border-radius: 10px;
                    border-right: 5px solid #555; /* Default Neutral */
                }

                .section-title {
                    font-size: 42px; font-weight: 900; color: #eee;
                    margin-bottom: 20px; text-transform: uppercase;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    padding-bottom: 10px;
                }

                .section-list {
                    list-style: none; padding: 0; margin: 0;
                }

                .section-list li {
                    font-size: 32px; margin-bottom: 12px;
                    display: flex; align-items: center;
                    font-weight: 500;
                }

                /* --- TYPE BASED STYLING --- */
                
                /* Buffs */
                .buff-section { border-right-color: #81c784; background: rgba(129, 199, 132, 0.05); }
                .buff-section .section-title { color: #81c784; }
                .buff-section li::before { 
                    content: '+'; 
                    color: #000; background: #81c784;
                    font-weight: 900; width: 30px; height: 30px;
                    display: flex; justify-content: center; align-items: center;
                    border-radius: 50%; margin-left: 15px; font-size: 24px;
                }

                /* Nerfs */
                .nerf-section { border-right-color: #e57373; background: rgba(229, 115, 115, 0.05); }
                .nerf-section .section-title { color: #e57373; }
                .nerf-section li::before { 
                    content: '-'; 
                    color: #fff; background: #e57373;
                    font-weight: 900; width: 30px; height: 30px;
                    display: flex; justify-content: center; align-items: center;
                    border-radius: 50%; margin-left: 15px; font-size: 24px;
                }

                /* Fixes / Neutral */
                .normal-section li::before {
                    content: '•'; color: #777; margin-left: 15px; font-weight: bold;
                }
                
                /* Auto-Scale Text for Long Lines (Bug Fixes) */
                .normal-section li { font-size: 28px; line-height: 1.3; }

                .footer {
                    padding: 30px; text-align: center;
                    font-size: 24px; color: #444;
                    border-top: 1px solid #333;
                    flex-shrink: 0;
                }

            </style>
        </head>
        <body>
            <div class="header">
                <div class="overlay"></div>
                <div class="header-content">
                    <div class="badge">PATCH NOTES</div>
                    <div class="main-title">${data.title}</div>
                    <div class="date-row">${data.date}</div>
                </div>
            </div>

            <div class="body-content">
                ${sectionsHtml}
            </div>

            <div class="footer"> GENERATED BY GAMERS UNITED BOT </div>
        </body>
        </html>`;

        // TRUE arg enables fullPage rendering (Auto-Height)
        return core.render(html, width, 1600, true);
    }
}

module.exports = new NewsCardRenderer();
