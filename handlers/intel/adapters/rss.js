
const { log } = require('../../../utils/logger');
// Dynamic import or lazy load browser to ensure singleton is used
const browser = require('./browser');

class IntelSourceManager {
    constructor() {
        // No more RSS feeds to configure
        this.sources = [
            { name: 'Warzone', type: 'browser', method: 'getWZNews' },
            { name: 'BF6', type: 'browser', method: 'getBF6News' },
            { name: 'NVIDIA', type: 'browser', method: 'getNvidiaDriverUpdates' },
            { name: 'Call of Duty', type: 'browser', method: 'getCODPatchNotes' }
        ];
    }

    async fetchNews() {
        const globalUpdates = [];

        for (const source of this.sources) {
            try {
                log(`[Intel] Checking ${source.name} via Scraper...`);
                let result = null;

                // Execute the scraper method
                if (typeof browser[source.method] === 'function') {
                    result = await browser[source.method]();
                }

                if (result) {
                    // Check if result is an array (WZNews returns array) or single object
                    if (Array.isArray(result)) {
                        globalUpdates.push(...result.map(item => ({
                            ...item,
                            source: source.name
                        })));
                    } else {
                        globalUpdates.push({
                            ...result,
                            source: source.name
                        });
                    }
                }
            } catch (error) {
                log(`❌ [Intel] Failed to fetch ${source.name}: ${error.message}`);
            }
        }

        return globalUpdates;
    }
}

module.exports = new IntelSourceManager();
