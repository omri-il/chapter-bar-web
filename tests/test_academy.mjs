// The business's academy look (default): a navy bar, ONE ochre tag on the chapter that plays.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
console.log('default look:', await page.locator('#barLook').inputValue());

// Mean x of ochre pixels (#FFC250) on the bar's centre row, and whether the bar is navy.
async function sample(scrub) {
  await page.locator('#scrub').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, scrub);
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const c = document.getElementById('preview'); const ctx = c.getContext('2d');
    const y = c.height - Math.round(0.08 * c.height) - Math.round(0.09 * c.height * 0.3);
    const row = ctx.getImageData(0, y, c.width, 1).data;
    let sx = 0, n = 0, navy = 0;
    for (let x = 0; x < c.width; x++) {
      const [r, g, b] = [row[x * 4], row[x * 4 + 1], row[x * 4 + 2]];
      if (r > 240 && Math.abs(g - 194) < 12 && b < 110) { sx += x; n++; }
      if (r < 40 && g < 70 && b > 50 && b < 110) navy++;
    }
    return { ochreX: n ? Math.round(sx / n) : -1, navy, w: c.width };
  });
}
const a = await sample(50), b = await sample(900);
console.log('5%:', JSON.stringify(a), '| 90%:', JSON.stringify(b));
const ok1 = a.ochreX > 0 && a.ochreX < a.w / 4 && b.ochreX > a.w * 3 / 4 && a.navy > a.w / 3;
await page.evaluate(() => { document.querySelectorAll('.card.collapsed').forEach(c => c.classList.remove('collapsed')); document.querySelectorAll('details').forEach(d => d.open = true); });
await page.locator('.seg[data-dir="rtl"]').click();
const r = await sample(50);
console.log('rtl 5%:', JSON.stringify(r));
const ok2 = r.ochreX > r.w * 3 / 4;
await page.locator('#barLook').selectOption('colors');
const k = await sample(50);
console.log('colors look 5%:', JSON.stringify(k));
const ok3 = k.ochreX === -1;
console.log(ok1 && ok2 && ok3 ? 'PASS' : 'FAIL', errors.length ? errors.join('\n') : 'NO ERRORS');
await browser.close();
