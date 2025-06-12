const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const templates = [
  { html: 'helpUser.html', out: 'helpUser.png' },
  { html: 'helpAdmin.html', out: 'helpAdmin.png' },
  { html: 'helpBirthday.html', out: 'helpBirthday.png' },
];

async function generateAllHelpImages() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: {
      width: 2000,
      height: 600,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();

  for (const { html, out } of templates) {
    const htmlPath = path.resolve(__dirname, `../templates/${html}`);
    const outputPath = path.resolve(__dirname, `../images/${out}`);

    if (!fs.existsSync(htmlPath)) {
      console.warn(`⚠️ הקובץ ${html} לא נמצא, מדלג...`);
      continue;
    }

    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    const element = await page.$('body > .container');
    if (!element) {
      console.warn(`⚠️ לא נמצא אלמנט container ב־${html}`);
      continue;
    }

    await element.screenshot({ path: outputPath });
    console.log(`✅ נוצר: ${out}`);
  }

  await browser.close();
}

generateAllHelpImages().catch(console.error);
