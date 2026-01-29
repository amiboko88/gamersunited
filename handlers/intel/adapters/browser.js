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
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

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
                                await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 120000 });
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
    async getMetaContent(url) {
        return this._fetchPage(url, () => {
            // WZHUB / WZSTATS Specific Extraction
            const weapons = [];

            // Try WZHUB Structure
            // Look for cards or list items
            const cards = document.querySelectorAll('.meta-loadout, .loadout-card, .weapon-card');

            if (cards.length > 0) {
                cards.forEach((card, index) => {
                    if (index >= 5) return; // Top 5
                    const name = card.querySelector('.weapon-name, h3, .name')?.innerText || "Unknown";
                    const type = card.querySelector('.weapon-type, .type')?.innerText || "";
                    const tier = card.querySelector('.tier-badge, .meta-tier')?.innerText || "META";

                    // Get Attachments if visible
                    const attachments = [];
                    card.querySelectorAll('.attachment, .att-name').forEach(att => attachments.push(att.innerText));

                    weapons.push({ name, type, tier, attachments });
                });
            } else {
                // Fallback: Just get text content if structure changes
                return document.body.innerText.slice(0, 10000);
            }

            return JSON.stringify(weapons);
        });
    }
    async getScreenshot(url, selector) {
        let page = null;
        try {
            const b = await this._getBrowser();
            page = await b.newPage();
            // High Res
            await page.setViewport({ width: 1920, height: 1200, deviceScaleFactor: 2 });

            log(`[Browser] 📸 Navigating to ${url} for Screenshot...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Try Element Screenshot First
            try {
                let element;

                // SPECIAL HANDLER: Text Search Selector
                if (selector.startsWith('text:') || selector.startsWith('text_exact:')) {
                    const isExact = selector.startsWith('text_exact:');
                    const searchText = isExact ? selector.replace('text_exact:', '').trim() : selector.replace('text:', '').trim();
                    log(`[Browser] 🔍 Searching specific element by text (${isExact ? 'Exact' : 'Partial'}): "${searchText}"...`);

                    // Wait for hydration
                    await new Promise(r => setTimeout(r, 3000));

                    const handle = await page.evaluateHandle(({ txt, isExact }) => {
                        // 1. Find Header
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                        let node, headerEl;
                        while (node = walker.nextNode()) {
                            const val = node.nodeValue.trim();
                            const match = isExact
                                ? val.toLowerCase() === txt.toLowerCase()
                                : val.toLowerCase().includes(txt.toLowerCase());

                            if (match) {
                                const elCandidate = node.parentElement;
                                const rect = elCandidate.getBoundingClientRect();
                                // Category headers are usually wide and visible.
                                // Badges/cards are narrow. Footer is way down.
                                if (rect.width > 200 && rect.top < 10000) {
                                    headerEl = elCandidate;
                                    // Climb to block element if needed
                                    while (headerEl && !['H1', 'H2', 'H3', 'H4', 'DIV', 'SECTION'].includes(headerEl.tagName)) {
                                        headerEl = headerEl.parentElement;
                                    }
                                    break;
                                }
                            }
                        }

                        if (!headerEl) return null;

                        // 2. Wrap Siblings (Smart Grouping)
                        const wrapper = document.createElement('div');
                        wrapper.style.display = 'block';
                        wrapper.style.width = 'max-content';
                        wrapper.style.minWidth = '800px';
                        wrapper.style.padding = '30px';
                        wrapper.style.background = '#0a0a0a'; // Dark professional background
                        wrapper.style.borderRadius = '12px';
                        wrapper.id = 'temp-screenshot-wrapper';

                        // Insert wrapper before header
                        headerEl.parentElement.insertBefore(wrapper, headerEl);

                        // Move Header into wrapper
                        wrapper.appendChild(headerEl);

                        // Move Siblings until next Header
                        let next = wrapper.nextElementSibling;
                        let count = 0;
                        while (next && count < 20) { // Safety limit
                            // Stop if we hit a new Section Header
                            if (['H1', 'H2', 'H3', 'H4'].includes(next.tagName) && next.innerText.length > 2) {
                                break;
                            }
                            // Stop if footer or huge container
                            if (next.tagName === 'FOOTER') break;

                            const toMove = next;
                            next = next.nextElementSibling;
                            wrapper.appendChild(toMove);
                            count++;
                        }

                        return wrapper;

                    }, { txt: searchText, isExact });

                    if (handle && handle.asElement()) {
                        element = handle.asElement();
                    } else {
                        throw new Error(`Text "${searchText}" not found.`);
                    }

                } else {
                    // Standard CSS Selector
                    await page.waitForSelector(selector, { timeout: 15000 });
                    element = await page.$(selector);
                }

                // Clean Ads globally if possible?
                await page.evaluate(() => {
                    const ads = document.querySelectorAll('.ad, .adsbygoogle, iframe, [class*="ad-"]');
                    ads.forEach(ad => ad.style.display = 'none');
                });

                if (element) {
                    return await element.screenshot();
                }
            } catch (e) {
                log(`[Browser] ⚠️ Section screenshot failed (${selector}): ${e.message}. Fallback to Viewport.`);
            }

            // Fallback: Full Viewport
            return await page.screenshot({ fullPage: false });

        } catch (error) {
            log(`❌ [Browser] Screenshot Error: ${error.message}`);
            if (page) await page.close().catch(() => { });
            return null;
        } finally {
            if (page) await page.close().catch(() => { });
        }
    }

    async getDetailedScreenshot(url, targetText) {
        let page = null;
        try {
            const b = await this._getBrowser();
            page = await b.newPage();
            // Desktop width for full detail
            await page.setViewport({ width: 1920, height: 1200, deviceScaleFactor: 2 });

            log(`[Browser] 🔭 Hunting for loadout "${targetText}" on ${url}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

            // Wait for list to render (Support Angular/BFHUB/WZHUB)
            // Relaxed selector to ensure we don't timeout if specific class is missing
            await page.waitForSelector('.loadout-card, .meta-grid, app-root, main, .loadouts-list, body', { timeout: 20000 });

            // Wait for Target Text to appear (Hydration check)
            try {
                await page.waitForFunction(
                    (text) => document.body.innerText.toUpperCase().includes(text.toUpperCase()),
                    { timeout: 10000 },
                    targetText
                );
            } catch (e) {
                log(`[Browser] ⚠️ Timed out waiting for text "${targetText}" to appear.`);
            }

            // Logic: Find Card -> Click Expand -> Screenshot
            const result = await page.evaluate(async (text) => {
                // Helper to find text safely
                const containsText = (el, t) => el.innerText && el.innerText.toUpperCase().includes(t.toUpperCase());

                // 1. Find all cards (Try precise selectors first)
                let cards = Array.from(document.querySelectorAll('.loadout-card, .meta-row, app-loadout-card, div[class*="card"]'));
                let targetCard = cards.find(c => containsText(c, text));

                // 2. Fallback: Smart Text Search
                if (!targetCard) {
                    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.nodeValue.toUpperCase().includes(text.toUpperCase())) {
                            let el = node.parentElement;
                            let bestCandidate = null;

                            for (let i = 0; i < 8; i++) {
                                if (!el || el === document.body) break;

                                if (el.tagName === 'LI' || el.tagName === 'APP-LOADOUT-CARD') {
                                    bestCandidate = el;
                                    break;
                                }

                                const style = window.getComputedStyle(el);
                                if (el.offsetWidth > 200 && (style.display === 'flex' || style.display === 'grid' || el.classList.contains('loadout-card'))) {
                                    bestCandidate = el;
                                    if (el.offsetHeight > 100) break;
                                }
                                el = el.parentElement;
                            }

                            targetCard = bestCandidate || el;
                            if (targetCard) break;
                        }
                    }
                }

                if (!targetCard) return null;

                // 3. Find Expand Button OR Click Card
                // Try to find the specific WZStats cursor element first (User Tip)
                const cursorBtn = targetCard.querySelector('.loadout-content.cursor');
                const standardBtn = targetCard.querySelector('.loadout-card__toggle-btn, .expand-btn, button, [role="button"], .chevron');

                // WZHUB Specific: Look for "Show Details" button text
                const showDetailsBtn = Array.from(targetCard.querySelectorAll('button')).find(b => b.innerText.toUpperCase().includes('SHOW DETAILS'));

                if (showDetailsBtn) {
                    showDetailsBtn.click();
                } else if (cursorBtn) {
                    cursorBtn.click();
                } else if (standardBtn) {
                    standardBtn.click();
                } else {
                    targetCard.click();
                }

                // AD BLOCKING / CLEANUP
                const ads = targetCard.querySelectorAll('.ad, .adsbygoogle, iframe, div[id*="google_ads"], .ad-slot, a[href*="vpn"], .promo-banner, .support-banner, [class*="ad-"]');
                ads.forEach(ad => ad.style.display = 'none');

                // Mark it for retrieval
                targetCard.setAttribute('data-screenshot-target', 'true');
                return true;
            }, targetText);

            if (!result) {
                log(`[Browser] ⚠️ Could not find weapon card for "${targetText}"`);
                await page.close();
                return null;
            }

            // Wait for expansion animation
            await new Promise(r => setTimeout(r, 2000));

            // Get Handle
            const element = await page.$('[data-screenshot-target="true"]');

            if (!element) throw new Error("Target element lost after interaction.");

            // Extract Build Code (Robust Search)
            const buildCode = await page.evaluate(el => {
                // Strategy 1: "LOADOUT CODE" Label (WZHUB Style)
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                let node;
                while (node = walker.nextNode()) {
                    if (node.nodeValue.toUpperCase().includes('LOADOUT CODE') || node.nodeValue.toUpperCase().includes('BUILD CODE')) {
                        const parent = node.parentElement;
                        const fullText = parent.innerText.trim();

                        // Check sibling (The code is usually next to the label)
                        if (fullText.toUpperCase().includes('CODE')) {
                            const sibling = parent.nextElementSibling;
                            if (sibling) return sibling.innerText.trim();
                            // Or maybe inside the same parent but after newline
                            const parts = fullText.split('\n');
                            if (parts.length > 1) return parts[parts.length - 1].trim();
                        }
                    }
                }

                // Strategy 2: WZHUB Copy Button (Yellow icon)
                // Look for svg or button near the code

                // Strategy 3: Regex Fallback
                const text = el.innerText;
                // Pattern: XXX-XXXXX-XXXX (e.g. S07-6WVQQ-A711) or WZHUB style (A01-AUXZ7-Y5BD1-1)
                // Generalized: [A-Z0-9]{3,5}-[A-Z0-9]{5}-[A-Z0-9]{3,5}
                const match = text.match(/[A-Z0-9]{3,4}-[A-Z0-9]{5,6}-[A-Z0-9]{3,8}(-[0-9])?/);
                if (match) return match[0];

                return null;
            }, element);

            log(`[Browser] 🧬 Extracted Build Code: ${buildCode}`);

            // Scroll into view nicely
            await element.scrollIntoViewIfNeeded();

            // Screenshot
            const buffer = await element.screenshot({ omitBackground: true });
            await page.close();

            return { buffer, buildCode };

        } catch (error) {
            log(`❌ [Browser] Detail Screenshot Error: ${error.message}`);
            if (page) await page.close().catch(() => { });
            return null;
        }
    }
}

module.exports = new BrowserAdapter();
