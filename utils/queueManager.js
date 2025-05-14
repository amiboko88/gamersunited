
const ttsQueue = [];
let isPlaying = false;

function enqueueTTS(item) {
  ttsQueue.push(item);
}

function ttsIsPlaying() {
  return isPlaying;
}

function setTTSPlaying(value) {
  isPlaying = value;
}

module.exports = {
  ttsQueue,
  enqueueTTS,
  ttsIsPlaying,
  setTTSPlaying
};
