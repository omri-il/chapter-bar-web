import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });

const res = await page.evaluate(async () => {
  async function roundtrip(mime) {
    const c = document.createElement('canvas'); c.width=128; c.height=128;
    const cx = c.getContext('2d', {alpha:true});
    const stream = c.captureStream(15);
    const chunks=[];
    const rec = new MediaRecorder(stream, {mimeType:mime});
    rec.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r=>rec.onstop=r);
    rec.start();
    // draw transparent bg + opaque red square for ~0.5s
    const t0=performance.now();
    await new Promise(done=>{
      function f(){ cx.clearRect(0,0,128,128); cx.fillStyle='red'; cx.fillRect(0,0,64,128);
        if(performance.now()-t0>500){done();return;} requestAnimationFrame(f); }
      requestAnimationFrame(f);
    });
    rec.stop(); await stopped;
    const blob = new Blob(chunks, {type:'video/webm'});
    // decode the webm and inspect a pixel in the (should-be) transparent half
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video'); v.src=url; v.muted=true;
    await new Promise(r=>{v.onloadeddata=r; v.onerror=r;});
    try { await v.play(); } catch(e){}
    await new Promise(r=>setTimeout(r,200));
    const oc = document.createElement('canvas'); oc.width=128; oc.height=128;
    const ox = oc.getContext('2d', {alpha:true});
    ox.clearRect(0,0,128,128);
    ox.drawImage(v,0,0,128,128);
    const transparentSide = ox.getImageData(96,64,1,1).data;  // right half = should be transparent
    const opaqueSide = ox.getImageData(32,64,1,1).data;       // left half = red
    URL.revokeObjectURL(url);
    return { mime, size: blob.size, transparentAlpha: transparentSide[3], opaquePixel: [...opaqueSide] };
  }
  const out = [];
  for (const m of ['video/webm;codecs=vp8','video/webm;codecs=vp9']) {
    if (MediaRecorder.isTypeSupported(m)) out.push(await roundtrip(m));
  }
  return out;
});
console.log(JSON.stringify(res, null, 2));
console.log('\nInterpretation: transparentAlpha < 255 means the format preserved transparency.');
await browser.close();
