import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelectorAll(".card.collapsed").forEach(c => c.classList.remove("collapsed")));
await page.locator('#videoFile').setInputFiles('C:/tmp/sample15.mp4');
await page.waitForTimeout(2500);
await page.locator('#srtFile').setInputFiles('C:/tmp/test.srt');
await page.waitForTimeout(400);
// set chapter starts within 15s
const starts = await page.$$('.ch-start');
const sv = ['0:00','0:04','0:09','0:12'];
for (let i=0;i<starts.length;i++) await starts[i].fill(sv[i]);
await page.waitForTimeout(200);
const dl = page.waitForEvent('download', { timeout: 120000 }).catch(()=>null);
await page.locator('#exportBurnin').click();
const d = await dl;
if (d){ const p='C:/tmp/'+d.suggestedFilename(); await d.saveAs(p); console.log('DOWNLOAD', d.suggestedFilename(), fs.statSync(p).size); }
else console.log('NO DOWNLOAD');
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
