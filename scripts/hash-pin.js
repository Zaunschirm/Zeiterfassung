import crypto from 'node:crypto';
function hashPin(pin,saltB64){ const salt=Buffer.from(saltB64,'base64'); const d=crypto.scryptSync(String(pin),salt,64,{N:1<<15,r:8,p:1}); return d.toString('base64'); }
const pin=process.argv[2]; if(!pin){console.error('Nutzung: npm run hash-pin -- <PIN>'); process.exit(1);} const salt=crypto.randomBytes(16).toString('base64'); const hash=hashPin(pin,salt); console.log(JSON.stringify({pin_salt:salt,pin_hash:hash},null,2));
