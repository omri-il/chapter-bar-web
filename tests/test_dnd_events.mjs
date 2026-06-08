import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport:{width:1300,height:1000} });
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.evaluate(()=>localStorage.removeItem('chapterbar.cardOrder.v1'));
await page.reload({waitUntil:'networkidle'});
await page.waitForTimeout(800);
const result = await page.evaluate(() => {
  const container = document.querySelector('.controls');
  const design = container.querySelector('.card[data-card="design"]');
  const upload = container.querySelector('.card[data-card="upload"]');
  const dt = new DataTransfer();
  design.draggable = true;
  design.dispatchEvent(new DragEvent('dragstart', { bubbles:true, dataTransfer:dt }));
  const box = upload.getBoundingClientRect();
  container.dispatchEvent(new DragEvent('dragover', { bubbles:true, dataTransfer:dt, clientY: box.top + 3 }));
  design.dispatchEvent(new DragEvent('dragend', { bubbles:true, dataTransfer:dt }));
  return {
    order: [...container.querySelectorAll(':scope > .card')].map(c=>c.dataset.card),
    persisted: localStorage.getItem('chapterbar.cardOrder.v1'),
  };
});
console.log('order after DnD events:', JSON.stringify(result.order));
console.log('persisted:', result.persisted);
console.log(errors.length?'ERRORS '+errors.join(';'):'NO ERRORS');
await browser.close();
