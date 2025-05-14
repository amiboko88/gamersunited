// 📁 utils/squadBuilder.js

function buildSquads(members, squadSize) {
    const players = [...members]; // העתקה לצורך ערבוב
    shuffle(players);
  
    const squads = [];
    const waiting = [];
  
    while (players.length >= squadSize) {
      squads.push(players.splice(0, squadSize));
    }
  
    // מחלק שאריות
    if (players.length > 0) {
      if (squadSize === 4 && players.length === 3) {
        squads.push(players.splice(0, 3)); // טריו
      } else if (squadSize >= 3 && players.length === 2) {
        squads.push(players.splice(0, 2)); // דאבל
      } else {
        waiting.push(...players.splice(0));
      }
    }
  
    return { squads, waiting };
  }
  
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  
  module.exports = { buildSquads };
  