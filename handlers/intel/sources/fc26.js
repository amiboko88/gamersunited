const browserAdapter = require('../adapters/browser');

const NEWS_URL = 'https://www.ea.com/games/ea-sports-fc/fc-26/news?page=1&type=latest';

const source = {
    // --- FC26 News Scraper ---
    async getUpdates() {
        return browserAdapter._fetchPage(NEWS_URL, () => {
            // EA's news page structure usually uses <game-card> or similar web components, OR standard grid
            // We look for the most recent "Pitch Notes" or "Title Update"

            // Selector strategy: Look for any link that contains "pitch-notes" or "title-update"
            // The cards usually have a title inside.

            const cards = Array.from(document.querySelectorAll('a[href*="/news/"]'));

            // prioritized search
            let targetParams = ['title-update', 'pitch-notes'];
            let bestLink = null;

            for (const param of targetParams) {
                bestLink = cards.find(a => a.href.toLowerCase().includes(param));
                if (bestLink) break;
            }

            // Fallback: Just take the first news link if no pitch note found
            if (!bestLink) bestLink = cards[0];

            if (!bestLink) return null;

            // Extract info
            // Often the title is inside a nested <h3> or <div>
            const titleEl = bestLink.querySelector('h3') || bestLink.querySelector('.ea-tile-title') || bestLink;
            const titleText = titleEl.innerText.trim();
            const fullLink = bestLink.href.startsWith('http') ? bestLink.href : `https://www.ea.com${bestLink.href}`;

            return {
                title: `FC26 UPDATE: ${titleText}`,
                link: fullLink,
                date: new Date().toISOString(),
                summary: "New FC26 Pitch Notes available. Click link to read."
            };
        });
    },

    // --- Formatter ---
    formatUpdate(update) {
        if (!update) return "❌ לא מצאתי עדכוני FIFA/FC26.";
        return `⚽ **${update.title}**\n\n${update.summary}`;
    }
};

module.exports = source;
