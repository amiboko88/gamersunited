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

    async _fetchPage(url, processFunc) {
        let page = null;
        try {
            const b = await this._getBrowser();
            page = await b.newPage();

            // Anti-Bot Evasion Headers
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });

            // Extra headers for Cloudflare
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
            });

            log(`[Browser] Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); // Faster load for XML

            const data = await page.evaluate(processFunc);

            await page.close();
            return data;

        } catch (error) {
            log(`❌ [Browser] Error scraping ${url}: ${error.message}`);
            if (page) await page.close().catch(() => { });
            return null;
        }
    }

    /**
     * Fetches raw text content (for RSS/XML/JSON) using the headless browser to bypass 403s.
     */
    async getRawContent(url) {
        return this._fetchPage(url, () => document.body.innerText);
    }

    // --- 1. WZ Meta Extraction (Updated 2026 DOM) ---
    async getWZMeta() {
        return this._fetchPage(WZ_URL, () => {
            const results = { meta: [], absolute_meta: [] };

            // Helper to clean text
            const clean = t => t ? t.innerText.trim() : null;

            // The new structure uses H2 titles followed by a div.loadouts-list__group
            // We iterate over all H2 elements to find categories
            const headers = document.querySelectorAll('h2');

            headers.forEach(h2 => {
                const title = clean(h2);
                if (!title) return;

                // The weapon list is the next sibling element with class .loadouts-list__group
                const listGroup = h2.nextElementSibling;
                if (!listGroup || !listGroup.classList.contains('loadouts-list__group')) return;

                const weapons = [];
                listGroup.querySelectorAll('.loadout-card').forEach(card => {
                    // Name is in .gun-badge__text
                    const name = clean(card.querySelector('.gun-badge__text'));
                    // Code is in .loadout-card-code__content
                    const code = clean(card.querySelector('.loadout-card-code__content'));
                    // Image
                    const image = card.querySelector('.loadout-card__thumbnail img')?.src;

                    // Attachments logic
                    const attachments = [];
                    // Attachments are in .attachment-card
                    card.querySelectorAll('.attachment-card').forEach(attCard => {
                        const nameEl = attCard.querySelector('.attachment-card-content__name div');
                        const typeEl = attCard.querySelector('.attachment-card-content__name span');

                        if (nameEl && typeEl) {
                            attachments.push({
                                part: clean(typeEl), // e.g., "Muzzle"
                                name: clean(nameEl)  // e.g., "Monolithic Suppressor"
                            });
                        }
                    });

                    if (name) {
                        weapons.push({ name, code, image, attachments });
                    }
                });

                // Assign to correct category in results
                if (title.toUpperCase().includes('ABSOLUTE')) {
                    results.absolute_meta = weapons;
                } else if (title.toUpperCase().includes('META')) {
                    results.meta.push({ category: title, weapons });
                }
                // We can also capture "Acceptable" if we want, but sticking to Meta for now
            });

            return results;
        });
    }

    // --- 2. Playlist Extraction ---
    async getPlaylists() {
        return this._fetchPage(PLAYLIST_URL, () => {
            const modes = [];
            // Generic scraper for finding mode titles
            const candidates = document.querySelectorAll('h3, .playlist-card__title, .mode-title');
            candidates.forEach(el => {
                const text = el.innerText.trim();
                if (text.length > 3 && !text.includes('Menu') && !text.includes('Settings')) {
                    modes.push(text);
                }
            });
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

    // --- 3.5. BF6 News (Meta Update Date) ---
    async getBF6News() {
        return this._fetchPage(BF_URL, () => {
            const dateEl = document.querySelector('.loadouts__updated');
            if (dateEl) {
                const dateStr = dateEl.innerText.replace('Updated:', '').trim();
                return {
                    title: "BF6 META UPDATE: " + dateStr,
                    link: 'https://bfhub.gg/meta/br',
                    date: new Date().toISOString(),
                    summary: "The BFHub Meta has been updated. Check the latest loadouts."
                };
            }
            return null;
        });
    }

    // --- 4. NVIDIA App Updates ---
    async getNvidiaDriverUpdates() {
        const NVIDIA_URL = 'https://www.nvidia.com/en-us/software/nvidia-app/release-highlights/';
        return this._fetchPage(NVIDIA_URL, () => {
            // Logic: Find the main Release Heading (h2 usually)
            // Refined: Look for text containing "Release" and digits
            const headers = Array.from(document.querySelectorAll('h2, h3'));
            const releaseHeader = headers.find(h => h.innerText.includes('Release'));

            if (!releaseHeader) return null;

            const version = releaseHeader.innerText.trim();

            // Try to find the content list immediately following the header
            // This avoids grabbing the nav menu
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
    }

    // --- 5. COD Patch Notes (Official Hub) ---
    async getCODPatchNotes() {
        const HUB_URL = 'https://www.callofduty.com/patchnotes';
        return this._fetchPage(HUB_URL, () => {
            // Logic: Prioritize links with the current year (2026)
            const links = Array.from(document.querySelectorAll('a[href*="patchnotes"]'));

            // Filter strict duplicates and finding the "Best" link
            let bestLink = null;

            // 1. Try finding 2026 links first (Future proofing)
            const currentYearLinks = links.filter(l => l.href.includes('2026'));
            if (currentYearLinks.length > 0) {
                bestLink = currentYearLinks[0]; // Usually top is newest
            } else {
                // 2. Fallback to any patch note
                bestLink = links[0];
            }

            if (bestLink) {
                return {
                    title: `COD OFFICIAL: ${bestLink.innerText.trim() || "Latest Patch Notes"}`,
                    link: bestLink.href,
                    date: new Date().toISOString(),
                    summary: "Official Patch Notes from Activision. Click link to read full changelog."
                };
            }
            return null;
        });
    }

    // --- 6. WZHub Direct News (Playlist & Meta Updates) ---
    async getWZNews() {
        try {
            const updates = [];

            // 1. Get the "Meta Updated" date from the Loadouts page (High Priority)
            const metaUpdate = await this._fetchPage('https://wzhub.gg/loadouts', () => {
                const dateEl = document.querySelector('.loadouts__updated');
                if (dateEl) {
                    const dateStr = dateEl.innerText.replace('Updated:', '').trim();
                    return {
                        title: "META UPDATE: " + dateStr,
                        link: 'https://wzhub.gg/loadouts',
                        date: new Date().toISOString(), // Use current time as it's "Fresh" state
                        summary: "The global Warzone Meta has been updated. Check the latest loadouts now."
                    };
                }
                return null;
            });
            if (metaUpdate) updates.push(metaUpdate);

            // 2. Get the Playlist Updates from /playlist/wz (The Source of Truth)
            // User specifically requested "Playlists with date and time".
            const playlistUpdate = await this._fetchPage('https://wzhub.gg/playlist/wz', () => {
                const dateRange = document.querySelector('.wzh-title__subtitle')?.innerText.trim(); // "Jan 8 - Jan 15"
                const seasonInfo = document.querySelector('.playlist-progress__label')?.innerText.replace(/\s+/g, ' ').trim(); // "Season 1 RELOADED..."

                if (!dateRange) return null;

                const modes = [];
                const cards = document.querySelectorAll('.playlist-card');

                cards.forEach(card => {
                    const title = card.querySelector('.playlist-card__title')?.innerText.trim() || "Modes";
                    const listItems = Array.from(card.querySelectorAll('.playlist-card__list_name'))
                        .map(el => el.innerText.trim())
                        .join('\n• ');

                    if (listItems) {
                        modes.push(`**${title}**:\n• ${listItems}`);
                    }
                });

                if (modes.length > 0) {
                    return {
                        title: `PLAYLIST UPDATE (${dateRange})`,
                        link: 'https://wzhub.gg/playlist/wz',
                        date: new Date().toISOString(),
                        summary: `**${seasonInfo}**\n\n${modes.join('\n\n')}`
                    };
                }
                return null;
            });
            if (playlistUpdate) updates.push(playlistUpdate);

            return updates;
        } catch (error) {
            log(`[Browser] Error scraping WZHub Updates: ${error.message}`);
            return [];
        }
    }
}

module.exports = new BrowserAdapter();
