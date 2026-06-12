import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push('C:'+m.text());});
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// collapsible: count toggles, check a collapsed card exists (design), and toggling works
const toggles = await page.locator('.card-toggle').count();
console.log('card-toggles:', toggles);
const collapsedCount = await page.locator('.card.collapsed').count();
console.log('collapsed by default:', collapsedCount);
// expand the design card (find toggle containing "עיצוב")
const designToggle = page.locator('.card-toggle', { hasText: 'עיצוב' }).first();
const designCard = page.locator('.card', { has: designToggle });
console.log('design collapsed before click:', await designCard.evaluate(el => el.classList.contains('collapsed')));
await designToggle.click(); await page.waitForTimeout(150);
console.log('design collapsed after click:', await designCard.evaluate(el => el.classList.contains('collapsed')));

// layout toggle still works after collapsible transform (display style card is open)
await page.locator('#showCircle').check(); await page.waitForTimeout(150);
console.log('circleControls visible after toggle:', !(await page.locator('#circleControls').isHidden()));
await page.locator('#showCircle').uncheck();

// keep playing while scrubbing
await page.locator('.card-toggle', { hasText: 'העלאת סרטון' }).first().click().catch(()=>{}); // ensure upload open (it's open by default; click would close — so skip)
await page.locator('#videoFile').setInputFiles('C:/tmp/sample15.mp4');
await page.waitForTimeout(2500);
await page.locator('#playBtn').click(); // play
await page.waitForTimeout(600);
const playingBefore = await page.locator('#previewVideo').evaluate(v => !v.paused);
await page.locator('#scrub').evaluate(el => { el.value=700; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(400);
const playingAfter = await page.locator('#previewVideo').evaluate(v => !v.paused);
const curT = await page.locator('#previewVideo').evaluate(v => v.currentTime);
console.log('video playing before scrub:', playingBefore, '| after scrub:', playingAfter, '| currentTime~', curT.toFixed(2));

console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'NO ERRORS');
await browser.close();
