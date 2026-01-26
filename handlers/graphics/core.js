// 📁 handlers/graphics/core.js
const puppeteer = require('puppeteer');

class GraphicsCore {
    constructor() {
        this.browser = null;
    }

    async getBrowser() {
        if (this.browser) {
            // Check if process is still alive
            if (!this.browser.isConnected() || !this.browser.process()) {
                // console.log('♻️ [Graphics] Browser disconnected/dead. Restarting...');
                try { await this.browser.close().catch(() => { }); } catch (e) { }
                this.browser = null;
            }
        }

        if (!this.browser) {
            // console.log('🚀 [Graphics] Launching new browser instance...');
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
            });
        }
        return this.browser;
    }

    /**
     * פונקציה גנרית להמרת HTML לתמונה
     */
    async render(html, width, height, fullPage = false, format = 'png') {
        let page = null;
        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();

            await page.setViewport({ width: width, height: height || 1000, deviceScaleFactor: 2 });

            // Optimization: 'domcontentloaded' is much faster than 'networkidle0'
            // Added explicit timeout to prevent hanging forever
            await page.setContent(html, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });

            if (fullPage) {
                const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
                await page.setViewport({ width: width, height: bodyHeight, deviceScaleFactor: 2 });
            }

            // Small delay to ensure heavy fonts (Google Fonts) finish rendering even after DOM ready
            // Safe trade-off: 500ms delay vs infinite hang on 'networkidle0'
            await new Promise(r => setTimeout(r, 500));

            if (format === 'jpeg') {
                return await page.screenshot({ type: 'jpeg', quality: 90, fullPage: fullPage });
            } else {
                return await page.screenshot({ type: 'png', fullPage: fullPage, omitBackground: false });
            }

        } catch (err) {
            console.error(`❌ [GraphicsCore] Error: ${err.message}`);
            // If browser crashed, kill ref so we restart next time
            if (err.message.includes('Session closed') || err.message.includes('not opened')) {
                this.browser = null;
            }
            throw err; // Propagate error so outer timeouts know
        } finally {
            if (page) await page.close().catch(() => { });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = new GraphicsCore();