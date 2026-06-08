import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 1) upload video -> metadata autofill
await page.locator('#videoFile').setInputFiles('C:/tmp/sample15.mp4');
await page.waitForTimeout(2500);
console.log('videoLength:', await page.locator('#videoLength').inputValue());
console.log('resolution:', await page.locator('#resolution').inputValue());
console.log('fps:', await page.locator('#fps').inputValue());
console.log('videoMeta:', (await page.locator('#videoMeta').textContent()).trim());
console.log('previewVideo has src:', await page.locator('#previewVideo').evaluate(v => !!v.src));

// 2) capture chapter from current position
const before = await page.locator('.chapter-row').count();
await page.locator('#scrub').evaluate(el => { el.value=400; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(200);
await page.locator('#captureChapter').click();
await page.waitForTimeout(200);
const after = await page.locator('.chapter-row').count();
console.log('rows before/after capture:', before, after);
const lastStart = await page.$$eval('.ch-start', els => els[els.length-1].value);
console.log('captured start (should be ~6s, ms precision):', lastStart);

// 3) subtitles
await page.locator('#srtFile').setInputFiles('C:/tmp/test.srt');
await page.waitForTimeout(400);
console.log('subtitleCard hidden:', await page.locator('#subtitleCard').isHidden(), '| srtMeta:', (await page.locator('#srtMeta').textContent()).trim());

// scrub to 3s (within cue 1) and screenshot canvas
await page.locator('#videoLength').fill('0:15');
await page.locator('#scrub').evaluate(el => { el.value=200; el.dispatchEvent(new Event('input',{bubbles:true})); }); // 3s of 15
await page.waitForTimeout(200);
await page.locator('#preview').screenshot({ path: 'C:/tmp/r3_subs.png' });

// 4) direction RTL
await page.locator('.seg[data-dir="rtl"]').click();
await page.waitForTimeout(200);
await page.locator('#preview').screenshot({ path: 'C:/tmp/r3_rtl.png' });
await page.locator('.seg[data-dir="ltr"]').click();
await page.waitForTimeout(150);
await page.locator('#preview').screenshot({ path: 'C:/tmp/r3_ltr.png' });

console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
