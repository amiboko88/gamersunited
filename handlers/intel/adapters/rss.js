const Parser = require('rss-parser');
const { log } = require('../../../utils/logger');

class RSSAdapter {
    constructor() {
        this.parser = new Parser();
        this.FEEDS = [
            { name: 'CharlieIntel', url: 'https://charlieintel.com/feed/' },
            { name: 'COD Official', url: 'https://www.callofduty.com/blog/rss' }
        ];
    }

    async fetchNews() {
        const updates = [];
        const browser = require('./browser'); // Lazy load singleton

        for (const feed of this.FEEDS) {
            try {
                const result = await this.parser.parseURL(feed.url);
                const now = new Date(); // Filter Freshness

                const freshItems = result.items.filter(item => {
                    const pubDate = new Date(item.pubDate);
                    return (now - pubDate) < (24 * 60 * 60 * 1000);
                });

                for (const item of freshItems) {
                    let summary = item.contentSnippet || item.content;

                    // 🕵️ OFFICIAL PATCH NOTES DEEP DIVE (Smart Header Slicer)
                    if (feed.url.includes('callofduty.com') && (item.link.includes('patchnotes') || item.title.toLowerCase().includes('patch notes'))) {
                        log(`🕵️ [Intel] Deep Parsing Official Patch Notes: ${item.title}`);
                        try {
                            const deepData = await browser._fetchPage(item.link, () => {
                                // Smart Parser Logic (Runs in Browser)
                                const allElements = Array.from(document.querySelectorAll('h2, h3, h4, p, li'));
                                const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

                                // 1. Find Latest Date (Topmost)
                                let startIndex = -1;
                                let title = document.title;

                                for (let i = 0; i < allElements.length; i++) {
                                    const txt = allElements[i].innerText.toUpperCase();
                                    if (months.some(m => txt.includes(m)) && (allElements[i].tagName === 'H2' || allElements[i].tagName === 'H3')) {
                                        startIndex = i;
                                        title = allElements[i].innerText;
                                        break;
                                    }
                                }

                                if (startIndex === -1) {
                                    // Fallback
                                    return { title: document.title, sampleText: document.body.innerText.substring(0, 800) };
                                }

                                // 2. Find Next Date (Stop point)
                                let endIndex = allElements.length;
                                for (let i = startIndex + 1; i < allElements.length; i++) {
                                    const txt = allElements[i].innerText.toUpperCase();
                                    if (months.some(m => txt.includes(m)) && (allElements[i].tagName === 'H2' || allElements[i].tagName === 'H3')) {
                                        endIndex = i;
                                        break;
                                    }
                                }

                                // 3. Extract Context
                                const content = allElements.slice(startIndex, endIndex).map(el => el.innerText).join('\n');
                                return { title, sampleText: content.substring(0, 2000) };
                            });

                            if (deepData && deepData.sampleText) {
                                summary = `📝 **Official Updates (${deepData.title})**\n${deepData.sampleText}...`;
                            }
                        } catch (e) {
                            log(`⚠️ [Intel] Deep Parse Failed: ${e.message}`);
                        }
                    }

                    updates.push({
                        source: feed.name,
                        title: item.title,
                        link: item.link,
                        date: item.pubDate,
                        summary: summary
                    });
                }

            } catch (error) {
                log(`⚠️ [RSS] Failed to fetch ${feed.name}: ${error.message}`);
            }
        }

        return updates;
    }
}

module.exports = new RSSAdapter();
