const browserAdapter = require('../adapters/browser');

const NVIDIA_URL = 'https://www.nvidia.com/en-us/software/nvidia-app/release-highlights/';

const source = {
    // --- NVIDIA App Updates ---
    async getUpdates() {
        return browserAdapter._fetchPage(NVIDIA_URL, () => {
            // Logic: Find the main Release Heading (h2 usually)
            // Refined: Look for text containing "Release" and digits
            const headers = Array.from(document.querySelectorAll('h2, h3'));
            const releaseHeader = headers.find(h => h.innerText.includes('Release'));

            if (!releaseHeader) {
                // Fallback: Just return the page link with generic info
                return {
                    title: "NVIDIA DRIVER UPDATE",
                    link: 'https://www.nvidia.com/en-us/software/nvidia-app/release-highlights/',
                    date: new Date().toISOString(),
                    summary: "Latest Release Highlights available. Click link to view."
                };
            }

            const version = releaseHeader.innerText.trim();

            // Try to find the content list immediately following the header
            let listItems = "";
            let sibling = releaseHeader.nextElementSibling;
            while (sibling && sibling.tagName !== 'H2' && sibling.tagName !== 'SECTION') {
                if (sibling.tagName === 'UL') {
                    listItems = Array.from(sibling.querySelectorAll('li')).map(li => li.innerText).join('\n• ');
                    break;
                }
                sibling = sibling.nextElementSibling;
            }

            return {
                title: `NVIDIA UPDATE: ${version}`,
                link: 'https://www.nvidia.com/en-us/software/nvidia-app/release-highlights/',
                date: new Date().toISOString(),
                summary: `**Latest Release Highlights:**\n• ${listItems || "Click link for details."}`
            };
        });
    },

    // --- Formatter ---
    formatUpdate(update) {
        if (!update) return "❌ לא מצאתי עדכוני NVIDIA.";
        return `🖥️ **${update.title}**\n\n${update.summary}\n\n🔗 ${update.link}`;
    }
};

module.exports = source;
