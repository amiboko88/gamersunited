const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const templates = [
  { html: 'helpUser.html', out: 'helpUser.png' },
  { html: 'helpAdmin.html', out: 'helpAdmin.png' },
  { html: 'helpBirthday.html', out: 'helpBirthday.png' }
];

const IMAGE_CACHE_TTL_MS = 1000 * 60 * 10; // 10 דקות

async function generateAllHelpImages() {
  const outputDir = path.resolve(__dirname, '../images/');
  const templateDir = path.resolve(__dirname, '../templates/');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 נוצרה תיקיית /images`);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: {
      width: 2400,
      height: 1200,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();

  for (const { html, out } of templates) {
    const htmlPath = path.join(templateDir, html);
    const outputPath = path.join(outputDir, out);

    if (!fs.existsSync(htmlPath)) {
      console.warn(`⚠️ הקובץ ${html} לא נמצא, מדלג...`);
      continue;
    }

    if (fs.existsSync(outputPath)) {
      const age = Date.now() - fs.statSync(outputPath).mtimeMs;
      if (age < IMAGE_CACHE_TTL_MS) {
        console.log(`⏩ ${out} תקף – מדלג (cache)`);
        continue;
      }
    }

    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    const element = await page.$('body > .container');
    if (!element) {
      console.warn(`⚠️ לא נמצא אלמנט .container ב־${html}`);
      continue;
    }

    await element.screenshot({ path: outputPath });
    console.log(`✅ נוצר: ${out}`);
  }

  await browser.close();
  console.log('🎉 כל התמונות נוצרו בהצלחה');
}

// קריאה אוטומטית רק אם מריצים ישירות (node generateHelpImage.js)
if (require.main === module) {
  generateAllHelpImages().catch(console.error);
}

// ⬇️ תמיכה גם ברנדר לפי שם ספציפי
module.exports = async function generateHelpImage(name) {
  const htmlPath = path.resolve(__dirname, `../templates/${name}.html`);
  const outputDir = path.resolve(__dirname, '../images/');
  const outputPath = path.join(outputDir, `${name}.png`);

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`❌ הקובץ ${name}.html לא נמצא!`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: {
      width: 2400,
      height: 1200,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });

  const element = await page.$('body > .container');
  if (!element) {
    await browser.close();
    throw new Error('❌ אלמנט .container לא נמצא ב־HTML');
  }

  await element.screenshot({ path: outputPath });
  await browser.close();
  console.log(`✅ נוצרה תמונה: ${name}.png`);
  return outputPath;
};
