const puppeteer = require('puppeteer');

/**
 * Scraper module for Warzone Intel (wzstats.gg & callofduty.com)
 * Handles headless browser interactions to fetch data without API costs.
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

        // Define sources to scrape
        const sources = [
            { mode: 'Battle Royale', url: 'https://wzstats.gg/warzone-meta' },
            { mode: 'Resurgence', url: 'https://wzstats.gg/warzone-resurgence-meta' } // Likely URL based on SEO patterns
        ];

        const allMeta = [];

        for (const source of sources) {
            try {
                console.log(`[Scraper] Fetching ${source.mode} from ${source.url}...`);
                await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

                // Wait a bit for dynamic content
                await new Promise(r => setTimeout(r, 2000));

                const weapons = await page.evaluate((mode) => {
                    const extracted = [];
                    // Aggressive Text Dump of all "Cards"
                    // We look for any container that has "Meta" or Rank # numbers.
                    const allDivs = Array.from(document.querySelectorAll('div'));

                    // Filter for candidates (heuristic)
                    const candidates = allDivs.filter(d => {
                        const t = d.innerText;
                        return t && t.length < 500 && (t.includes('#1') || t.includes('#2') || t.includes('#3') || t.includes('Meta'));
                    });

                    // Parse candidates
                    candidates.forEach(card => {
                        const fullText = card.innerText;
                        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        let name = null;
                        let code = null;

                        // Find Name (Usually uppercase, short, not a keyword)
                        const nameLine = lines.find(l => l.length > 3 && l.length < 20 && !l.includes('Meta') && /^[A-Z0-9 -]+$/.test(l));
                        if (nameLine) name = nameLine;

                        // Find Code (Format: S07-... or S10-...)
                        // More robust regex for codes (allowing 3 or more segments)
                        const codeLine = lines.find(l => /(S\d+-[A-Z0-9]{3,}-)/i.test(l));
                        if (codeLine) {
                            const match = codeLine.match(/(S\d+-[A-Z0-9]{4,}-[A-Z0-9]{4,})/i);
                            // Matches S10-6K64Z-5551 format
                            if (match) code = match[0];
                        }

                        if (name && code) {
                            // Cleaning the text to serve as "Intel" for the AI
                            // We remove the exact code and name to reduce noise, but keep attachments/tags
                            const rawDetails = fullText.replace(name, '').replace(code, '').replace(/\n+/g, ' ').slice(0, 150);

                            // Check if already exists to avoid dupes from nested divs
                            if (!extracted.find(e => e.name === name)) {
                                extracted.push({
                                    name: name,
                                    type: 'Meta',
                                    mode: mode,
                                    build_code: code,
                                    // Capture 'Close Range', 'Sniper Support', Attachment names... everything visible
                                    details: rawDetails.trim()
                                });
                            }
                        }
                    });

                    // Slice to top 5 per mode to keep it relevance
                    return extracted.slice(0, 5);
                }, source.mode);

                allMeta.push(...weapons);

            } catch (err) {
                console.error(`[Scraper] Failed to scrape ${source.mode}: ${err.message}`);
            }
        }
        // If automatic scraping returned garbage, return null to avoid hallucinations
        if (!allMeta || allMeta.length === 0) {
            console.log('[Scraper] Failed to find any weapons. Returning empty.');
            return [];
        }

        return allMeta; // Returns flat array mixed modes

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

            // Find the first WZ card that looks relevant
            const updateLink = links.find(a => {
                const text = (a.innerText || "").toLowerCase();
                const href = (a.href || "").toLowerCase();
                return (text.includes('season') || text.includes('update')) && href.includes('warzone');
            });

            if (updateLink) {
                // Try to find a date near the link
                // The COD site usually has a <time> element or date class
                const card = updateLink.closest('div.card') || updateLink.parentElement.parentElement;
                let dateText = new Date().toISOString(); // Default to now if not found

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

        // 🛡️ DATE VALIDATION (Security against old updates)
        if (latestUpdate) {
            const updateDate = new Date(latestUpdate.date);
            const now = new Date();
            const daysDiff = (now - updateDate) / (1000 * 60 * 60 * 24);

            // If the update is older than 7 days, we ignore it as "News"
            if (daysDiff > 7 && !latestUpdate.url.includes('season')) { // Always reporting Season updates even if slightly old
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

        const content = await page.evaluate(() => {
            return document.body.innerText.slice(0, 5000);
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
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        // NVIDIA official driver search results page (filtered for common GeForce cards usually)
        // A generic robust page is the 'GeForce Drivers' news/feed or specific API endpoint.
        // For simplicity/robustness without complex form submission, we check the "GeForce News" or a known tracking site.
        // However, NVIDIA has a public lookup. Let's try scraping a static tracker like 'techpowerup' or 'nvidia.com/en-us/geforce/drivers/'

        // Strategy: Go to the main geforce drivers page which usually lists the latest 'Game Ready Driver'.
        await page.goto('https://www.nvidia.com/en-us/geforce/drivers/', { waitUntil: 'networkidle2', timeout: 30000 });

        const driverInfo = await page.evaluate(() => {
            // This selector needs to be generic as NVIDIA changes UI often.
            // Look for "Version" text.
            const allText = document.body.innerText;
            const versionMatch = allText.match(/Version:\s*([0-9\.]+)/);
            const dateMatch = allText.match(/Release Date:\s*([0-9]{4}\.[0-9]{2}\.[0-9]{2}|[A-Za-z]+ [0-9]{1,2}, [0-9]{4})/);

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
