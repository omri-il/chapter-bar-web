import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C:'+m.text());});
p.on('dialog', d => d.accept()); // auto-accept confirm()
await p.goto('http://localhost:8123/index.html',{waitUntil:'networkidle'}); await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelectorAll('.card.collapsed').forEach(c=>c.classList.remove('collapsed')));
// change some design + chapters, then reset
await p.locator('#barHFrac').evaluate(el=>{el.value='0.18';el.dispatchEvent(new Event('input',{bubbles:true}));});
await p.locator('#textColor').evaluate(el=>{el.value='#ff0000';el.dispatchEvent(new Event('input',{bubbles:true}));});
await p.locator('#addChapter').click(); await p.locator('#addChapter').click();
console.log('before reset -> barHFrac:', await p.locator('#barHFrac').inputValue(), '| rows:', await p.locator('.chapter-row').count());
await p.locator('#resetDesign').click(); await p.waitForTimeout(200);
console.log('after design reset -> barHFrac:', await p.locator('#barHFrac').inputValue(), '| textColor:', await p.locator('#textColor').inputValue());
await p.locator('#resetChapters').click(); await p.waitForTimeout(200);
console.log('after chapters reset -> rows:', await p.locator('.chapter-row').count(), '| first start:', await p.$eval('.ch-start', el=>el.value));
console.log(errs.length?'ERRORS '+errs.join(';'):'NO ERRORS');
await b.close();
