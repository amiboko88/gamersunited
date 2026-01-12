// 📁 handlers/graphics/core.js
const puppeteer = require('puppeteer');

class GraphicsCore {
    /**
     * פונקציה גנרית להמרת HTML לתמונה
     */
    async render(html, width, height, fullPage = false) {
        let browser = null;
        try {
            browser = await puppeteer.launch({ 
                headless: 'new', 
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
            });

            const page = await browser.newPage();
            await page.setViewport({ width: width, height: height || 1000, deviceScaleFactor: 2 });
            await page.setContent(html, { waitUntil: 'networkidle0' });
            
            if (fullPage) {
                const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
                await page.setViewport({ width: width, height: bodyHeight, deviceScaleFactor: 2 });
            }

            return await page.screenshot({ type: 'png', fullPage: fullPage });

        } catch (err) {
            console.error(`❌ [GraphicsCore] Error: ${err.message}`);
            return null;
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }
}

module.exports = new GraphicsCore();