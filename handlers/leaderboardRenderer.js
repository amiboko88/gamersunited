const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function renderLeaderboardImage(users) {
  const templatePath = path.join(__dirname, '../templates/leaderboardTemplate.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  // ניצור את בלוק המשתמשים
  const userBlocks = users.map((user, index) => {
    const badge = ['🥇', '🥈', '🥉'][index] || '';
    const goldClass = index === 0 ? ' gold' : '';
    const streak = user.joinStreak ? `• 🔥 רצף: ${user.joinStreak} ימים` : '';
    const mvp = user.mvpWins ? `• MVP x${user.mvpWins}` : '';
    const details = `${user.score} נקודות ${mvp} ${streak}`.trim();

    return `
      <div class="player${goldClass}">
        <div class="avatar" style="background-image: url('${user.avatarURL}');"></div>
        <div class="info">
          <div class="name">${user.name}</div>
          <div class="details">${details}</div>
        </div>
        <div class="badge">${badge}</div>
      </div>`;
  }).join('\n');

  // הזרקת המשתמשים ל־HTML
  html = html.replace(/<div class="leaderboard">[\s\S]*?<\/div>\n\s*<footer>/, `<div class="leaderboard">\n${userBlocks}\n</div>\n  <footer>`);

  // פתיחת דפדפן ויצירת התמונה
  const browser = await puppeteer.launch({
  headless: "new",
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.setViewport({ width: 1000, height: 1000 });

  const imagePath = path.join(__dirname, '../assets/leaderboard.png');
  await page.screenshot({ path: imagePath, fullPage: true });
  await browser.close();

  return imagePath;
}

module.exports = { renderLeaderboardImage };
