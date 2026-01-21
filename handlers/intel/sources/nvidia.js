const browserAdapter = require('../adapters/browser');

const NVIDIA_URL = 'https://www.nvidia.com/en-us/software/nvidia-app/release-highlights/';

const source = {
    // --- NVIDIA App Updates ---
    async getUpdates() {
        // Switch to GeForce News which is static and crawlable
        const NEWS_URL = 'https://www.nvidia.com/en-us/geforce/news/';

        return browserAdapter._fetchPage(NEWS_URL, () => {
            // Look for articles with "Game Ready Driver" in the title
            // Recent NVIDIA site structure uses standard semantic tags or div grids.
            const articles = Array.from(document.querySelectorAll('a'));

            const driverLink = articles.find(a => {
                const text = a.innerText || "";
                return text.includes('Game Ready Driver') && text.includes('Released');
            });

            if (driverLink) {
                // Usually the link text is the title
                const title = driverLink.innerText.trim();
                return {
                    title: `NVIDIA DRIVER: ${title}`,
                    link: driverLink.href,
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
