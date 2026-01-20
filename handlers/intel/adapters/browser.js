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
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--mute-audio'
                ],
                ignoreHTTPSErrors: true
            });
        }
        return browser;
    }

    // --- Generic Article/Page Content Fetcher ---
    async getArticleContent(url) {
        return this._fetchPage(url, () => {
            // Remove navigation, footer, ads to reduce noise
            const noise = document.querySelectorAll('nav, footer, .ad, .social-share, .cookie-consent, script, style, header');
            noise.forEach(e => e.remove());

            // Get text from main content if possible
            const main = document.querySelector('main, article, .content, #content, .patch-notes') || document.body;
            return main ? main.innerText.slice(0, 5000) : "";
        });
    }

    async _fetchPage(url, processFunc) {
        let page = null;
        try {
            const b = await this._getBrowser();
            page = await b.newPage();

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

            log(`[Browser] Navigating to ${url}...`);
            // Increased timeout and better wait condition for dynamic sites (Nvidia/COD)
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

            const data = await page.evaluate(processFunc);

            await page.close();
            return data;

        } catch (error) {
            log(`❌ [Browser] Error scraping ${url}: ${error.message}`);
            if (page) await page.close().catch(() => { });
            return null;
        }
    }
}

module.exports = new BrowserAdapter();
