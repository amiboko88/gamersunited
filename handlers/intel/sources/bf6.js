const browserAdapter = require('../adapters/browser');

const BF_URL = 'https://bfhub.gg/meta/br';
const UPDATE_URL = 'https://www.ea.com/games/battlefield/battlefield-6/news?page=1&type=game-updates';

const source = {
    // --- BF6 Meta Extraction ---
    async getMeta() {
        return browserAdapter._fetchPage(BF_URL, () => {
            const weapons = [];
            document.querySelectorAll('.loadout-card').forEach(w => {
                const name = w.querySelector('.gun-badge__text')?.innerText.trim();
                const image = w.querySelector('.loadout-content__gun-image img')?.src || w.querySelector('.loadout-card__thumbnail img')?.src;

                const attachments = [];
                w.querySelectorAll('.attachment-card').forEach(a => {
                    const type = a.querySelector('.attachment-card-content__name span')?.innerText.trim() || "Part";
                    // Name is inside a div, possibly with a level badge we want to ignore
                    let partName = "Unknown";
                    const nameContainer = a.querySelector('.attachment-card-content__name > div');
                    if (nameContainer) {
                        partName = nameContainer.innerText.split('LVL')[0].trim();
                    }
                    attachments.push({ part: type, name: partName });
                });

                if (name) weapons.push({ name, image, attachments });
            });
            return weapons.slice(0, 5); // Return top 5
        });
    },

    // --- BF6 Game Updates (EA Official) ---
    async getUpdates() {
        return browserAdapter._fetchPage(UPDATE_URL, () => {
            const cards = Array.from(document.querySelectorAll('a[class*="Card_headlessButton__"]'));

            if (cards.length === 0) return null;

            const card = cards[0];
            const titleEl = card.querySelector('h3');
            const dateEl = Array.from(card.querySelectorAll('span[class*="Typography_typography__"]')).find(s => s.innerText.match(/[A-Z][a-z]+ \d+,? \d{4}/));

            if (titleEl) {
                return {
                    title: `BF6 UPDATE: ${titleEl.innerText.trim()}`,
                    link: card.href,
                    date: dateEl ? new Date(dateEl.innerText).toISOString() : new Date().toISOString(),
                    summary: "Official BF6 Game Update. Click to read full patch notes."
                };
            }
            return null;
        });
    },

    // --- Formatter ---
    getFormattedMeta(weapons) {
        if (!weapons || weapons.length === 0) return "❌ BF6 Data Unavailable.";
        const list = weapons.slice(0, 5).map(w => `• ${w.name}`).join('\n');
        return `🔫 **BF6 META LOADOUTS (Top 5):**\n${list}\n\nלפירוט על נשק, כתוב: "תן לי בילד ל[שם הנשק]"`;
    }
};

module.exports = source;
