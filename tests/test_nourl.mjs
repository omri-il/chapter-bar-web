import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C:'+m.text());});
await p.goto('http://localhost:8123/index.html',{waitUntil:'networkidle'}); await p.waitForTimeout(900);
console.log('videoUrl present:', await p.locator('#videoUrl').count(), '| loadUrl present:', await p.locator('#loadUrl').count());
console.log('chapter rows:', await p.locator('.chapter-row').count());
console.log(errs.length?'ERRORS '+errs.join(';'):'NO ERRORS');
await b.close();
