import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C:'+m.text());});
await p.goto('http://localhost:8123/index.html',{waitUntil:'networkidle'}); await p.waitForTimeout(900);
// Measure: instrument by reading the font sizes the engine would use. Easiest: render and
// detect uniformity by checking the cap height of each label region is equal. Instead, hook
// measureText: re-run the label sizing logic in-page against the live chapters.
const res = await p.evaluate(async () => {
  const mod = await import('./js/bar-engine.js?v=18');
  // emulate: build chapters like the app (equal width, 10:00) with the default names
  const rows = [
    {name:'פתיחה', startSec:0, rgb:[0.06,0.43,0.34]},
    {name:'נושא ראשון', startSec:84, rgb:[0.22,0.54,0.87]},
    {name:'נושא שני', startSec:197, rgb:[0.45,0.30,0.72]},
    {name:'סיכום', startSec:500, rgb:[0.75,0.30,0.15]},
  ];
  const style = { ...mod.DEFAULT_STYLE, layout:'bar', direction:'ltr' };
  const chapters = mod.buildChapters(rows, 'equal', 600, style);
  const W=1920,H=1080; const layout = mod.computeLayout(W,H,style);
  // Replicate pass-1 measurement to report the uniform size + per-name natural sizes
  const c = document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d');
  const barW = layout.barRight-layout.barLeft, bl=layout.barLeft;
  const fam = `"${style.fontFamily}", "Segoe UI", sans-serif`;
  const base = layout.fontSize, FLOOR=10;
  function fit(name, avail){ let s=base; while(s>FLOOR){ ctx.font=`bold ${s}px ${fam}`; if(ctx.measureText(name).width<=avail) break; s-=1;} return s; }
  const perName = chapters.map(ch=>{const segL=bl+Math.round(ch.sp*barW),segR=bl+Math.round(ch.ep*barW);return {name:ch.name, fit:fit(ch.name,(segR-segL)-8)};});
  const uniform = Math.min(...perName.map(x=>x.fit));
  return { base, perName, uniform };
});
console.log('base size:', res.base);
console.log('per-name natural fit:', JSON.stringify(res.perName));
console.log('UNIFORM size used for all:', res.uniform);
// also render the real preview screenshot
await p.evaluate(()=>document.querySelectorAll('.card.collapsed').forEach(c=>c.classList.remove('collapsed')));
await p.locator('.canvas-wrap').screenshot({path:'C:/tmp/uniform.png'});
console.log(errs.length?'ERRORS '+errs.join(';'):'NO ERRORS');
await b.close();
