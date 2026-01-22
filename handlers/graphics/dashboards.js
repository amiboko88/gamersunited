const graphics = require('./core');

// --- 🎨 HTML TEMPLATES & GENERATORS ---

function getHtmlTemplate(title, color, stats, iconChar) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
            body { margin:0; background:#000000; font-family:'Outfit', 'Segoe UI', sans-serif; color:white; display:flex; align-items:center; justify-content:center; height:400px; width:800px; overflow:hidden; }
            
            /* Modern Dark Gradient */
            .card { width:100%; height:100%; display:flex; padding:45px; box-sizing:border-box; 
                background: linear-gradient(135deg, #0f0f0f 0%, #050505 100%); 
                border: 1px solid #1a1a1a; position: relative; z-index: 1; }
            
            /* Accent Line */
            .card::before { content:''; position:absolute; top:0; left:0; width:6px; height:100%; background:${color}; box-shadow: 0 0 25px ${color}66; }

            .left { flex:1; display:flex; flex-direction:column; justify-content:center; z-index: 2; padding-left: 20px; }
            .right { width:340px; display:flex; flex-direction:column; gap:16px; justify-content:center; z-index: 2; }
            
            h1 { font-size:48px; margin:0; line-height:0.9; text-transform:uppercase; letter-spacing:-1px; font-weight: 900; 
                background: linear-gradient(to right, #fff, #888); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                
            .subtitle { font-size:16px; color:${color}; font-weight:700; margin-bottom:20px; letter-spacing:2px; text-transform:uppercase; display:flex; align-items:center; gap:8px; opacity: 0.9; }
            
            .stat-box { background:rgba(255,255,255,0.02); border-left: 2px solid rgba(255,255,255,0.1); padding:14px 20px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; backdrop-filter: blur(5px); }
            .stat-label { color:#666; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing: 1px; }
            .stat-value { font-size:24px; font-weight:700; color:#fff; }
            
            .status-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:4px; background:${color}11; border:1px solid ${color}33; color:${color}; font-weight:bold; font-size:12px; margin-bottom:15px; width:fit-content; }
            
            /* Subtle Pattern BG */
            .pattern { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: radial-gradient(#222 1px, transparent 1px); background-size: 20px 20px; opacity: 0.1; pointer-events: none; z-index: 0; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="pattern"></div>
            <div class="left">
                <div class="status-badge">● ONLINE</div>
                <div class="subtitle">SYSTEM DASHBOARD</div>
                <h1>${title}</h1>
            </div>
            <div class="right">
                ${stats.map(s => `
                <div class="stat-box">
                    <span class="stat-label">${s.label}</span>
                    <span class="stat-value">${s.value === '✅' ? 'OK' : s.value}</span>
                </div>`).join('')}
            </div>
        </div>
    </body>
    </html>`;
}

async function renderCard(html) {
    return await graphics.render(html, 800, 400);
}

module.exports = {
    async generateWhatsAppCard(deviceStatus, linkedCount, missingPfpCount) {
        const stats = [
            { label: 'DEVICE', value: deviceStatus },
            { label: 'LINKED USERS', value: linkedCount },
            { label: 'MISSING PFP', value: missingPfpCount || '✅' }
        ];
        return renderCard(getHtmlTemplate('WHATSAPP BRIDGE', '#00e676', stats, ''));
    },

    async generateTelegramCard(webhookStatus, orphansCount, confidence) {
        const stats = [
            { label: 'STATUS', value: webhookStatus },
            { label: 'SUSPECTS', value: orphansCount },
            { label: 'AVG CONFIDENCE', value: confidence + '%' }
        ];
        return renderCard(getHtmlTemplate('TELEGRAM SCOUT', '#29b6f6', stats, '✈️'));
    },

    async generateDiscordCard(memberCount, ghostCount, deadCount) {
        const stats = [
            { label: 'MEMBERS', value: memberCount },
            { label: 'DB GHOSTS', value: ghostCount },
            { label: 'INACTIVE', value: deadCount }
        ];
        return renderCard(getHtmlTemplate('DISCORD CORE', '#5865F2', stats, '🎮'));
    }
};
