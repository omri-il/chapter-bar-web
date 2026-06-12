import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500); // let fonts load
await page.evaluate(() => { document.querySelectorAll('.card.collapsed').forEach(c => c.classList.remove('collapsed')); document.querySelectorAll('details').forEach(d => d.open = true); });

// pick font Secular One + red text
await page.locator('#fontFamily').selectOption('Secular One');
await page.locator('#textColor').evaluate(el => { el.value='#ffd24a'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(800);
await page.locator('#scrub').evaluate(el => { el.value=500; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(300);
await page.locator('.preview-card').screenshot({ path: 'C:/tmp/font_color.png' });
console.log('font:', await page.locator('#fontFamily').inputValue(), 'color:', await page.locator('#textColor').inputValue());
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS (preview)');
await browser.close();
