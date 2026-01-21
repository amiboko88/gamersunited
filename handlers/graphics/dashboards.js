const graphics = require('./core');

// --- 🎨 HTML TEMPLATES & GENERATORS ---

function getHtmlTemplate(title, color, stats, icon) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
            body { margin:0; background:#050505; font-family:'Outfit', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif; color:white; display:flex; align-items:center; justify-content:center; height:400px; width:800px; overflow:hidden; }
            .card { width:100%; height:100%; display:flex; padding:40px; box-sizing:border-box; background:radial-gradient(circle at top right, ${color}15 0%, #050505 60%); border: 1px solid ${color}33; position: relative; z-index: 1; }
            .left { flex:1; display:flex; flex-direction:column; justify-content:center; z-index: 2; }
            .right { width:320px; display:flex; flex-direction:column; gap:16px; justify-content:center; z-index: 2; }
            
            h1 { font-size:42px; margin:0; line-height:1; text-transform:uppercase; letter-spacing:1px; font-weight: 900; text-shadow: 0 0 20px ${color}44; }
            .subtitle { font-size:18px; color:#888; font-weight:700; margin-bottom:24px; text-transform:uppercase; letter-spacing:3px; display:flex; align-items:center; gap:10px; }
            
            .stat-box { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:16px 24px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; backdrop-filter: blur(10px); }
            .stat-label { color:#bbb; font-size:16px; font-weight:600; letter-spacing: 0.5px; }
            .stat-value { font-size:22px; font-weight:800; color:#fff; text-shadow: 0 0 10px ${color}66; }
            
            .status-badge { display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:30px; background:${color}11; border:1px solid ${color}44; color:${color}; font-weight:bold; font-size:13px; margin-bottom:12px; width:fit-content; box-shadow: 0 0 15px ${color}11; }
            .icon-bg { position:absolute; right:-40px; bottom:-40px; font-size:350px; opacity:0.04; pointer-events:none; z-index: 0; filter: grayscale(100%); }
        </style>
    </head>
    <body>
        <div class="icon-bg">${icon}</div>
        <div class="card">
            <div class="left">
                <div class="status-badge">● ONLINE</div>
                <h1>${title}</h1>
                <div class="subtitle">${icon} DASHBOARD</div>
            </div>
            <div class="right">
                ${stats.map(s => `
                <div class="stat-box">
                    <span class="stat-label">${s.label}</span>
                    <span class="stat-value">${s.value}</span>
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
        return renderCard(getHtmlTemplate('WHATSAPP BRIDGE', '#00e676', stats, '💬'));
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
