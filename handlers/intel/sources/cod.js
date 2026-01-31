const stringSimilarity = require('string-similarity');
// Brain moved to lazy require
const { log } = require('../../../utils/logger');

const browserAdapter = require('../adapters/browser');

const WZ_URL = 'https://wzhub.gg/loadouts';
const PLAYLIST_URL = 'https://wzhub.gg/playlist/wz';
const HUB_URL = 'https://www.callofduty.com/patchnotes';

const genericTerms = ['absolute', 'meta', 'מטא', 'מטה', 'הכי חזק', 'נשק', 'רובה', 'טוב', 'loadout', 'build', 'class'];

const source = {
    // --- WZ Meta Extraction ---
    async getMeta() {
        return browserAdapter._fetchPage(WZ_URL, () => {
            const results = { meta: [], absolute_meta: [] };
            const clean = t => t ? t.innerText.trim() : null;

            const headers = document.querySelectorAll('h2');

            headers.forEach(h2 => {
                const title = clean(h2);
                if (!title) return;

                const listGroup = h2.nextElementSibling;
                if (!listGroup || !listGroup.classList.contains('loadouts-list__group')) return;

                const weapons = [];
                listGroup.querySelectorAll('.loadout-card').forEach(card => {
                    const name = clean(card.querySelector('.gun-badge__text'));
                    const code = clean(card.querySelector('.loadout-card-code__content'));
                    const imgEl = card.querySelector('.loadout-card__thumbnail img');
                    const image = imgEl ? (imgEl.dataset.src || imgEl.src) : null;

                    const attachments = [];
                    card.querySelectorAll('.attachment-card').forEach(attCard => {
                        const nameEl = attCard.querySelector('.attachment-card-content__name div');
                        const typeEl = attCard.querySelector('.attachment-card-content__name span');

                        if (nameEl && typeEl) {
                            attachments.push({
                                part: clean(typeEl),
                                name: clean(nameEl)
                            });
                        }
                    });

                    if (name) {
                        weapons.push({ name, code, image, attachments });
                    }
                });

                if (title.toUpperCase().includes('ABSOLUTE')) {
                    results.absolute_meta = weapons.slice(0, 3); // Strict: Top 3 only
                } else if (title.toUpperCase().includes('META')) {
                    results.meta.push({ category: title, weapons });
                }
            });

            return results;
        });
    },

    // --- Playlist Extraction ---
    async getPlaylists() {
        return browserAdapter._fetchPage(PLAYLIST_URL, () => {
            const modes = [];
            const candidates = document.querySelectorAll('h3, .playlist-card__title, .mode-title');
            candidates.forEach(el => {
                const text = el.innerText.trim();
                if (text.length > 3 && !text.includes('Menu') && !text.includes('Settings')) {
                    modes.push(text);
                }
            });
            return [...new Set(modes)];
        });
    },

    // --- COD Patch Notes (Official Hub) ---
    async getPatchNotes() {
        return browserAdapter._fetchPage(HUB_URL, () => {
            // Logic: Target the specific "Warzone" tile as requested by user
            // DOM Structure found: li.game-tile.warzone -> a[href*="/patchnotes/"]

            // 1. Try Specific Warzone Tile (Desktop)
            const wzTile = document.querySelector('li.game-tile.warzone');
            if (wzTile) {
                const latestLink = wzTile.querySelector('a[href*="/patchnotes/"]');
                if (latestLink) {
                    return {
                        title: `COD OFFICIAL: ${latestLink.innerText.trim()}`,
                        link: latestLink.href,
                        date: new Date().toISOString(),
                        summary: "Official Warzone Patch Notes. Click to read full changes."
                    };
                }
            }

            // 2. Fallback: Search for any "Warzone" related headers
            const allLinks = Array.from(document.querySelectorAll('a[href*="/patchnotes/"]'));

            // Prioritize newest dates in URL
            const bestLink = allLinks.find(l => {
                const text = l.innerText.toLowerCase();
                const isGarbage = text.includes('skip') || text.includes('main content') || text.length < 5;
                if (isGarbage) return false;
                return text.includes('warzone') || l.href.includes('warzone');
            });

            if (bestLink) {
                return {
                    title: `COD OFFICIAL: ${bestLink.innerText.trim()}`,
                    link: bestLink.href,
                    date: new Date().toISOString(),
                    summary: "Official Warzone Patch Notes. Click to read full changes."
                };
            }

            // 3. Ultimate Fallback: Valid Patch Note Search
            const validLink = allLinks.find(l => {
                const txt = l.innerText.trim().toLowerCase();
                return txt.length > 5 && !txt.includes('skip to') && !txt.includes('main content');
            });

            if (validLink) {
                return {
                    title: `COD OFFICIAL: ${validLink.innerText.trim()}`,
                    link: validLink.href,
                    date: new Date().toISOString(),
                    summary: "Official Patch Notes (General). Click link to read."
                };
            }

            return null;
        });
    },

    // --- Logic: Search Weapon ---
    async searchWeapon(query, cachedData) {
        if (!cachedData) return { text: "❌ No weapon data available." };

        const q = query.toLowerCase().trim();

        // Handle "Absolute" / "Meta" general queries
        if (genericTerms.some(t => q === t || (t.length > 3 && q.includes(t)))) {
            if (cachedData.absolute_meta && cachedData.absolute_meta.length > 0) {
                const list = cachedData.absolute_meta.slice(0, 5).map(w => `• ${w.name}`).join('\n');
                return {
                    text: `👑 **ABSOLUTE META (הכי חזקים):**\n${list}\n\nלפירוט על נשק, כתוב: "תן לי בילד ל[שם הנשק]"`,
                    weapons: cachedData.absolute_meta.slice(0, 5), // Expose for graphics
                    title: "WARZONE / ABSOLUTE META"
                };
            }
        }

        const allWeapons = cachedData.absolute_meta || [];
        if (cachedData.meta) {
            cachedData.meta.forEach(cat => allWeapons.push(...cat.weapons));
        }

        if (allWeapons.length === 0) return { text: "❌ No weapon data available." };

        // 1. Exact/Includes Match
        let found = allWeapons.find(w => w.name.toLowerCase().includes(q) || w.name.toLowerCase().replace(/[^a-z0-9]/g, '') === q.replace(/[^a-z0-9]/g, ''));

        // 2. Fuzzy Match
        if (!found) {
            const weaponNames = allWeapons.map(w => w.name);
            const matches = stringSimilarity.findBestMatch(q, weaponNames);
            if (matches.bestMatch.rating > 0.4) {
                found = allWeapons.find(w => w.name === matches.bestMatch.target);
            }
        }

        // 3. Brain Fallback
        if (!found && q.length > 2) {
            try {
                const brain = require('../../ai/brain');
                const candidates = allWeapons.map(w => w.name).slice(0, 50).join(', ');
                const aiGuess = await brain.generateInternal(`
                User searched for weapon: "${query}" (Hebrew/Typo).
                Identify the REAL weapon name from this list: [${candidates}]
                Return ONLY the exact weapon name. If unsure, return "NULL".
                `);

                if (aiGuess && aiGuess !== 'NULL') {
                    found = allWeapons.find(w => w.name.toLowerCase() === aiGuess.toLowerCase().trim());
                    if (found) log(`🧠 [Intel] AI Resolved "${query}" -> "${found.name}"`);
                }
            } catch (e) { /* Ignore AI fail */ }
        }

        if (found) {
            return this.formatWeapon(found);
        } else {
            return {
                text: `לא מצאתי נשק בשם "${query}".\nנסה לחפש אחד מהרשימה:\n${allWeapons.slice(0, 5).map(w => w.name).join(', ')}`
            };
        }
    },

    // --- Logic: Format Response ---
    formatWeapon(weapon, titlePrefix = "") {
        let text = `🔫 **${titlePrefix || weapon.name}**\n\n`;

        if (weapon.attachments && weapon.attachments.length > 0) {
            weapon.attachments.forEach(a => {
                if (typeof a === 'string') text += `• ${a}\n`;
                else text += `• **${a.part}**: ${a.name}\n`;
            });
        }

        return {
            text: text,
            code: weapon.code || "No Code Available",
            image: weapon.image,
            isWeapon: true
        };
    }
};

module.exports = source;
