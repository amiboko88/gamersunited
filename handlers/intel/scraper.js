const puppeteer = require('puppeteer');

/**
 * Scraper module for Warzone Intel
 * Source: Codmunity.gg (Meta) & Call of Duty Official (Updates)
 * Purpose: Provide Shimon with 100% accurate, user-verified data.
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

        console.log('[Scraper] Navigating to https://codmunity.gg/warzone ...');
        await page.goto('https://codmunity.gg/warzone', { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for list
        try {
            await page.waitForSelector('.w-full', { timeout: 15000 });
        } catch (e) { console.log('Timeout waiting for list selector'); }

        const metaWeapons = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/weapon/"]'));

            const results = [];
            const unique = new Set();

            links.forEach(link => {
                const container = link.closest('li') || link.closest('div.flex');
                const text = container ? container.innerText : link.innerText;

                const nameHelper = link.innerText.trim();
                const cleanName = nameHelper.split('\n')[0].trim();

                if (cleanName && cleanName.length > 2 && !unique.has(cleanName) && !cleanName.includes('Loadout')) {

                    const codeMatch = text.match(/([A-Z0-9]{3}-\w{5}-\w{5}(-\w{1,5})?)/) || text.match(/([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)/);
                    const code = codeMatch ? codeMatch[0] : null;

                    unique.add(cleanName);
                    results.push({
                        name: cleanName,
                        url: link.href,
                        prefetched_code: code
                    });
                }
            });

            return results.slice(0, 10);
        });

        console.log(`[Scraper] Found ${metaWeapons.length} weapons. Fetching details...`);
        const fullCloud = [];

        for (const weapon of metaWeapons) {
            try {
                console.log(`[Scraper] Fetching details for ${weapon.name}...`);
                await page.goto(weapon.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(r => setTimeout(r, 1500));

                const buildDetails = await page.evaluate((wName, wCode) => {
                    const text = document.body.innerText;
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

                    let code = wCode;
                    if (!code) {
                        const codeMatch = text.match(/([A-Z0-9]{3}-\w{5}-\w{5}(-\w{1,5})?)/) || text.match(/S\d+-[A-Z0-9]+/);
                        if (codeMatch) code = codeMatch[0];
                    }

                    if (attachments.length > 0 || code) {
                        return {
                            name: wName,
                            mode: 'Warzone Meta',
                            build_code: code || 'Check Link',
                            details: attachments.join(' | ') + `\n🔗 https://codmunity.gg/`
                        };
                    }
                    return null;
                }, weapon.name, weapon.prefetched_code);

                if (buildDetails) fullCloud.push(buildDetails);

            } catch (err) {
                console.error(`[Scraper] Failed to detail ${weapon.name}:`, err.message);
            }
        }

        return fullCloud;

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

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

        const content = await page.evaluate(() => {
            const article = document.querySelector('article') || document.querySelector('main') || document.body;
            const elements = Array.from(article.querySelectorAll('h1, h2, h3, p, li'));
            let text = "";
            elements.forEach(el => {
                if (el.innerText.length > 10) {
                    text += el.innerText + "\n";
                }
            });
            return text.slice(0, 6000);
        });
        return content;
    } catch (error) {
        console.error('Error fetching content:', error);
        return "";
    } finally {
        if (browser) await browser.close();
    }
}

async function checkNvidiaDrivers() {
    return null;
}

module.exports = {
    fetchMeta,
    checkUpdates,
    getUpdateContent,
    checkNvidiaDrivers
};
