const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { Readable } = require('stream');
const { log } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

module.exports = {
    /**
     * Converts an audio buffer to OGG Opus format (Required for WhatsApp Voice Notes on Android)
     * @param {Buffer} inputBuffer - The input audio buffer (MP3/WAV)
     * @returns {Promise<Buffer>} - The converted OGG buffer
     */
    convertToOgg(inputBuffer) {
        return new Promise((resolve, reject) => {
            const tempInput = path.join(os.tmpdir(), `input_${Date.now()}.mp3`);
            const tempOutput = path.join(os.tmpdir(), `output_${Date.now()}.ogg`);

            // Write input buffer to temp file
            fs.writeFileSync(tempInput, inputBuffer);

            ffmpeg(tempInput)
                .audioCodec('libopus')
                .toFormat('ogg')
                .addOutputOptions([
                    '-ac 1',      // Mono (WhatsApp Standard)
                    '-ar 16000',  // 16kHz (WhatsApp Standard)
                    '-vn'         // No Video
                ])
                .on('end', () => {
                    try {
                        const outputBuffer = fs.readFileSync(tempOutput);
                        // Cleanup
                        fs.unlinkSync(tempInput);
                        fs.unlinkSync(tempOutput);
                        resolve(outputBuffer);
                    } catch (e) {
                        reject(e);
                    }
                })
                .on('error', (err) => {
                    log(`❌ [Converter] FFmpeg Error: ${err.message}`);
                    try {
                        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                    } catch (e) { }
                    reject(err);
                })
                .save(tempOutput);
        });
    }
};
