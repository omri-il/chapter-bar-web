import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => document.querySelectorAll(".card.collapsed").forEach(c => c.classList.remove("collapsed")));
await page.locator('.seg[data-layout="circle"]').click();
await page.locator('#videoLength').fill('0:15');
const starts = await page.$$('.ch-start');
const vals = ['0:00','0:04','0:09','0:12'];
for (let i=0;i<starts.length;i++){ await starts[i].fill(vals[i]); }
await page.locator('#videoFile').setInputFiles('C:/tmp/sample15.mp4');
await page.waitForTimeout(300);
const dl = page.waitForEvent('download', { timeout: 120000 }).catch(()=>null);
await page.locator('#exportBurnin').click();
const download = await dl;
if (download){ const p='C:/tmp/'+download.suggestedFilename(); await download.saveAs(p); console.log('DOWNLOAD', download.suggestedFilename(), fs.statSync(p).size); }
else console.log('NO DOWNLOAD');
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
