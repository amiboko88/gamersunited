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

        // 1. Go to WZStats Meta Page
        await page.goto('https://wzstats.gg/warzone-meta', { waitUntil: 'networkidle2', timeout: 60000 });

        // 2. Extract Data
        const weapons = await page.evaluate(() => {
            const results = [];
            // Select all weapon cards (Adjust selectors based on inspection if needed)
            // Based on inspection: "Meta" weapons are usually in a distinct container. 
            // We will grab all 'cards' that seem to be weapons.

            // Looking for main weapon containers. Structure might vary, so we look for generic "card" like elements 
            // or specific text indicators if classes are obfuscated.
            // Using a resilient strategy: Look for elements containing 'Meta' or specific tier names inside specific containers.
            // However, the user saw "Build Code" which is key.

            const weaponCards = document.querySelectorAll('.loadout-card, [class*="LoadoutCard"]'); // Generic fallback
            // If class names are obfuscated (e.g. styled-components), we might need to rely on structure.
            // Let's try to map what we see in the DOM snapshot logic.

            // Refined extraction logic based on the user's "Build Code" screenshot
            // and general site structure.
            const cards = Array.from(document.querySelectorAll('div')).filter(div => div.innerText && div.innerText.includes('Build Code'));

            // If the specific "Build Code" hidden strategy is used, we might need to click or it might be in text.
            // The browser agent said "Build Codes... are visible and scannable directly from DOM".

            // Let's assume a standard structure for now based on common scraping patterns for this site logic:
            // Iterate over major sections (Long Range, Close Range, etc.)

            const categories = ['Long Range', 'Close Range', 'Sniper'];
            const grabbedWeapons = [];

            // Try to find sections
            document.querySelectorAll('section, .section-container').forEach(section => {
                const text = section.innerText;
                let category = 'General';
                if (text.includes('Long Range')) category = 'Long Range';
                else if (text.includes('Close Range')) category = 'Close Range';
                else if (text.includes('Sniper')) category = 'Sniper';

                // Find weapon names and codes in this section
                // This is a heuristic approach. 
                // We look for the "Copy" buttons or "Build Code" labels.
                const buildCodeElements = section.querySelectorAll('input[value^="S0"], div[class*="code"]'); // Look for code inputs or divs

                // Since DOM access is complex to guess without live feedback, 
                // we will grabbing text content that looks like a code: S07-...
                const html = section.innerHTML;
                const codeRegex = /[A-Z0-9]{3,}-[A-Z0-9]{5,}-[A-Z0-9]{4,}/g;
                const codes = html.match(codeRegex) || [];

                // Try to resolve names near codes? 
                // For V1, we will return raw codes found associated with the category.
                if (codes.length > 0) {
                    grabbedWeapons.push({
                        category,
                        codes: [...new Set(codes)] // dedupe
                    });
                }
            });

            return grabbedWeapons;
        });

        // Return structured data (mocked slightly if extraction is too raw, but aiming for real data)
        // If "weapons" array is empty, we might need to adjust selector in verification phase.
        return weapons;

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
        await page.goto('https://www.callofduty.com/patchnotes', { waitUntil: 'domcontentloaded' });

        const latestUpdate = await page.evaluate(() => {
            // Find the first WZ card
            const links = Array.from(document.querySelectorAll('a'));
            const wzLink = links.find(a => a.href.includes('/blog/warzone') || (a.innerText && a.innerText.includes('WZ')));

            if (wzLink) {
                // Navigate up to find the card container
                const card = wzLink.closest('div.card') || wzLink.parentElement.parentElement;
                // Extract title
                const title = card.querySelector('h3, .card-title')?.innerText || "New Warzone Update";
                // Extract URL (usually the link itself or a child)
                const url = wzLink.href;

                return {
                    title,
                    url,
                    date: new Date().toISOString() // We use discovery time as proxy if date not parsable
                };
            }
            return null;
        });

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
        await page.goto(url, { waitUntil: 'networkidle2' });

        const content = await page.evaluate(() => {
            // Extract main text content
            const main = document.querySelector('main') || document.body;
            return main.innerText.slice(0, 5000); // Limit size for AI
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
