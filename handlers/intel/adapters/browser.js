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

            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'media', 'websocket'].includes(req.resourceType())) { // Allow stylesheet/font for layout
                    req.abort();
                } else {
                    req.continue();
                }
            });

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
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

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

            page.on('console', msg => log(`[Browser Console] 🧩 ${msg.text()}`));

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
            const result = await page.evaluate(async (target) => {
                // --- Fuzzy Search Logic (Levenshtein-ish) ---
                function getScore(str1, str2) {
                    const s1 = str1.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const s2 = str2.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (s1 === s2) return 1.0;
                    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

                    // Simple shared character count for short strings
                    let matches = 0;
                    for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
                        if (s1[i] === s2[i]) matches++;
                    }
                    return matches / Math.max(s1.length, s2.length);
                }

                // 1. Gather all candidates
                // Support WZHUB, WZSTATS, BFHUB layouts
                let candidates = Array.from(document.querySelectorAll('.loadout-card, .meta-row, app-loadout-card, div[class*="card"], li.weapon-item'));
                let bestCard = null;
                let bestScore = 0;

                // 2. Score each candidate
                for (const card of candidates) {
                    const text = card.innerText || "";
                    // Check Weapon Name specifically if possible
                    const nameEl = card.querySelector('.weapon-name, h3, .name, .title');
                    const cleanText = nameEl ? nameEl.innerText : text;

                    const score = getScore(cleanText, target);

                    if (score > bestScore) {
                        bestScore = score;
                        bestCard = card;
                    }
                }

                // Threshold (0.6 means roughly 60% match, e.g. KOGUT vs KOGOT is 4/5 = 0.8)
                if (bestScore < 0.6) {
                    // Last Resort: Global Text Search if structure failed
                    if (document.body.innerText.toUpperCase().includes(target.toUpperCase())) {
                        // Fallback to strict search old logic if found in body but not in cards
                        // (Not implemented here to keep it simple, usually finding the card is key)
                    }
                    return null;
                }

                const targetCard = bestCard;

                // 3. Find Expand Button OR Click Card
                // 3. Find Expand Button OR Click Card


                // Prioritize "SHOW DETAILS" anywhere in the card
                const allEls = Array.from(targetCard.querySelectorAll('*'));
                const showDetailsEl = allEls.find(el => el.innerText && el.innerText.toUpperCase().includes('SHOW DETAILS'));
                if (showDetailsEl) {
                    showDetailsEl.click();
                } else {
                    const cursorBtn = targetCard.querySelector('.loadout-content.cursor');
                    const standardBtn = targetCard.querySelector('.loadout-card__toggle-btn, .expand-btn, button, [role="button"], .chevron');
                    if (cursorBtn) cursorBtn.click();
                    else if (standardBtn) standardBtn.click();
                    else targetCard.click();
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

            // WZHUB: Wait for validation of expansion
            try {
                // Try to wait for an attachment or code to appear visible
                await page.waitForFunction(
                    (el) => el.innerText.length > 50,
                    { timeout: 3000 },
                    await page.$('[data-screenshot-target="true"]')
                );
            } catch (e) { }

            // CRITICAL: Robust Content-Based Finding (Ignore DOM IDs/Classes)
            const ElementHandle = await page.evaluateHandle((target) => {
                // 1. Scan for Build Code Pattern globally
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node, codeNode;
                const codeRegex = /[A-Z0-9]{3,4}-[A-Z0-9]{5,6}-[A-Z0-9]{3,8}/;

                while (node = walker.nextNode()) {
                    if (codeRegex.test(node.nodeValue)) {
                        codeNode = node.parentElement;
                        break;
                    }
                }

                if (codeNode) {
                    // Found the code! Climb up to a reasonable container (Card)
                    let container = codeNode;
                    while (container && container.tagName !== 'BODY') {
                        if (container.classList.contains('loadout-card') ||
                            container.classList.contains('meta-row') ||
                            container.innerText.length > 500 || // Big container
                            container.parentElement.tagName === 'BODY') {
                            return container;
                        }
                        container = container.parentElement;
                    }
                    return codeNode.parentElement.parentElement; // Fallback
                }

                // 2. If no code found, look for Weapon Name + "Muzzle" (Expanded content)
                const rows = Array.from(document.querySelectorAll('div, li, section'));
                for (const row of rows) {
                    if (row.innerText.includes(target) && row.innerText.includes('Muzzle')) {
                        return row;
                    }
                }

                // 3. Fallback to attribute
                return document.querySelector('[data-screenshot-target="true"]');
            }, targetText);

            let element = null;
            if (ElementHandle && ElementHandle.asElement()) {
                element = ElementHandle.asElement();
            }

            if (!element) {
                log(`[Browser] ⚠️ Target element lost. Fallback to viewport screenshot.`);
                const buffer = await page.screenshot({ fullPage: false });
                await page.close();
                return { buffer, buildCode: null, attachments: [] };
            }

            // Debug innerText before processing
            const fullText = await page.evaluate(el => el.innerText, element);
            log(`[Browser] 📝 Found Text (${fullText.length} chars): ${fullText.substring(0, 100).replace(/\n/g, ' ')}...`);

            // Extract Build Code AND Attachments (Robust Search)
            const extractedData = await page.evaluate(el => {
                const data = { buildCode: null, attachments: [] };

                // 1. Build Code extraction (Existing strategies)
                const text = el.innerText;
                const codeMatch = text.match(/[A-Z0-9]{3,4}-[A-Z0-9]{5,6}-[A-Z0-9]{3,8}(-[0-9])?/);
                if (codeMatch) data.buildCode = codeMatch[0];

                // 2. Attachments Extraction
                // Look for common attachment structures
                // WZHUB: .attachment-name, .wrapper .name
                const attEls = el.querySelectorAll('.attachment, .att-name, .wrapper, .setup-item');
                attEls.forEach(att => {
                    // Try to separate Slot from Name if possible
                    // Often: "Muzzle" (label) -> "Sonic Suppressor" (value)
                    const label = att.querySelector('.label, .type, .slot')?.innerText;
                    const value = att.querySelector('.name, .value, .attachment-name')?.innerText || att.innerText;

                    if (value && value.length > 2 && !value.includes('Unlock')) {
                        // Cleanup
                        const cleanVal = value.replace(/\n/g, ' ').replace('META', '').trim();
                        if (cleanVal !== data.buildCode) {
                            data.attachments.push(label ? `${label}: ${cleanVal}` : cleanVal);
                        }
                    }
                });

                // Fallback: simple text line scan if no classes found
                if (data.attachments.length === 0) {
                    const lines = text.split('\n');
                    // Filter out noise
                    data.attachments = lines.filter(l =>
                        l.length > 3 &&
                        !l.includes('Build Code') &&
                        !l.includes(data.buildCode) &&
                        !['META', 'ABSOLUTE', 'TIER'].includes(l.toUpperCase())
                    ).slice(0, 5); // Take first 5 logical lines as candidates
                }

                return data;
            }, element);

            log(`[Browser] 🧬 Element Text Dump (First 100 chars): ${await page.evaluate(el => el.innerText.substring(0, 100).replace(/\n/g, ' '), element)}`);
            log(`[Browser] 🧬 Extracted: Code=${extractedData.buildCode}, Atts=${extractedData.attachments.length}`);

            // Scroll into view nicely
            await element.scrollIntoViewIfNeeded();

            // Screenshot
            const buffer = await element.screenshot({ omitBackground: true });
            await page.close();

            return { buffer, buildCode: extractedData.buildCode, attachments: extractedData.attachments };

        } catch (error) {
            log(`❌ [Browser] Detail Screenshot Error: ${error.message}`);
            if (page) await page.close().catch(() => { });
            return null;
        }
    }
}

module.exports = new BrowserAdapter();
