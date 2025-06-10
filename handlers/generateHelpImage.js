const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function generateHelpImage() {
  const htmlPath = path.resolve(__dirname, '../templates/helpTemplate.html');
  const outputPath = path.resolve(__dirname, '../assets/helpImage.png');

  if (!fs.existsSync(htmlPath)) {
    throw new Error('❌ קובץ helpTemplate.html לא נמצא ב-assets!');
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: {
      width: 1280,
      height: 900,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });

  const element = await page.$('body > .container');
  if (!element) {
    await browser.close();
    throw new Error('❌ אלמנט .container לא נמצא!');
  }

  await element.screenshot({ path: outputPath });
  await browser.close();

  return outputPath;
}

module.exports = generateHelpImage;
