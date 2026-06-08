import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport:{width:1300,height:1000} });
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push('C:'+m.text());});
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const order0 = await page.$$eval('.controls > .card', els => els.map(e=>e.dataset.card));
console.log('initial order:', JSON.stringify(order0));
const grips = await page.locator('.controls > .card .grip').count();
console.log('grips:', grips);

// try a real drag: move "design" card up onto "upload"
const src = page.locator('.controls > .card[data-card="design"] .grip');
const tgt = page.locator('.controls > .card[data-card="upload"] .card-toggle');
await src.dragTo(tgt);
await page.waitForTimeout(300);
const order1 = await page.$$eval('.controls > .card', els => els.map(e=>e.dataset.card));
console.log('after drag order:', JSON.stringify(order1));
const persisted = await page.evaluate(() => localStorage.getItem('chapterbar.cardOrder.v1'));
console.log('persisted:', persisted);

// test restore: set a custom order, reload, verify
await page.evaluate(() => localStorage.setItem('chapterbar.cardOrder.v1', JSON.stringify(['chapters','design','upload','settings','style','subtitle'])));
await page.reload({ waitUntil:'networkidle' });
await page.waitForTimeout(800);
const order2 = await page.$$eval('.controls > .card', els => els.map(e=>e.dataset.card));
console.log('after reload (restored):', JSON.stringify(order2));

console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'NO ERRORS');
await browser.close();
