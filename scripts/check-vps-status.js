// ============================================================
//  SCRIPTS / CHECK-VPS-STATUS.JS
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const DB = require('../server/db.js');

async function main() {
  const dataDir = path.resolve(__dirname, '..', 'data');
  const p1 = path.join(dataDir, 'local_34b2a5845c92.c_mtrezvp23fpe.json');
  if (fs.existsSync(p1)) {
    const obj = JSON.parse(fs.readFileSync(p1, 'utf8'));
    console.log('local_34b2a5845c92.c_mtrezvp23fpe.json -> name:', obj.name);
  }

  const p2 = path.join(dataDir, 'characters.json');
  if (fs.existsSync(p2)) {
    const obj = JSON.parse(fs.readFileSync(p2, 'utf8'));
    const map = obj.characters || obj;
    for (const k of Object.keys(map)) {
      if (map[k].charId === 'c_mtrezvp23fpe' || map[k].name === 'фывфа' || map[k].name === 'ИИндиГусь') {
        console.log('characters.json key:', k, '-> name:', map[k].name, 'yid:', map[k].yid, 'online:', map[k].online);
      }
    }
  }

  const chars = await DB.listChars('local_34b2a5845c92');
  console.log('DB.listChars(local_34b2a5845c92):', JSON.stringify(chars));
}

main().catch(err => console.error(err));
