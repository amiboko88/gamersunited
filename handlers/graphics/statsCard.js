const core = require('./core');
const path = require('path');

async function generateMatchCard(matches, options = {}) {
    const width = 1200; // Increased resolution

    // Dynamic Height: Base (Header/Pad) + Rows * Approx Row Height
    // 350px Base + 110px per row ensures room for everyone.
    const height = Math.max(700, 350 + (matches.length * 110));

    const { isAggregated, totalGames } = options;

    // Sort by Kills then Damage (User preference usually Kills)
    matches.sort((a, b) => (b.kills - a.kills) || (b.damage - a.damage));

    // Calculate MVP
    const mvp = matches[0];

    // Generate Rows HTML
    const rowsHtml = matches.map((p, i) => {
        const isMvp = i === 0;
        // Recalculate Score if missing (Aggregated stats might need re-calc)
        const score = p.score || Math.floor((p.kills * 100) + (p.damage / 10));

        let note = "";
        if (p.kills / (p.matches || 1) >= 10) note = "🔥 DEMON";
        else if (p.damage > 4000 && p.kills < 5) note = "🦅 SCAMMED";
        else if (p.kills === 0 && p.damage < 500) note = "💀 NPC";
        else note = "⚡ SOLDIER";

        if (p.matches > 1) note = `${p.matches} MAPS`;

        return `
        <div class="row ${isMvp ? 'mvp-row' : ''}">
            <div class="rank">#${i + 1}</div>
            <div class="name">
                ${isMvp ? '👑 ' : ''}${p.username}
            </div>
            <div class="stat kills">${p.kills}</div>
            <div class="stat damage">${p.damage}</div>
            <div class="stat score">${score}</div>
            <div class="note ${p.kills >= 15 ? 'high-note' : ''}">${note}</div>
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
                background: #020617; /* Deep Slate */
                background-image: 
                    linear-gradient(45deg, rgba(30, 41, 59, 0.4) 25%, transparent 25%, transparent 75%, rgba(30, 41, 59, 0.4) 75%, rgba(30, 41, 59, 0.4)),
                    linear-gradient(45deg, rgba(30, 41, 59, 0.4) 25%, transparent 25%, transparent 75%, rgba(30, 41, 59, 0.4) 75%, rgba(30, 41, 59, 0.4));
                background-size: 60px 60px;
                background-position: 0 0, 30px 30px;
                font-family: 'Outfit', sans-serif;
                color: white;
                display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
                position: relative;
            }
            
            /* Vignette */
            .overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: radial-gradient(circle, transparent 40%, #020617 100%);
                pointer-events: none; z-index: 1;
            }

            .container {
                width: 90%; margin-top: 50px;
                display: flex; flex-direction: column; gap: 20px;
                z-index: 2;
            }

            /* Header */
            .header {
                display: flex; justify-content: space-between; align-items: flex-end;
                border-bottom: 2px solid rgba(255,255,255,0.05);
                padding-bottom: 25px; margin-bottom: 15px;
            }
            .title h1 { margin: 0; font-size: 56px; font-weight: 900; letter-spacing: -2px; 
                text-transform: uppercase;
                background: linear-gradient(to right, #f8fafc, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .title span { font-size: 18px; color: #fbbf24; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; }
            
            .meta { text-align: right; }
            .date { font-size: 20px; color: #94a3b8; font-weight: 600; }
            .mode { 
                font-size: 16px; color: #e2e8f0; 
                background: rgba(30, 41, 59, 0.8); 
                padding: 6px 16px; border-radius: 30px; 
                border: 1px solid rgba(255,255,255,0.1); 
                margin-top: 8px; display: inline-block; 
                font-weight: bold;
                box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            }

            /* Table Header */
            .thead {
                display: grid; grid-template-columns: 0.5fr 3fr 1fr 1fr 1fr 1fr;
                padding: 0 25px; margin-bottom: 15px;
                font-size: 16px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
            }

            /* Rows */
            .row {
                display: grid; grid-template-columns: 0.5fr 3fr 1fr 1fr 1fr 1fr; align-items: center;
                background: rgba(30, 41, 59, 0.4);
                backdrop-filter: blur(10px);
                border-left: 4px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                padding: 20px 25px;
                margin-bottom: 12px;
                font-size: 24px; font-weight: 700;
                transition: transform 0.2s;
            }

            .row.mvp-row {
                background: linear-gradient(90deg, rgba(234, 179, 8, 0.15) 0%, rgba(30, 41, 59, 0.4) 100%);
                border-left: 4px solid #fbbf24;
                box-shadow: 0 10px 30px -5px rgba(251, 191, 36, 0.15);
            }

            .rank { color: #64748b; font-weight: 900; font-size: 28px; }
            .mvp-row .rank { color: #fbbf24; }

            .name { display: flex; align-items: center; gap: 15px; color: #f1f5f9; letter-spacing: -0.5px; }
            .mvp-row .name { color: #ffffff; text-shadow: 0 0 20px rgba(251, 191, 36, 0.3); }

            .stat { font-family: 'Outfit', monospace; letter-spacing: -1px; }
            .kills { color: #4ade80; text-shadow: 0 0 15px rgba(74, 222, 128, 0.2); }
            .damage { color: #f87171; }
            .score { color: #60a5fa; }

            .note { 
                font-size: 14px; font-weight: 800; 
                background: #0f172a; color: #94a3b8; 
                padding: 6px 12px; border-radius: 8px; 
                text-align: center; width: fit-content; border: 1px solid rgba(255,255,255,0.05);
            }
            .high-note { background: #be123c; color: white; border: none; box-shadow: 0 0 15px rgba(190, 18, 60, 0.5); }

        </style>
    </head>
    <body>
        <div class="overlay"></div>
        <div class="container">
            <div class="header">
                <div class="title">
                    <span>${isAggregated ? 'Session Summary' : 'Match Report'}</span>
                    <h1>WARZONE ${isAggregated ? 'TOTALS' : 'STATS'}</h1>
                </div>
                <div class="meta">
                    <div class="date">${new Date().toLocaleDateString('he-IL')}</div>
                    <div class="mode">${isAggregated ? `${totalGames} Games Tracked` : 'Resurgence'}</div>
                </div>
            </div>

            <div class="thead">
                <div>#</div>
                <div>OPERATOR</div>
                <div>KILLS</div>
                <div>DAMAGE</div>
                <div>SCORE</div>
                <div>TAG</div>
            </div>

            ${rowsHtml}
        </div>
    </body>
    </html>
    `;

    return core.render(html, width, height);
}

module.exports = { generateMatchCard };
