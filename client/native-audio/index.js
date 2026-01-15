const path = require('path');
const zvonAudio = require(path.join(__dirname, 'build', 'Release', 'zvon_audio.node'));
module.exports = zvonAudio;
