import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
// auto-accept the "replace existing chapters?" confirm
page.on('dialog', d => d.accept());
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const rows = async () => page.$$eval('.chapter-row', rs => rs.map(r => ({
  name: r.querySelector('.ch-name').value, start: r.querySelector('.ch-start').value,
})));

// --- 1) paste list (DaVinci HH:MM:SS:FF, 1-hour base), offset on ---
await page.locator('#importToggle').click();
const list = ['פתיחה 01:00:00:00','Flash 3.5 01:08:59:08','עיצוב חדש 01:19:04:08','פיצול שיחות 01:24:26:22','NotebookLM 01:30:38:13','Vids 01:36:55:21','לתעודות GEM 01:50:50:21','סיכום 02:06:53:00'].join('\n');
await page.locator('#importText').fill(list);
await page.locator('#importRun').click();
await page.waitForTimeout(200);
const r1 = await rows();
console.log('paste rows:', r1.length, '| first:', JSON.stringify(r1[0]), '| last:', JSON.stringify(r1[r1.length-1]));
console.log('meta:', await page.locator('#importMeta').textContent());

// --- 2) offset OFF -> keeps the hour base ---
await page.locator('#importOffset').uncheck();
await page.locator('#importRun').click();
await page.waitForTimeout(200);
const r2 = await rows();
console.log('no-offset first start:', r2[0].start);

// --- 3) EDL string via file upload ---
const edl = `TITLE: Timeline 1
FCM: NON-DROP FRAME

001  001      V     C        01:00:00:00 01:00:00:01 01:00:00:00 01:00:00:01
 |C:ResolveColorBlue |M:Intro |D:1

002  001      V     C        01:05:00:00 01:05:00:01 01:05:00:00 01:05:00:01
 |C:ResolveColorBlue |M:Part Two |D:1
`;
await page.locator('#importOffset').check();
await page.setInputFiles('#importFile', { name: 'markers.edl', mimeType: 'text/plain', buffer: Buffer.from(edl, 'utf-8') });
await page.waitForTimeout(200);
const r3 = await rows();
console.log('edl rows:', JSON.stringify(r3));

// --- 4) garbage ---
await page.locator('#importText').fill('hello world\nno timecodes here');
await page.locator('#importRun').click();
await page.waitForTimeout(100);
console.log('garbage meta:', await page.locator('#importMeta').textContent());

console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
