const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder } = require('discord.js');
const graphics = require('../../graphics/core');

class DashboardUI {

    // --- 🎨 HTML & Graphics ---

    getHtmlTemplate(stats) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                body { margin: 0; background-color: #050505; font-family: 'Outfit', sans-serif; display: flex; align-items: center; justify-content: center; height: 700px; width: 1200px; color: white; }
                .container { display: flex; width: 100%; height: 100%; padding: 60px; box-sizing: border-box; align-items: center; justify-content: center; gap: 80px; background: radial-gradient(circle at top right, #1a1a1a 0%, #050505 70%); }
                
                /* Chart */
                .chart-wrapper { width: 500px; height: 500px; position: relative; }
                svg { width: 100%; height: 100%; transform: rotate(-90deg); filter: drop-shadow(0 0 30px rgba(0,255,136,0.15)); }
                circle { fill: none; stroke-width: 40; transition: stroke-dasharray 1s ease-out; stroke-linecap: round; }
                
                .center-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
                .center-text h1 { font-size: 110px; margin: 0; line-height: 0.9; font-weight: 900; background: linear-gradient(to bottom, #fff, #888); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .center-text span { font-size: 24px; letter-spacing: 6px; color: #666; font-weight: 700; text-transform: uppercase; }

                /* Legend */
                .legend { display: flex; flex-direction: column; gap: 20px; width: 350px; }
                .legend-item { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 18px 30px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
                .legend-left { display: flex; align-items: center; gap: 18px; }
                .dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 12px currentColor; }
                .label { font-size: 22px; font-weight: 600; color: #ccc; }
                .value { font-size: 28px; font-weight: 800; }
                
                .c-active { color: #00e676; stroke: #00e676; }
                .c-dead { color: #ff3d00; stroke: #ff3d00; }
                .c-sleeping { color: #607d8b; stroke: #607d8b; }
                .c-suspect { color: #ffab00; stroke: #ffab00; }
                .c-immune { color: #2979ff; stroke: #2979ff; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="chart-wrapper">
                    <svg viewBox="0 0 200 200">
                        ${this.getSvgCircle(stats.active, stats.humans, '#00e676', 0)}
                        ${this.getSvgCircle(stats.dead.length, stats.humans, '#ff3d00', stats.active)}
                        ${this.getSvgCircle(stats.sleeping.length, stats.humans, '#607d8b', stats.active + stats.dead.length)}
                        ${this.getSvgCircle(stats.review.length, stats.humans, '#ffab00', stats.active + stats.dead.length + stats.sleeping.length)}
                        ${this.getSvgCircle(stats.immune, stats.humans, '#2979ff', stats.active + stats.dead.length + stats.sleeping.length + stats.review.length)}
                    </svg>
                    <div class="center-text">
                        <h1>${Math.round((stats.active / stats.humans) * 100)}%</h1>
                        <span>HEALTH</span>
                    </div>
                </div>
                <div class="legend">
                    <div class="legend-item"><div class="legend-left"><div class="dot c-active"></div><span class="label">Healthy Users</span></div><span class="value c-active">${stats.active}</span></div>
                    <div class="legend-item"><div class="legend-left"><div class="dot c-dead"></div><span class="label">Dead (>180d)</span></div><span class="value c-dead">${stats.dead.length}</span></div>
                    <div class="legend-item"><div class="legend-left"><div class="dot c-sleeping"></div><span class="label">Sleeping</span></div><span class="value c-sleeping">${stats.sleeping.length}</span></div>
                    <div class="legend-item"><div class="legend-left"><div class="dot c-suspect"></div><span class="label">Review</span></div><span class="value c-suspect">${stats.review.length}</span></div>
                    <div class="legend-item"><div class="legend-left"><div class="dot c-immune"></div><span class="label">Immune</span></div><span class="value c-immune">${stats.immune}</span></div>
                </div>
            </div>
        </body>
        </html>`;
    }

    getSvgCircle(val, total, color, offsetVal) {
        if (val <= 0) return '';
        const r = 80;
        const c = 2 * Math.PI * r;
        const pct = (val / total) * c;
        const offset = (offsetVal / total) * c;
        return `<circle cx="100" cy="100" r="${r}" style="stroke: ${color}; stroke-dasharray: ${pct} ${c - pct}; stroke-dashoffset: -${offset}px;"></circle>`;
    }

    async renderMainDashboard(stats, ghostCount, orphansCount, tgMatchCount) {
        const chartHtml = this.getHtmlTemplate(stats);
        const attachment = await graphics.render(chartHtml, 1200, 700);

        const embed = new EmbedBuilder()
            .setTitle('GAMERS UNITED // ADMIN CONSOLE')
            .setColor('#000000')
            .setImage('attachment://dashboard.png')
            .addFields(
                { name: '🔌 SYSTEM STATUS', value: stats.voiceNow > 0 ? `🟢 Online (${stats.voiceNow} in Voice)` : '🔴 Idle', inline: true },
                { name: '🦴 GHOST USERS', value: ghostCount > 0 ? `⚠️ **${ghostCount} Detected**` : '✅ Clean', inline: true },
                { name: '🔗 UNLINKED (LID)', value: orphansCount > 0 ? `⚠️ **${orphansCount} Users**` : '✅ Clean', inline: true },
                { name: '✈️ TELEGRAM', value: tgMatchCount > 0 ? `🚨 **${tgMatchCount} Pending**` : '✅ Clean', inline: true }
            )
            .setFooter({ text: `Last Sync: ${new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" })}` });

        // Row 1: Common Actions
        const rowNav = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_refresh').setLabel('רענן').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
            new ButtonBuilder().setCustomId('btn_manage_sync_names').setLabel('סנכרון שמות').setStyle(ButtonStyle.Primary).setEmoji('🆔'),
            new ButtonBuilder().setCustomId('btn_manage_view_debug').setLabel('דיבוג').setStyle(ButtonStyle.Secondary).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('btn_manage_cancel').setLabel('סגור').setStyle(ButtonStyle.Secondary).setEmoji('❌')
        );

        // Row 2: Linking Actions
        const rowLinks = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_view_link').setLabel(`חיבור LID (${orphansCount})`).setStyle(ButtonStyle.Success).setEmoji('🔗').setDisabled(orphansCount === 0),
            new ButtonBuilder().setCustomId('btn_manage_tg_link').setLabel(`חיבור TG (${tgMatchCount})`).setStyle(ButtonStyle.Primary).setEmoji('✈️')
        );

        // Row 3: Danger Zone
        const rowDanger = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_purge_ghosts').setLabel(`ניקוי רפאים (${ghostCount})`).setStyle(ButtonStyle.Danger).setDisabled(ghostCount === 0).setEmoji('👻'),
            new ButtonBuilder().setCustomId('btn_manage_kick_prep').setLabel(`ניקוי לא פעילים (${stats.dead.length})`).setStyle(ButtonStyle.Danger).setDisabled(stats.dead.length === 0).setEmoji('🗑️')
        );

        return {
            embeds: [embed],
            components: [rowNav, rowLinks, rowDanger],
            files: [{ attachment, name: 'dashboard.png' }]
        };
    }

    // --- 🛠️ Panels ---

    renderDebugPanel(usersCount, activeSessions, orphansCount) {
        const embed = new EmbedBuilder()
            .setTitle('🛠️ System Debug')
            .setColor('Grey')
            .addFields(
                { name: 'Users in DB', value: `${usersCount}`, inline: true },
                { name: 'Voice Sessions', value: `${activeSessions}`, inline: true },
                { name: 'Orphans Collection', value: `${orphansCount}`, inline: true },
                { name: 'Platform', value: `${process.platform} / Node ${process.version}`, inline: true },
                { name: 'Memory', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_plat_wa_main').setLabel('חזרה').setStyle(ButtonStyle.Primary)
        );

        return { embeds: [embed], components: [row], files: [] };
    }

    renderLinkPanel(orphans) {
        const select = new StringSelectMenuBuilder()
            .setCustomId('menu_manage_link_lid')
            .setPlaceholder('בחר משתמש לחיבור...');

        const seenPhones = new Set();
        orphans.slice(0, 50).forEach(orphan => {
            const phoneStr = String(orphan.lid);
            const timeStr = orphan.timestamp ? new Date(orphan.timestamp).toLocaleTimeString() : 'Unknown';

            if (!seenPhones.has(phoneStr) && phoneStr !== 'undefined') {
                seenPhones.add(phoneStr);
                select.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${phoneStr} (LID)`)
                        .setDescription(`Last seen: ${timeStr}`)
                        .setValue(phoneStr)
                );
            }
        });

        const embed = new EmbedBuilder()
            .setTitle('🔗 WhatsApp Linking')
            .setDescription('Select a WhatsApp number/LID from the list below to link it to a Discord user.')
            .setColor('Green');

        const row = new ActionRowBuilder().addComponents(select);
        const rowBack = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_plat_wa_main').setLabel('חזרה').setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row, rowBack], files: [] };
    }

    renderUserSelection(phone) {
        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`menu_manage_link_confirm_${phone}`)
            .setPlaceholder('בחר את המשתמש בדיסקורד שמתאים למספר זה');

        const row = new ActionRowBuilder().addComponents(userSelect);

        return {
            content: `🔗 בחרת לקשר את המספר: **${phone}**\nאנא בחר למטה לאיזה משתמש דיסקורד לחבר אותו:`,
            components: [row],
            flags: 64
        };
    }

    renderGhostPurgeList(ghosts) {
        const listText = ghosts.slice(0, 20).map(g =>
            `• \`${g.id}\` | **${g.name}** | Joined: ${g.joined} | XP: ${g.xp}${g.hasValue ? ' ⚠️' : ''}`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`👻 GHOST PURGE (${ghosts.length})`)
            .setDescription(`**Users detected in DB but NOT in Server**\n(Showing first 20)\n\n${listText}`)
            .setColor('DarkRed')
            .setFooter({ text: '⚠️ Marked with warning are users with XP/Balance' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_ghost_confirm').setLabel('בצע מחיקה').setStyle(ButtonStyle.Danger).setEmoji('🔥'),
            new ButtonBuilder().setCustomId('btn_plat_dc_main').setLabel('ביטול וחזרה').setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row], files: [] };
    }

    renderKickCandidateList(candidates) {
        const list = candidates.map(c => `• <@${c.userId}> (${c.days} days)`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`💀 INACTIVE PURGE (${candidates.length})`)
            .setDescription(list.slice(0, 4000))
            .setColor('DarkRed');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_manage_kick_confirm').setLabel('KICK ALL').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn_plat_dc_main').setLabel('CANCEL').setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row], files: [] };
    }

    renderTelegramMatchList(match, listLength) {
        // Empty state handled by logic usually, but let's have UI for it if needed
        if (!match) {
            const embed = new EmbedBuilder()
                .setTitle('👮 TELEGRAM DETECTIVE')
                .setDescription('✅ **אין התאמות חשודות כרגע.**\nכל המשתמשים שזוהו כבר מקושרים או שאין מידע חדש.\n\nלחץ על **סריקה יזומה** כדי להכריח בדיקה מחדש על כל המשתמשים הלא-מקושרים.')
                .setColor('Green');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_tg_force_scan').setLabel('סריקה יזומה').setStyle(ButtonStyle.Primary).setEmoji('🕵️'),
                new ButtonBuilder().setCustomId('btn_plat_tg_main').setLabel('חזרה לדאשבורד').setStyle(ButtonStyle.Secondary)
            );
            return { embeds: [embed], components: [row] };
        }

        const confidencePct = Math.round(match.confidence * 100);
        const embed = new EmbedBuilder()
            .setTitle('👮 TELEGRAM DETECTIVE')
            .setDescription(`**חשוד:** ${match.displayName} (@${match.username})\n**התאמה:** ${match.potentialMatchName}\n**דיוק:** ${confidencePct}%`)
            .setColor(confidencePct > 80 ? 'Green' : 'Yellow')
            .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/2048px-Telegram_logo.svg.png');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`btn_tg_confirm_${match.tgId}_${match.potentialMatchId}`).setLabel('אשר חיבור').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(`btn_tg_reject_${match.tgId}`).setLabel('התעלם').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
            new ButtonBuilder().setCustomId('btn_tg_force_scan').setLabel('סריקה יזומה (אוטומטית)').setStyle(ButtonStyle.Primary).setEmoji('🕵️'),
            new ButtonBuilder().setCustomId('btn_tg_manual_link_menu').setLabel('חיבור ידני').setStyle(ButtonStyle.Secondary).setEmoji('🔗'),
            new ButtonBuilder().setCustomId('btn_plat_tg_main').setLabel('ביטול').setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row] };
    }

    renderTelegramManualLink(users) {
        if (users.length === 0) {
            return { content: '❌ אין משתמשים לא מקושרים ברשימה.', ephemeral: true };
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId('menu_tg_manual_select')
            .setPlaceholder('בחר משתמש טלגרם לחיבור...');

        users.slice(0, 25).forEach(u => {
            select.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(u.username && u.username !== 'No Username' ? `${u.displayName} (@${u.username})` : u.displayName)
                    .setDescription(`ID: ${u.tgId}`)
                    .setValue(String(u.tgId))
            );
        });

        const row = new ActionRowBuilder().addComponents(select);
        return {
            content: '**חיבור ידני לטלגרם**\nבחר משתמש מהרשימה כדי לחבר אותו למשתמש דיסקורד:',
            embeds: [],
            components: [row]
        };
    }
}

module.exports = new DashboardUI();
