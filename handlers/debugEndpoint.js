const fs = require('fs');
const path = require('path');

function addDebugRoute(app) {
  app.get('/debug-mp3/:id?', (req, res) => {
    const id = req.params.id || '1';
    const file = path.join(__dirname, `debug-shimon-${id}.mp3`);
    if (!fs.existsSync(file)) {
      return res.status(404).send('No such debug-shimon mp3 file found');
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="debug-shimon-${id}.mp3"`);
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { addDebugRoute };
