const puppeteer = require('puppeteer');
const { log } = require('../../../utils/logger');

// Singleton Browser Instance
let browser = null;

const WZ_URL = 'https://wzhub.gg/loadouts';
const PLAYLIST_URL = 'https://wzhub.gg/playlist/wz';
const BF_URL = 'https://bfhub.gg/meta/br';

class BrowserAdapter {
    async _getBrowser() {
        if (!browser) {
            log('[Browser] 🚀 Launching Headless Browser...');
            browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return browser;
    }

    async _fetchPage(url, processFunc) {
        let page = null;
        try {
            const b = await this._getBrowser();
            page = await b.newPage();

            // Anti-Bot Evasion Headers
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });

            log(`[Browser] Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Execute the scraper function in the page context
            const data = await page.evaluate(processFunc);

            await page.close();
            return data;

        } catch (error) {
            log(`❌ [Browser] Error scraping ${url}: ${error.message}`);
            if (page) await page.close().catch(() => { });
            return null;
        }
    }

    // --- 1. WZ Meta Extraction ---
    async getWZMeta() {
        return this._fetchPage(WZ_URL, () => {
            const results = { meta: [], absolute_meta: [] };

            // Helper to clean text
            const clean = t => t ? t.innerText.trim() : null;

            // Strategy: Find categories and iterate
            // Note: Selectors must be generic enough to survive UI updates
            document.querySelectorAll('.meta-category').forEach(cat => {
                const title = clean(cat.querySelector('.meta-category__title'));
                const weapons = [];

                cat.querySelectorAll('.meta-weapon').forEach(w => {
                    const name = clean(w.querySelector('.meta-weapon__name'));
                    const code = clean(w.querySelector('.meta-weapon__code-value'));
                    const image = w.querySelector('img')?.src;

                    // Attachments
                    const attachments = [];
                    w.querySelectorAll('.meta-attachment').forEach(a => {
                        attachments.push({
                            part: clean(a.querySelector('.meta-attachment__type')),
                            name: clean(a.querySelector('.meta-attachment__name'))
                        });
                    });

                    if (name) weapons.push({ name, code, image, attachments });
                });

                if (title && title.toUpperCase().includes('ABSOLUTE')) {
                    results.absolute_meta = weapons;
                } else {
                    results.meta.push({ category: title, weapons });
                }
            });

            return results;
        });
    }

    // --- 2. Playlist Extraction ---
    async getPlaylists() {
        return this._fetchPage(PLAYLIST_URL, () => {
            const modes = [];
            // Assuming structure is cards or list items
            // WZHub Playlist structure usually uses specific classes for active modes
            // We look for the "Active" section or just grab visible cards

            // Generic scraper for finding mode titles
            const candidates = document.querySelectorAll('h3, .playlist-card__title, .mode-title');
            candidates.forEach(el => {
                const text = el.innerText.trim();
                // Basic filtering to avoid menu items
                if (text.length > 3 && !text.includes('Menu') && !text.includes('Settings')) {
                    modes.push(text);
                }
            });

            // Deduplicate
            return [...new Set(modes)];
        });
    }

    // --- 3. BF6 Meta Extraction ---
    async getBF6Meta() {
        return this._fetchPage(BF_URL, () => {
            const weapons = [];
            document.querySelectorAll('.meta-weapon').forEach(w => {
                const name = w.querySelector('.meta-weapon__name')?.innerText.trim();
                const image = w.querySelector('img')?.src;

                const attachments = [];
                w.querySelectorAll('.meta-attachment').forEach(a => {
                    attachments.push(a.innerText.trim()); // Simpler scraping for BF
                });

                if (name) weapons.push({ name, image, attachments });
            });
            return weapons.slice(0, 5); // Return top 5
        });
    }
}

module.exports = new BrowserAdapter();
