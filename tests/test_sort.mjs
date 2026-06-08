import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C:'+m.text());});
await p.goto('http://localhost:8123/index.html',{waitUntil:'networkidle'}); await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelectorAll('.card.collapsed').forEach(c=>c.classList.remove('collapsed')));
// add a chapter and set a start that should sort into the middle (3:37 between 3:17 and 8:20)
await p.locator('#addChapter').click();
const starts = await p.$$('.ch-start');
await starts[starts.length-1].fill('3:37.056');
await starts[starts.length-1].dispatchEvent('change');
await p.waitForTimeout(200);
const order = await p.$$eval('.ch-start', els => els.map(e=>e.value));
console.log('order after sort:', JSON.stringify(order));
// add an empty row -> should stay last
await p.locator('#addChapter').click();
await p.waitForTimeout(100);
const order2 = await p.$$eval('.ch-start', els => els.map(e=>e.value));
console.log('with empty row:', JSON.stringify(order2));
console.log(errs.length?'ERRORS '+errs.join(';'):'NO ERRORS');
await b.close();
