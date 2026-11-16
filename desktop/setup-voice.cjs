const path = require('node:path');
const { installEngine } = require('./engines.cjs');
installEngine('voice', path.join(__dirname, '../runtime'), console.log).catch(error => { console.error(error.message); process.exitCode = 1; });