import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C:'+m.text());});
await p.goto('http://localhost:8123/index.html',{waitUntil:'networkidle'}); await p.waitForTimeout(900);
// expand design card
await p.evaluate(()=>document.querySelectorAll('.card.collapsed').forEach(c=>c.classList.remove('collapsed')));
// crop top 0.4 + bottom 0.2, bar near top
await p.locator('#cropTopFrac').evaluate(el=>{el.value='0.4';el.dispatchEvent(new Event('input',{bubbles:true}));});
await p.locator('#cropBottomFrac').evaluate(el=>{el.value='0.2';el.dispatchEvent(new Event('input',{bubbles:true}));});
await p.locator('#barYCenterFrac').evaluate(el=>{el.value='0.85';el.dispatchEvent(new Event('input',{bubbles:true}));});
await p.waitForTimeout(200);
console.log('barYCenterFrac max:', await p.locator('#barYCenterFrac').getAttribute('max'));
console.log('cropTop:', await p.locator('#cropTopFrac').inputValue(), 'cropBottom:', await p.locator('#cropBottomFrac').inputValue());
await p.locator('.canvas-wrap').screenshot({path:'C:/tmp/crop.png'});
console.log(errs.length?'ERRORS '+errs.join(';'):'NO ERRORS');
await b.close();
