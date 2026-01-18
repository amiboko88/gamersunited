const puppeteer = require('puppeteer');

/**
 * Scraper module for Warzone Intel (WZStats.gg EXCLUSIVE)
 * Strategy: Navigate to Root, Find Meta Link, Scrape Data.
 * Purpose: Provide Shimon with 100% accurate, user-verified data from wzstats.gg.
 */

async function fetchMeta() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('[Scraper] Navigating to https://wzstats.gg/ ...');
        await page.goto('https://wzstats.gg/', { waitUntil: 'networkidle2', timeout: 60000 });

        // Dynamic Navigation: Find the "Meta" Button
        const metaUrl = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            // Look for "Meta" or "Loadouts" link
            const metaLink = links.find(a =>
                (a.innerText && a.innerText.toLowerCase().includes('meta')) ||
                (a.href && a.href.includes('meta'))
            );
            return metaLink ? metaLink.href : null;
        });

        if (metaUrl) {
            console.log(`[Scraper] Found Meta Page: ${metaUrl}. Navigating...`);
            await page.goto(metaUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        } else {
            console.log('[Scraper] Could not find explicit Meta link. Scanning current page...');
        }

        await new Promise(r => setTimeout(r, 4000)); // Allow hydration

        const weapons = await page.evaluate(() => {
            const extracted = [];
            // Generic "Card" Strategy for WZStats
            // We look for CONTAINERS that have:
            // 1. A Name (Caps, short)
            // 2. A "Meta" tag or Rank
            // 3. A Code pattern (S10-...)

            const allDivs = Array.from(document.querySelectorAll('div, li, tr'));

            // Filter for candidates (heuristic)
            const candidates = allDivs.filter(d => {
                const t = d.innerText;
                if (!t || t.length > 500 || t.length < 20) return false;
                // Strict: Must have "Meta" or "Tier" AND a Code-like pattern
                // OR be very explicitly a loadout card
                return (t.includes('Meta') || t.includes('Tier') || t.includes('Pick')) &&
                    (t.match(/(S\d+-[A-Z0-9]+)/) || t.includes('Muzzle')); // Code or Attachment word
            });

            candidates.forEach(card => {
                const fullText = card.innerText;
                const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                // Name Finding:
                // Usually the first line or a line with caps
                let name = null;
                const nameLine = lines.find(l => /^[A-Z0-9\s-]{3,20}$/.test(l) && !l.includes('META') && !l.includes('TIER'));
                if (nameLine) name = nameLine;

                // Code Finding:
                const codeMatch = fullText.match(/(S\d+-[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?)/i);
                let code = codeMatch ? codeMatch[0] : null;

                if (name && (code || fullText.toLowerCase().includes('muzzle'))) {
                    // Deduplication check
                    if (!extracted.find(e => e.name === name)) {
                        extracted.push({
                            name: name,
                            type: 'Meta',
                            mode: 'General',
                            build_code: code || 'Check Link',
                            details: fullText.replace(name, '').substring(0, 150)
                        });
                    }
                }
            });

            return extracted.slice(0, 5); // Return top 5
        });

        if (weapons.length > 0) {
            console.log(`[Scraper] Successfully extracted ${weapons.length} weapons.`);
            return weapons;
        } else {
            console.log('[Scraper] Failed to find weapons on WZStats. Layout might be complex.');
            return [];
        }

    } catch (error) {
        console.error('Error fetching Meta:', error);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

async function checkUpdates() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto('https://www.callofduty.com/patchnotes', { waitUntil: 'domcontentloaded', timeout: 90000 });

        const latestUpdate = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const updateLink = links.find(a => {
                const text = (a.innerText || "").toLowerCase();
                const href = (a.href || "").toLowerCase();
                return (text.includes('season') || text.includes('update')) && href.includes('warzone');
            });

            if (updateLink) {
                const card = updateLink.closest('div.card') || updateLink.parentElement.parentElement;
                let dateText = new Date().toISOString();
                if (card) {
                    const timeEl = card.querySelector('time, .date, [class*="date"]');
                    if (timeEl) dateText = timeEl.getAttribute('datetime') || timeEl.innerText;
                }
                return {
                    title: updateLink.innerText || "New Warzone Update",
                    url: updateLink.href,
                    date: dateText
                };
            }
            return null;
        });

        if (latestUpdate) {
            const updateDate = new Date(latestUpdate.date);
            const now = new Date();
            const daysDiff = (now - updateDate) / (1000 * 60 * 60 * 24);
            // Relaxed date check for seasons
            if (daysDiff > 14 && !latestUpdate.title.toLowerCase().includes('season')) {
                console.log(`[Scraper] Update found but too old (${daysDiff.toFixed(1)} days). Ignoring.`);
                return null;
            }
        }
        return latestUpdate;
    } catch (error) {
        console.error('Error checking updates:', error);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

async function getUpdateContent(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const content = await page.evaluate(() => document.body.innerText.slice(0, 5000));
        return content;
    } catch (error) {
        console.error('Error fetching content:', error);
        return "";
    } finally {
        if (browser) await browser.close();
    }
}

async function checkNvidiaDrivers() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.goto('https://www.nvidia.com/en-us/geforce/drivers/', { waitUntil: 'networkidle2', timeout: 30000 });
        const driverInfo = await page.evaluate(() => {
            const allText = document.body.innerText;
            const versionMatch = allText.match(/Version:\s*([0-9\.]+)/);
            const dateMatch = allText.match(/Release Date:\s*([0-9]{4}\.[0-9]{2}\.[0-9]{2}|[A-Za-z]+ [0-9]{1,2}, [0-9]{4})/); // loose date match
            if (versionMatch) {
                return {
                    version: versionMatch[1],
                    date: dateMatch ? dateMatch[1] : new Date().toISOString()
                };
            }
            return null;
        });
        return driverInfo;
    } catch (error) {
        console.error('Error checking Nvidia drivers:', error);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = {
    fetchMeta,
    checkUpdates,
    getUpdateContent,
    checkNvidiaDrivers
};
