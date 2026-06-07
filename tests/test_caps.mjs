import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });

const caps = await page.evaluate(async () => {
  const out = {};
  // MediaRecorder mime support
  out.mr_vp8alpha = MediaRecorder.isTypeSupported('video/webm;codecs=vp8');
  out.mr_vp9 = MediaRecorder.isTypeSupported('video/webm;codecs=vp9');
  out.mr_mp4 = MediaRecorder.isTypeSupported('video/mp4');
  out.mr_h264 = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E');

  // WebCodecs encoder support
  async function chk(cfg){ try { const r = await VideoEncoder.isConfigSupported(cfg); return r.supported; } catch(e){ return 'err:'+e.name; } }
  out.vc_vp9_opaque = await chk({ codec:'vp09.00.10.08', width:640, height:360, framerate:30, bitrate:1e6 });
  out.vc_vp9_alpha  = await chk({ codec:'vp09.00.10.08', width:640, height:360, framerate:30, bitrate:1e6, alpha:'keep' });
  out.vc_h264 = await chk({ codec:'avc1.42001f', width:640, height:360, framerate:30, bitrate:1e6 });
  out.vc_h264_high = await chk({ codec:'avc1.640028', width:640, height:360, framerate:30, bitrate:1e6 });

  // Does MediaRecorder preserve alpha? Record a transparent canvas briefly.
  try {
    const c = document.createElement('canvas'); c.width=64; c.height=64;
    const cx = c.getContext('2d', {alpha:true});
    cx.clearRect(0,0,64,64); cx.fillStyle='rgba(255,0,0,1)'; cx.fillRect(0,0,32,64);
    const stream = c.captureStream(10);
    const chunks=[];
    const rec = new MediaRecorder(stream, {mimeType:'video/webm;codecs=vp8'});
    rec.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(res => rec.onstop = res);
    rec.start();
    await new Promise(r=>setTimeout(r,400));
    rec.stop(); await done;
    const blob = new Blob(chunks);
    out.mr_recorded_bytes = blob.size;
  } catch(e){ out.mr_record_err = e.name + ':' + e.message; }
  return out;
});
console.log(JSON.stringify(caps, null, 2));
await browser.close();
