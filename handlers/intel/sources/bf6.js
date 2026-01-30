const browserAdapter = require('../adapters/browser');

const BF_URL = 'https://bfhub.gg/meta/br';
const UPDATE_URL = 'https://www.ea.com/games/battlefield/battlefield-6/news?page=1&type=game-updates';

const source = {
    // --- BF6 Meta Extraction ---
    async getMeta(category = 'absolute') {
        const data = await browserAdapter._fetchPage(BF_URL, () => {
            const weapons = [];
            document.querySelectorAll('.loadout-card').forEach(w => {
                const name = w.querySelector('.gun-badge__text')?.innerText.trim();
                const image = w.querySelector('.loadout-content__gun-image img')?.src || w.querySelector('.loadout-card__thumbnail img')?.src;

                const attachments = [];
                w.querySelectorAll('.attachment-card').forEach(a => {
                    const type = a.querySelector('.attachment-card-content__name span')?.innerText.trim() || "Part";
                    let partName = "Unknown";
                    const nameContainer = a.querySelector('.attachment-card-content__name > div');
                    if (nameContainer) {
                        partName = nameContainer.innerText.split('LVL')[0].trim();
                    }
                    attachments.push({ part: type, name: partName });
                });

                if (name) weapons.push({ name, image, attachments });
            });
            return weapons;
        });

        if (!data || data.length === 0) return null;

        // --- Post-Processing Logic ---
        const cat = category.toLowerCase();
        let finalWeapons = data;
        let title = "BF6 LOADOUTS";

        // 1. Category Filtering (Heuristic based on name/known list could be added here, 
        //    but for now we slice based on Tier since we scrape the 'Meta' page)

        if (cat === 'absolute' || cat === 'meta') {
            title = "BF6 ABSOLUTE META";
            finalWeapons = data.slice(0, 4); // Top 4 for Absolute
        } else if (cat === 'all' || cat === 'list') {
            title = "BF6 META LIST";
            finalWeapons = data.slice(0, 10);
        } else {
            // Specific weapon search or Category filter attempt
            // If user asks for "SMG", we try to find common SMG names or just return general
            // Since we can't reliably detect Type without scraping it, we return Top 6.
            title = `BF6 ${cat.toUpperCase()}`;
            // Optional: Add simple name filter if query matches
            const filtered = data.filter(w => w.name.toLowerCase().includes(cat));
            if (filtered.length > 0) finalWeapons = filtered;
            else finalWeapons = data.slice(0, 6); // Fallback
        }

        return {
            weapons: finalWeapons,
            title: title,
            isList: true
        };
    },

    // --- BF6 Game Updates (EA Official) ---
    async getUpdates() {
        return browserAdapter._fetchPage(UPDATE_URL, () => {
            const cards = Array.from(document.querySelectorAll('a[class*="Card_headlessButton__"]'));

            if (cards.length === 0) return null;

            const card = cards[0];
            const titleEl = card.querySelector('h3');
            // FIX: EA Changed Date Format/Class. Use safer generic date finder.
            const dateText = Array.from(card.querySelectorAll('span, div')).find(el => el.innerText.match(/[A-Za-z]+ \d{1,2},? \d{4}/))?.innerText;

            let finalDate = new Date().toISOString();
            if (dateText) {
                try {
                    finalDate = new Date(dateText).toISOString();
                } catch (e) { /* Fallback to now */ }
            }

            if (titleEl && titleEl.innerText.trim().length > 3) {
                return {
                    title: `BF6 UPDATE: ${titleEl.innerText.trim()}`,
                    link: card.href,
                    date: finalDate,
                    summary: "Official BF6 Game Update. Click to read full patch notes."
                };
            }
            return null;
        });
    },

    // --- Formatter ---
    getFormattedMeta(result) {
        if (!result || !result.weapons) return "❌ BF6 Data Unavailable.";
        const list = result.weapons.map(w => `• ${w.name}`).join('\n');
        return `👑 **${result.title}**\n${list}`;
    }
};

module.exports = source;
