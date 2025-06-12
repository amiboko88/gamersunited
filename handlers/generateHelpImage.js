const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const templates = [
  { html: 'helpUser.html', out: 'helpUser.png' },
  { html: 'helpAdmin.html', out: 'helpAdmin.png' },
  { html: 'helpBirthday.html', out: 'helpBirthday.png' }
];

const IMAGE_CACHE_TTL_MS = 1000 * 60 * 10; // 10 דקות קאש

async function generateAllHelpImages() {
  const outputDir = path.resolve(__dirname, '../images/');
  const templateDir = path.resolve(__dirname, '../templates/');

  // ודא שהתיקייה קיימת
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 נוצרה תיקיית /images`);
  }

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
    const htmlPath = path.join(templateDir, html);
    const outputPath = path.join(outputDir, out);

    if (!fs.existsSync(htmlPath)) {
      console.warn(`⚠️ הקובץ ${html} לא נמצא. מדלג...`);
      continue;
    }

    // דילוג חכם אם הקובץ קיים וחדש
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const age = Date.now() - stats.mtimeMs;
      if (age < IMAGE_CACHE_TTL_MS) {
        console.log(`⏩ ${out} כבר קיים ותקף (cache) – מדלג`);
        continue;
      }
    }

    try {
      await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
      const element = await page.$('body > .container');
      if (!element) {
        console.warn(`⚠️ לא נמצא אלמנט container ב־${html}`);
        continue;
      }

      await element.screenshot({ path: outputPath });
      console.log(`✅ ${out} נוצר בהצלחה`);
    } catch (err) {
      console.error(`❌ שגיאה ב־${html}: ${err.message}`);
    }
  }

  await browser.close();
  console.log('🎉 סיום יצירת תמונות עזרה!');
}

generateAllHelpImages().catch(err => {
  console.error('💥 שגיאת מערכת:', err.message);
});
