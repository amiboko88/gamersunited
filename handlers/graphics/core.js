// 📁 handlers/graphics/core.js
const puppeteer = require('puppeteer');

class GraphicsCore {
    constructor() {
        this.browser = null;
    }

    async getBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            // console.log('🚀 [Graphics] Launching new browser instance...');
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
        }
        return this.browser;
    }

    /**
     * פונקציה גנרית להמרת HTML לתמונה
     */
    async render(html, width, height, fullPage = false) {
        let page = null;
        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();

            await page.setViewport({ width: width, height: height || 1000, deviceScaleFactor: 2 });
            await page.setContent(html, { waitUntil: 'networkidle0' });

            if (fullPage) {
                const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
                await page.setViewport({ width: width, height: bodyHeight, deviceScaleFactor: 2 });
            }

            return await page.screenshot({ type: 'png', fullPage: fullPage, omitBackground: true });

        } catch (err) {
            console.error(`❌ [GraphicsCore] Error: ${err.message}`);
            return null;
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