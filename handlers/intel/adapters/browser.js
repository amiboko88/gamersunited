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
                headless: true, // Legacy mode might be more stable here
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
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
            return main ? main.innerText.slice(0, 80000) : "";
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

            /*
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media', 'websocket'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            */

            log(`[Browser] Navigating to ${url}...`);
            // Optimized: domcontentloaded is faster/safer for heavy media sites like COD
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for meaningful content (e.g. headers)
            try {
                await page.waitForSelector('h1, h2, h3, .patch-notes-body', { timeout: 10000 });
            } catch (e) { log('[Browser] ⚠️ Content selector timeout, proceeding anyway...'); }

            // 🛡️ Age Gate / Cookie Bypass
            try {
                // A. Dropdown Strategy (Activision / EA / Mature Games)
                // Look for Year Selector first
                const yearSelect = await page.$('select[name="year"], select#age-gate-year');
                if (yearSelect) {
                    log(`[Browser] 🛡️ Found Age Gate Dropdowns. Bypassing...`);
                    // Try to fill standard names
                    const selectors = [
                        { type: 'day', val: '1' },
                        { type: 'month', val: '1' }, // Jan
                        { type: 'year', val: '1990' }
                    ];

                    for (const s of selectors) {
                        // Try name="day", id="day", name="date_day", etc.
                        const candidates = [`select[name="${s.type}"]`, `select#${s.type}`, `select[name*="${s.type}"]`];
                        for (const cand of candidates) {
                            if (await page.$(cand)) {
                                await page.select(cand, s.val).catch(() => { });
                                break;
                            }
                        }
                    }

                    // Click Submit
                    const submitBtns = ['.age-gate-submit', 'button[type="submit"]', '#age-gate-submit', '.cta-btn', 'a.button'];
                    for (const btn of submitBtns) {
                        const el = await page.$(btn);
                        if (el) {
                            await el.click();
                            // Wait for SPA transition or reload
                            await new Promise(r => setTimeout(r, 5000));
                            break;
                        }
                    }
                }

                // B. Generic Click Strategy (if no dropdowns or after dropdowns)
                const ageSelectors = [
                    'a.age-gate-submit', 'button.age-gate-submit',
                    '#age-gate-submit', '#btn-enter',
                    'button[aria-label="Enter Site"]',
                    '.kt-age-gate__submit', // Common generic
                    'a[href="#"]', // sometimes 'Enter' is just a hash link
                    '.age-gate-overlay button'
                ];

                for (const sel of ageSelectors) {
                    if (await page.$(sel)) {
                        log(`[Browser] 🛡️ Attempting Age Gate bypass (Click): ${sel}`);
                        await page.click(sel);
                        await page.waitForNavigation({ timeout: 2000 }).catch(() => { });
                        break;
                    }
                }
            } catch (e) { log(`[Browser] ⚠️ Age Gate Bypass Non-Fatal: ${e.message}`); }



            // 🎮 SPECIAL HANDLING: COD PATCH NOTES HUB
            // If we are at the hub, we need to click "Warzone" to get actual notes.
            if (url.includes('callofduty.com/patchnotes') && !url.includes('season')) {
                try {
                    log(`[Browser] 🎮 Detected COD Hub. Searching for Warzone Box...`);
                    // Look for the Warzone card/link
                    const wzSelector = 'a[href*="warzone"][href*="patch-notes"], .atvi-card[aria-label*="Warzone"]';
                    // Or evaluate to find text
                    const wzLink = await page.evaluateHandle(() => {
                        const anchors = Array.from(document.querySelectorAll('a'));
                        return anchors.find(a =>
                            (a.innerText.toUpperCase().includes('WARZONE') && a.innerText.toUpperCase().includes('SEASON')) ||
                            (a.href.includes('warzone') && a.href.includes('patch-notes'))
                        );
                    });

                    if (wzLink && wzLink.asElement()) {
                        log(`[Browser] 🎮 specific: Found Warzone Link. Extracting HREF...`);

                        const href = await page.evaluate(el => el.href, wzLink);

                        if (href) {
                            log(`[Browser] 🎮 Navigating directly to: ${href}`);

                            // FORCE NAVIGATION - Ignore Timeout
                            try {
                                await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });
                            } catch (e) {
                                log(`[Browser] ⚠️ Navigation Timeout/Error: ${e.message} (Proceeding to extract text anyway)`);
                            }

                            try {
                                await page.waitForSelector('h1, h2, h3', { timeout: 15000 });
                            } catch (e) { }

                            // CRITICAL: Heavy wait for full React Hydration (Bug Fixes are last)
                            log(`[Browser] ⏳ Waiting 10s for full hydration...`);
                            await new Promise(r => setTimeout(r, 10000));

                            // Check for Age Gate AGAIN on the new page
                            try {
                                const ageContent = await page.content();
                                if (ageContent.includes("Enter your date of birth") || ageContent.includes("AGE GATE")) {
                                    // ... (Simple Age Gate Check)
                                    const enterBtn = await page.$('a.age-gate-submit, button.age-gate-submit, a[href="#"]');
                                    if (enterBtn) {
                                        await enterBtn.click();
                                        await new Promise(r => setTimeout(r, 2000));
                                    }
                                }
                            } catch (e) { }
                        } else {
                            // Fallback if no href (weird button)
                            log(`[Browser] 🎮 No href found. Clicking fallback...`);
                            await wzLink.asElement().click();
                            await new Promise(r => setTimeout(r, 5000));
                        }
                    }
                } catch (codErr) {
                    log(`[Browser] ⚠️ COD Hub Nav Failed: ${codErr.message}`);
                }
            }

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
