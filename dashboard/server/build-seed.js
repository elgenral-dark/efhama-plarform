/* يولّد js/seed.js من data/efhama-data.json (ليعمل الوضع المحلي حتى بدون خادم) */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/efhama-data.json'), 'utf8'));
fs.writeFileSync(path.join(root, 'js/seed.js'), '/* مولَّد تلقائيًا — لا تعدّله يدويًا. شغّل: node server/build-seed.js */\nwindow.EFHAMA_SEED = ' + JSON.stringify(data, null, 2) + ';\n');
console.log('seed.js written');
