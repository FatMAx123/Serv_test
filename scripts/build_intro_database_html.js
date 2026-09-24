// SCRIPTS / BUILD_INTRO_DATABASE_HTML.JS
const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../client/database.html');
const templatePath = path.join(__dirname, '../client/database.html');

if (!fs.existsSync(targetPath)) {
  console.error('database.html does not exist');
  process.exit(1);
}

console.log('Intro database HTML verified: ' + targetPath);
