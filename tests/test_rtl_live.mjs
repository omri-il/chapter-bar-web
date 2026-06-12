import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('https://omri-il.github.io/chapter-bar-web/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const hasDir = await page.locator('#barDirection').count();
console.log('direction toggle present on live:', hasDir);
if (!hasDir) { console.log('LIVE NOT YET UPDATED'); await browser.close(); process.exit(0); }
await page.evaluate(() => { document.querySelectorAll('.card.collapsed').forEach(c => c.classList.remove('collapsed')); document.querySelectorAll('details').forEach(d => d.open = true); });
await page.locator('#videoLength').fill('1:40');
const starts = await page.$$('.ch-start');
const sv=['0:00','0:25','0:50','1:15'];
for(let i=0;i<starts.length;i++) await starts[i].fill(sv[i]);
async function phx(p){
  await page.locator('#scrub').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},Math.round(p*1000));
  await page.waitForTimeout(120);
  return await page.evaluate(()=>{const c=document.getElementById('preview');const ctx=c.getContext('2d');const barH=Math.round(0.09*c.height);const bc=c.height-Math.round(0.08*c.height);const bt=bc-Math.floor(barH/2);const row=ctx.getImageData(0,bt-2,c.width,1).data;let sx=0,cnt=0;for(let x=0;x<c.width;x++){if(row[x*4+3]>40){sx+=x;cnt++;}}return cnt?Math.round(sx/cnt):-1;});
}
await page.locator('.seg[data-dir="rtl"]').click(); await page.waitForTimeout(120);
console.log('LIVE rtl: 15% ->', await phx(0.15), '| 85% ->', await phx(0.85));
console.log(errors.length?'ERRORS '+errors.join(';'):'no errors');
await browser.close();
