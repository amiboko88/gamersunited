const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// מחרוזות Base64 למדליות
const medalsBase64 = {
  gold: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABrElEQVR4nO3avUoDQRRA0e8EAU6ACboJHoILoAJ6gAuhAegAnpAp6AC9MgcO8ty1fM+5GffqW9z9X/f3R3Op3Op3Op3Otzms+hY0U2ZoAN3IF2WMAe2AIfQEQxgALsQRDGAAughhDGAAvgAhz+T0XPmeQe/MQ4QaL5b9+QKmgBzSAAZYQwChmEMAoZhDAOE4xDP+j+1T1+qUBBtgChmEMAoZhDACG2AKGYQwChmEMAYTzEaQDbBuO4OugAJr7iOcw3vgkFrhDFOADbhDEOALbhDGGAKuEMcYAq4QxxgCrhDGGAKuEMcYAq4QxxgCrhDGGAKuEMcYAq4QxZgAGeEMWYAQ54QxZgBDnhDFmAEceEMWYAQ54QxZgBDnhDFmAEceEMWYAQ74Z4+iuwc2nNc63M63M63M63M63M63M63M63Ppvqg+fCC2YYgh1AwAAAABJRU5ErkJggg==',
  silver: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABjElEQVR4nO3bMU7DQBBA0bcEsAXYAmwBsAFsgVZgC7ACbAGygIwAuYAe6ACaBYUN9+Zsn3nGM9+ar1X/c/66+vVvtdrt9vt9vtdvv93AUKoMNWTADG4iTtTgBd2QIewABvIATbAAO8gBNsAA7yAE2wADvIATbAAO8gBNsAA3ycK9nd7PeANhCE2wADvIATbAAO8gBNsAA7yAE2wADvIATbAAO8gBNsAA7yAE2wADvIATbAAO8gBNsAA7yAE2wADvIATbAAO8gBNsAA3+YBn6Hc20RBYzP8BbCBY94E3cc+7AKWMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdvzG6QBzGlKdX63X63X63X63X63X63X63X6f8o/UuXec1WHycAAAAASUVORK5CYII=',
  bronze: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABi0lEQVR4nO3bP0rDQBBA0XsIsAXYAmwBsgVZgC7ACbAGygIwAuYAe6ACaBaULffnZN9zjGd7Vb9n9Wr+vdbrfb7fb7XY7v+7drbrfb7fa7fUddW7aYpIMNWTADG4iXtTgBd2QJuwABvIATbAAO8gBNsAA7yAE2wADvIATbAAO8gBNsAA3ycC9vf7PeANhCE2wADvIATbAAO8gBNsAA7yAE2wADvIATbAAO8gBNsAA7yAE2wADvIATbAAO8gBNsAA7yAE2wADvIATbAAO8gBNsAA3+YBn+fc2UQRYzP8B7CBY94E3cc+7AKWMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdswxAXbMMQF2zDEBdvzF6QBzGtWdv9Vqt9vtdrt9vt9vt9vt9vs/f4P0z6Z/fRMs1fgAAAABJRU5ErkJggg=='
};

async function renderLeaderboardImage(users) {
  const templatePath = path.join(__dirname, '../templates/leaderboardTemplate.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const userBlocks = users.map((user, index) => {
    let medalImg = '';
    if (index === 0) medalImg = `<img src="${medalsBase64.gold}" alt="🥇" />`;
    else if (index === 1) medalImg = `<img src="${medalsBase64.silver}" alt="🥈" />`;
    else if (index === 2) medalImg = `<img src="${medalsBase64.bronze}" alt="🥉" />`;
    else medalImg = `<span>#${index + 1}</span>`;

    const goldClass = index === 0 ? ' gold' : '';
    const streak = user.joinStreak ? `• רצף: ${user.joinStreak} ימים` : '';
    const mvp = user.mvpWins ? `• MVP x${user.mvpWins}` : '';
    const details = `${user.score} נקודות ${mvp} ${streak}`.trim();

    return `
      <div class="player${goldClass}">
        <div class="avatar" style="background-image: url('${user.avatarURL}');"></div>
        <div class="info">
          <div class="name">${user.name}</div>
          <div class="details">${details}</div>
        </div>
        <div class="position">${medalImg}</div>
      </div>`;
  }).join('\n');

  html = html.replace(
    /<div class="leaderboard">[\s\S]*?<\/div>\n\s*<footer>/,
    `<div class="leaderboard">\n${userBlocks}\n</div>\n  <footer>`
  );

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.setViewport({ width: 1920, height: 1400 });

  const imagePath = path.join(__dirname, '../assets/leaderboard.png');
  await page.screenshot({ path: imagePath, fullPage: true });
  await browser.close();

  return imagePath;
}

module.exports = { renderLeaderboardImage };
