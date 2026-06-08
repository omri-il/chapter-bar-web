import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
const seen = new Set();
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.locator('#videoLength').fill('0:15');
const starts = await page.$$('.ch-start');
const vals = ['0:00','0:04','0:09','0:12'];
for (let i=0;i<starts.length;i++){ await starts[i].fill(vals[i]); }
await page.locator('#videoFile').setInputFiles('C:/tmp/sample15.mp4');
await page.waitForTimeout(300);
const dl = page.waitForEvent('download', { timeout: 120000 }).catch(()=>null);
await page.locator('#exportBurnin').click();
// poll status text during generation
for (let i=0;i<40;i++){
  const t = (await page.locator('#exportStatusText').textContent()).trim();
  if (t) seen.add(t);
  await page.waitForTimeout(200);
}
const download = await dl;
console.log('final status:', (await page.locator('#exportStatusText').textContent()).trim());
console.log('--- sample of status messages seen ---');
[...seen].slice(0,8).forEach(s=>console.log('  '+s));
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
