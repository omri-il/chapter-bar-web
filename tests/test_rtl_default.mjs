import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push('C:'+m.text());});
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
console.log('active dir button:', (await page.locator('#barDirection .seg.active').textContent()).trim());
console.log('scrub dir:', await page.locator('#scrub').getAttribute('dir'));
// at 15% progress, playhead should be on the RIGHT by default now
await page.locator('#scrub').evaluate(el=>{el.value=150;el.dispatchEvent(new Event('input',{bubbles:true}));});
await page.waitForTimeout(150);
const x = await page.evaluate(()=>{const c=document.getElementById('preview');const ctx=c.getContext('2d');const barH=Math.round(0.09*c.height);const bc=c.height-Math.round(0.08*c.height);const bt=bc-Math.floor(barH/2);const row=ctx.getImageData(0,bt-2,c.width,1).data;let sx=0,cnt=0;for(let i=0;i<c.width;i++){if(row[i*4+3]>40){sx+=i;cnt++;}}return cnt?Math.round(sx/cnt):-1;});
const w = await page.evaluate(()=>document.getElementById('preview').width);
console.log(`playhead x at 15% = ${x} of ${w} (RIGHT means > ${w/2})`);
console.log(errors.length?'ERRORS '+errors.join(';'):'NO ERRORS');
await browser.close();
