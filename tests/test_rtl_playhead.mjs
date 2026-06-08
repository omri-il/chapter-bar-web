import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// simple setup: length 100s, chapters within
await page.locator('#videoLength').fill('1:40'); // 100s
const starts = await page.$$('.ch-start');
const sv = ['0:00','0:25','0:50','1:15'];
for (let i=0;i<starts.length;i++) await starts[i].fill(sv[i]);
await page.waitForTimeout(150);

async function playheadX(progressFrac) {
  await page.locator('#scrub').evaluate((el,v)=>{ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); }, Math.round(progressFrac*1000));
  await page.waitForTimeout(120);
  return await page.evaluate(() => {
    const c = document.getElementById('preview');
    const ctx = c.getContext('2d');
    // scan a row just above the bar top where only the playhead overhangs
    const barH = Math.round(0.09 * c.height);
    const barCenterY = c.height - Math.round(0.08 * c.height);
    const bt = barCenterY - Math.floor(barH/2);
    const y = bt - 2;
    const row = ctx.getImageData(0, y, c.width, 1).data;
    let sx=0, cnt=0;
    for (let x=0;x<c.width;x++){ if (row[x*4+3]>40){ sx+=x; cnt++; } }
    return cnt ? Math.round(sx/cnt) : -1;
  });
}

for (const dir of ['ltr','rtl']) {
  await page.locator(`.seg[data-dir="${dir}"]`).click();
  await page.waitForTimeout(120);
  const lo = await playheadX(0.15);
  const hi = await playheadX(0.85);
  const w = await page.evaluate(()=>document.getElementById('preview').width);
  console.log(`${dir}: progress15% -> x=${lo}, progress85% -> x=${hi}  (width=${w})`);
}
await browser.close();
