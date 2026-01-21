const browserAdapter = require('../adapters/browser');

const NVIDIA_URL = 'https://www.nvidia.com/en-us/software/nvidia-app/release-highlights/';

const source = {
    // --- NVIDIA App Updates ---
    async getUpdates() {
        // Switch to the Drivers Feed which is more relevant than "Release Highlights" app page
        const DRIVER_URL = 'https://www.nvidia.com/en-us/geforce/drivers/';

        return browserAdapter._fetchPage(DRIVER_URL, () => {
            // NVIDIA Driver Search Results (often dynamically loaded, but "Latest News" or static cards might exist)
            // Strategy: Look for the first "Game Ready Driver" card or text.

            // Selector for the "Driver Results" usually requires interaction, so we might fallback to their News or specific RSS-like page.
            // A better static source for scraping is the GeForce News: https://www.nvidia.com/en-us/geforce/news/
            // Searching for "Game Ready Driver" in news titles.

            // Let's try scraping the Driver Result card if it renders, otherwise News.
            // Since this is Puppeteer, we can try waiting, but let's stick to News for reliability if Drivers page is pure JS forms.
            // Actually, querying "GeForce News" for "Game Ready" is safest.
        });

        // RE-PLAN: The user specifically wants "Last Update". 
        // Best approach: Scrape the GeForce News page for "Game Ready Driver Released"
        const NEWS_URL = 'https://www.nvidia.com/en-us/geforce/news/';

        return browserAdapter._fetchPage(NEWS_URL, () => {
            const articles = Array.from(document.querySelectorAll('article, .news-item, a[href*="/news/"]'));

            // Find first article with "Driver" in text
            const driverArticle = articles.find(a => (a.innerText || "").includes('Game Ready Driver'));

            if (driverArticle) {
                const titleEl = driverArticle.querySelector('h3') || driverArticle;
                const linkEl = driverArticle.tagName === 'A' ? driverArticle : driverArticle.querySelector('a');

                return {
                    title: `NVIDIA DRIVER: ${titleEl.innerText.trim()}`,
                    link: linkEl.href,
                    date: new Date().toISOString(),
                    summary: "New Game Ready Driver released. Click to see supported games."
                };
            }

            return null;
        });
    },

    // --- Formatter ---
    formatUpdate(update) {
        if (!update) return "❌ לא מצאתי עדכוני NVIDIA.";
        return `🖥️ **${update.title}**\n\n${update.summary}`;
    }
};

module.exports = source;
