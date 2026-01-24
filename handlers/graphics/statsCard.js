const core = require('./core');
const path = require('path');

async function generateMatchCard(matches, summary) {
    const width = 1000;
    const height = 600;

    // Sort by Score/Damage
    matches.sort((a, b) => (b.damage || 0) - (a.damage || 0));

    // Calculate MVP
    const mvp = matches[0];

    // Generate Rows HTML
    const rowsHtml = matches.map((p, i) => {
        const isMvp = i === 0;
        const score = Math.floor((p.kills * 100) + (p.damage / 10)); // Calculate Score if missing

        let note = "";
        if (p.kills >= 10) note = "🔥 KILLER";
        else if (p.damage > 4000 && p.kills < 5) note = "🦅 SCAMMED";
        else if (p.kills === 0 && p.damage < 500) note = "💀 BOT";
        else note = "⚡ SOLDIER";

        return `
        <div class="row ${isMvp ? 'mvp-row' : ''}">
            <div class="rank">#${i + 1}</div>
            <div class="name">
                ${isMvp ? '👑 ' : ''}${p.username}
            </div>
            <div class="stat kills">${p.kills}</div>
            <div class="stat damage">${p.damage}</div>
            <div class="stat score">${score}</div>
            <div class="note ${p.kills >= 10 ? 'high-note' : ''}">${note}</div>
        </div>
        `;
    }).join('');

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;600;900&display=swap');
            
            body { 
                margin: 0; padding: 0; width: ${width}px; height: ${height}px;
                background: #09090b;
                background-image: radial-gradient(circle at 10% 10%, rgba(56, 189, 248, 0.1) 0%, transparent 40%),
                                  radial-gradient(circle at 90% 90%, rgba(139, 92, 246, 0.1) 0%, transparent 40%);
                font-family: 'Outfit', sans-serif;
                color: white;
                display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
                overflow: hidden;
            }

            .container {
                width: 90%; margin-top: 40px;
                display: flex; flex-direction: column; gap: 20px;
                z-index: 2;
            }

            /* Header */
            .header {
                display: flex; justify-content: space-between; align-items: flex-end;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 20px; margin-bottom: 10px;
            }
            .title h1 { margin: 0; font-size: 48px; font-weight: 900; letter-spacing: -1px; 
                background: linear-gradient(to right, #ffffff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .title span { font-size: 16px; color: #64748b; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; }
            
            .meta { text-align: right; }
            .date { font-size: 18px; color: #94a3b8; font-weight: 600; }
            .mode { font-size: 14px; color: #475569; background: #0f172a; padding: 5px 12px; border-radius: 20px; border: 1px solid #1e293b; margin-top: 5px; display: inline-block; }

            /* Table Header */
            .thead {
                display: grid; grid-template-columns: 0.5fr 2.5fr 1fr 1fr 1fr 1fr;
                padding: 0 20px; margin-bottom: 10px;
                font-size: 14px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
            }

            /* Rows */
            .row {
                display: grid; grid-template-columns: 0.5fr 2.5fr 1fr 1fr 1fr 1fr; align-items: center;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                padding: 16px 20px;
                margin-bottom: 10px;
                font-size: 20px; font-weight: 600;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }

            .row.mvp-row {
                background: linear-gradient(90deg, rgba(234, 179, 8, 0.1) 0%, rgba(234, 179, 8, 0.0) 100%);
                border: 1px solid rgba(234, 179, 8, 0.3);
                box-shadow: 0 0 20px rgba(234, 179, 8, 0.1);
            }

            .rank { color: #475569; font-weight: 900; }
            .mvp-row .rank { color: #fbbf24; }

            .name { display: flex; align-items: center; gap: 10px; color: #f1f5f9; }
            .mvp-row .name { color: #ffffff; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }

            .stat { font-family: 'Outfit', monospace; letter-spacing: -0.5px; }
            .kills { color: #4ade80; }
            .damage { color: #f87171; }
            .score { color: #60a5fa; font-weight: 900; }

            .note { font-size: 14px; font-weight: 700; background: #1e293b; color: #94a3b8; padding: 4px 10px; border-radius: 6px; text-align: center; width: fit-content; }
            .high-note { background: rgba(244, 63, 94, 0.2); color: #fb7185; }

            /* Footer */
            .footer {
                position: absolute; bottom: 30px; width: 100%; text-align: center;
                font-size: 14px; color: #334155; font-weight: 600; letter-spacing: 1px;
                text-transform: uppercase;
            }

        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="title">
                    <span>Shimon Analytics</span>
                    <h1>WARZONE REPORT</h1>
                </div>
                <div class="meta">
                    <div class="date">${new Date().toLocaleDateString('he-IL')}</div>
                    <div class="mode">Resurgence / Battle Royale</div>
                </div>
            </div>

            <div class="thead">
                <div>#</div>
                <div>Player</div>
                <div>Kills</div>
                <div>Damage</div>
                <div>Score</div>
                <div>Note</div>
            </div>

            ${rowsHtml}
        </div>

        <div class="footer">
            Generative AI Analysis • Gamers United Systems
        </div>
    </body>
    </html>
    `;

    return core.render(html, width, height);
}

module.exports = { generateMatchCard };
