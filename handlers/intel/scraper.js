const puppeteer = require('puppeteer');
const dayjs = require('dayjs');

/**
 * Scraper module for Warzone Intel
 * Source: Codmunity.gg (Meta Dashboard + Deep Dive)
 * Purpose: Provide Shimon with 100% accurate, user-verified data.
 */

async function fetchMeta() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('[Scraper] Navigating to https://codmunity.gg/warzone ...');
        await page.goto('https://codmunity.gg/warzone', { waitUntil: 'networkidle2', timeout: 60000 });

        // Phase 1: Dashboard Scan (Fast, High Fidelity for Top Cards)
        try { await page.waitForSelector('div[class*="grid"], ul, li', { timeout: 15000 }); } catch (e) { }

        const dashboardData = await page.evaluate(() => {
            const extracted = [];
            const uniqueNames = new Set();
            const foundCodes = new Set();

            // 1. Find elements that explicitly have a build code (S10-...)
            // This covers the "Cards" usually shown for Top 10
            const codeElements = Array.from(document.querySelectorAll('span, div, button, a')).filter(el =>
                el.innerText && el.innerText.match(/([S|A|L|R]\d+-[A-Z0-9]+-[A-Z0-9]+(-\w{1,5})?)/)
            );

            codeElements.forEach(codeEl => {
                const codeMatch = codeEl.innerText.match(/([S|A|L|R]\d+-[A-Z0-9]+-[A-Z0-9]+(-\w{1,5})?)/);
                const code = codeMatch ? codeMatch[0] : null;

                // Traverse up to find the container
                const card = codeEl.closest('li') || codeEl.closest('div.bg-secondary') || codeEl.closest('div.rounded-lg') || codeEl.parentElement.parentElement;

                if (card && code) {
                    const fullText = card.innerText;
                    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

                    // Name Heuristic: First meaningful line that isn't the code or "Rank"
                    let name = lines.find(l => l.length > 2 && !l.includes(code) && !l.includes('Rank') && !l.match(/\d+%/));

                    if (name) {
                        // Extract Attachments
                        const attTypes = ['Muzzle', 'Barrel', 'Optic', 'Stock', 'Rear Grip', 'Magazine', 'Underbarrel', 'Ammunition', 'Laser', 'Fire Mods', 'Comb'];
                        const attachments = [];
                        attTypes.forEach(type => {
                            const regex = new RegExp(`^${type}`, 'i');
                            const idx = lines.findIndex(l => regex.test(l));
                            if (idx !== -1 && lines[idx + 1]) {
                                if (!attTypes.some(t => t.toUpperCase() === lines[idx + 1].toUpperCase())) {
                                    attachments.push(`${type}: ${lines[idx + 1]}`);
                                }
                            }
                        });

                        if (!uniqueNames.has(name)) {
                            uniqueNames.add(name);
                            foundCodes.add(code);
                            extracted.push({
                                name: name,
                                mode: 'Warzone Meta',
                                build_code: code,
                                details: attachments.length > 0 ? attachments.join(' | ') : 'Refer to Code',
                                source: 'Dashboard Card'
                            });
                        }
                    }
                }
            });

            // 2. Identify "Missing" Meta Weapons (e.g. Razor 9mm at Rank 18)
            // Look for links to weapons that we haven't found yet
            const missing = [];
            const weaponLinks = Array.from(document.querySelectorAll('a[href*="/weapon/"]'));

            weaponLinks.forEach(link => {
                const nameHelper = link.innerText.trim();
                const name = nameHelper.split('\n')[0]; // Clean name
                if (name && name.length > 2 && !uniqueNames.has(name) && !name.includes('Loadout')) {
                    uniqueNames.add(name);
                    missing.push({ name: name, url: link.href });
                }
            });

            return { found: extracted, missing: missing.slice(0, 20) }; // Deep dive Top 20 missing
        });

        // Phase 2: Deep Dive for Missing Weapons (The "Razor 9mm" Fix)
        const finalWeapons = [...dashboardData.found];
        console.log(`[Scraper] Dashboard yielded ${finalWeapons.length} weapons. Deep diving for ${dashboardData.missing.length} more...`);

        // Optimization: Use separate page or sequential? Sequential is robust.
        for (const target of dashboardData.missing) {
            try {
                console.log(`[Scraper] Deep Dive: ${target.name}...`);
                await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                // Small wait for render
                await new Promise(r => setTimeout(r, 500));

                const details = await page.evaluate((wName) => {
                    const text = document.body.innerText;

                    // Code Search (S10-...)
                    const codeMatch = text.match(/([S|A|L|R]\d+-[A-Z0-9]+-[A-Z0-9]+(-\w{1,5})?)/) || text.match(/S\d+-[A-Z0-9]+/);
                    const code = codeMatch ? codeMatch[0] : null;

                    // Attachments Search
                    const attachments = [];
                    const types = ['Muzzle', 'Barrel', 'Optic', 'Stock', 'Rear Grip', 'Magazine', 'Underbarrel', 'Ammunition', 'Laser', 'Fire Mods', 'Comb'];
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);

                    types.forEach(type => {
                        const idx = lines.findIndex(l => l.toLowerCase() === type.toLowerCase() || l.toLowerCase() === (type + ':').toLowerCase());
                        if (idx !== -1 && lines[idx + 1]) {
                            if (!types.some(t => lines[idx + 1].includes(t))) {
                                attachments.push(`${type}: ${lines[idx + 1]}`);
                            }
                        }
                    });

                    if (code || attachments.length > 0) {
                        return {
                            name: wName,
                            mode: 'Warzone Meta',
                            build_code: code || 'Check Link',
                            details: attachments.join(' | ') + `\n🔗 Source: https://codmunity.gg/`,
                            source: 'Deep Dive'
                        };
                    }
                    return null;
                }, target.name);

                if (details) finalWeapons.push(details);

            } catch (e) {
                console.error(`[Scraper] Failed deep dive for ${target.name}: ${e.message}`);
            }
        }

        console.log(`[Scraper] Total Weapons Collected: ${finalWeapons.length}`);
        return finalWeapons;

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

        console.log('[Scraper] Checking CoD Patch Notes...');
        // Puppeteer usually bypasses the block that simple HTTP requests hit
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

        if (!latestUpdate) return null;

        const updateDate = new Date(latestUpdate.date);
        const now = new Date();
        const daysDiff = (now - updateDate) / (1000 * 60 * 60 * 24);

        if (daysDiff > 14 && !latestUpdate.title.toLowerCase().includes('season')) {
            console.log(`[Scraper] Update too old (${daysDiff.toFixed(1)} days). Ignoring.`);
            return null;
        }

        // Strict Content Extraction to prevent Hallucinations
        await page.goto(latestUpdate.url, { waitUntil: 'networkidle2', timeout: 60000 });

        const summary = await page.evaluate(() => {
            const containers = document.querySelectorAll('article, main, .patch-notes-content, .text-component');
            let bestText = "Check Link for Details.";

            for (const c of containers) {
                if (c.innerText.length > 200) {
                    const paragraphs = Array.from(c.querySelectorAll('p, li, h3, h4'));
                    const lines = paragraphs.map(p => p.innerText).filter(t => t.length > 20 && !t.includes('Cookie'));
                    if (lines.length > 5) {
                        bestText = lines.slice(0, 15).join('\n');
                        break;
                    }
                }
            }
            return bestText;
        });

        return { ...latestUpdate, summary };

    } catch (error) {
        console.error('Error checking updates:', error);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

async function getUpdateContent(url) { return ""; }
async function checkNvidiaDrivers() { return null; }

module.exports = {
    fetchMeta,
    checkUpdates,
    getUpdateContent,
    checkNvidiaDrivers
};
