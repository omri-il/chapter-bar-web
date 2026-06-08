/* export-burnin.js — composite the bar onto the user's own video and re-encode to MP4.
 *
 * Pipeline (all client-side, file never leaves the machine):
 *   mp4box.js demux video  ->  VideoDecoder  ->  draw frame + bar  ->  VideoEncoder (H.264)
 *   AudioContext.decodeAudioData  ->  AudioEncoder (AAC)            ->  mp4-muxer  ->  download .mp4
 *
 * Audio is decoded to PCM and re-encoded to AAC (avoids fragile esds parsing).
 * Requires WebCodecs (desktop Chrome/Edge).
 */
import MP4Box from 'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/+esm';
import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs';
import { computeLayout, renderFrame, visualProgressFromTime, buildChapters, formatClock } from './bar-engine.js?v=17';

export function isBurnInSupported() {
  return typeof VideoDecoder !== 'undefined'
    && typeof VideoEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined';
}

// Pick the first H.264 codec string the encoder actually supports for these dimensions.
async function pickAvcCodec(width, height) {
  const candidates = ['avc1.640034', 'avc1.640033', 'avc1.640028', 'avc1.4d0028', 'avc1.42001f'];
  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, framerate: 30 });
      if (supported) return codec;
    } catch (_) { /* try next */ }
  }
  return 'avc1.42001f';
}

// Extract the codec-private description (avcC/hvcC) for VideoDecoder.
function getVideoDescription(mp4file, track) {
  const trak = mp4file.getTrackById(track.id);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8); // strip the 8-byte box header
    }
  }
  return undefined;
}

// Demux video track -> { config, chunks[], durationSec, width, height }
function demuxVideo(fileBuffer) {
  return new Promise((resolve, reject) => {
    const mp4file = MP4Box.createFile();
    const chunks = [];
    let videoTrack = null;
    let description, durationSec, width, height, codec;

    mp4file.onError = (e) => reject(new Error('שגיאה בקריאת הקובץ: ' + e));
    mp4file.onReady = (info) => {
      videoTrack = info.videoTracks && info.videoTracks[0];
      if (!videoTrack) return reject(new Error('לא נמצא וידאו בקובץ.'));
      width = videoTrack.video.width;
      height = videoTrack.video.height;
      codec = videoTrack.codec;
      durationSec = videoTrack.duration / videoTrack.timescale;
      description = getVideoDescription(mp4file, videoTrack);
      mp4file.setExtractionOptions(videoTrack.id, null, { nbSamples: Infinity });
      mp4file.start();
    };
    mp4file.onSamples = (id, user, samples) => {
      for (const s of samples) {
        chunks.push(new EncodedVideoChunk({
          type: s.is_sync ? 'key' : 'delta',
          timestamp: (s.cts / s.timescale) * 1e6,
          duration: (s.duration / s.timescale) * 1e6,
          data: s.data,
        }));
      }
      if (chunks.length >= videoTrack.nb_samples) {
        resolve({ codec, description, chunks, durationSec, width, height });
      }
    };

    const buf = fileBuffer.slice(0); // mp4box mutates fileStart
    buf.fileStart = 0;
    mp4file.appendBuffer(buf);
    mp4file.flush();
  });
}

// Decode -> composite bar -> encode video. Returns when all frames are muxed.
async function transcodeVideo({ video, muxer, state, onProgress }) {
  const { width, height, durationSec } = video;
  const layout = computeLayout(width, height, state.style);
  // Rebuild chapters against the REAL video duration so the last chapter ends at the
  // actual end and start timestamps line up with the user's playhead readings.
  const chapters = buildChapters(state.rows, state.widthMode, durationSec, state.style);

  // Bar drawn on its own transparent canvas, then composited over each video frame.
  const barCanvas = new OffscreenCanvas(width, height);
  const barCtx = barCanvas.getContext('2d', { alpha: true });
  const outCanvas = new OffscreenCanvas(width, height);
  const outCtx = outCanvas.getContext('2d', { alpha: false });

  const avcCodec = await pickAvcCodec(width, height);
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  encoder.configure({
    codec: avcCodec,
    width, height,
    bitrate: Math.round(width * height * 4),  // ~4 bits/pixel*frame baseline
    framerate: 30,
    avc: { format: 'avc' },
  });

  let processed = 0;
  const totalCount = video.chunks.length;
  const t0 = performance.now();

  const decoder = new VideoDecoder({
    output: (frame) => {
      const tSec = frame.timestamp / 1e6;
      const progress = visualProgressFromTime(tSec, chapters);
      renderFrame(barCtx, { progress, elapsedSec: tSec, chapters, width, height, layout, style: state.style, subtitles: state.subtitles });
      outCtx.drawImage(frame, 0, 0, width, height);
      outCtx.drawImage(barCanvas, 0, 0);
      const outFrame = new VideoFrame(outCanvas, { timestamp: frame.timestamp, duration: frame.duration });
      encoder.encode(outFrame);
      outFrame.close();
      frame.close();
      processed++;
      if (processed % 5 === 0 || processed === totalCount) {
        const elapsed = (performance.now() - t0) / 1000;
        const rate = processed / Math.max(0.001, elapsed);          // frames/sec
        const remaining = (totalCount - processed) / Math.max(0.1, rate);
        const etaTxt = processed > 3 ? ` · נותרו כ-${formatClock(remaining)}` : '';
        onProgress && onProgress(0.05 + 0.8 * (processed / totalCount),
          `מייצר פס ההתקדמות… ${Math.round(100 * processed / totalCount)}%${etaTxt}`);
      }
    },
    error: (e) => { throw e; },
  });
  decoder.configure({ codec: video.codec, codedWidth: width, codedHeight: height, description: video.description });

  for (const chunk of video.chunks) {
    decoder.decode(chunk);
    while (decoder.decodeQueueSize > 20 || encoder.encodeQueueSize > 20) {
      await new Promise(r => setTimeout(r, 4));
    }
  }
  await decoder.flush();
  await encoder.flush();
  decoder.close();
  encoder.close();
}

// Decode whole audio to PCM and re-encode to AAC. Returns the audio params (or null if no audio).
async function probeAudio(fileBuffer) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const audioBuf = await ac.decodeAudioData(fileBuffer.slice(0));
    ac.close();
    return audioBuf;
  } catch (_) {
    return null; // no audio track / unsupported codec
  }
}

async function encodeAudio({ audioBuf, muxer, onProgress }) {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return;
  const sampleRate = audioBuf.sampleRate;
  const numberOfChannels = audioBuf.numberOfChannels;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  encoder.configure({ codec: 'mp4a.40.2', sampleRate, numberOfChannels, bitrate: 192000 });

  const frameSize = 1024;
  const total = audioBuf.length;
  for (let off = 0; off < total; off += frameSize) {
    const len = Math.min(frameSize, total - off);
    const data = new Float32Array(len * numberOfChannels);
    for (let c = 0; c < numberOfChannels; c++) {
      data.set(audioBuf.getChannelData(c).subarray(off, off + len), c * len);
    }
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate, numberOfChannels, numberOfFrames: len,
      timestamp: Math.round((off / sampleRate) * 1e6),
      data,
    });
    encoder.encode(ad);
    ad.close();
    if (encoder.encodeQueueSize > 30) await new Promise(r => setTimeout(r, 2));
  }
  await encoder.flush();
  encoder.close();
  onProgress && onProgress(0.97, 'מצרף אודיו…');
}

export async function burnIn(file, state, { onProgress, onDone, onError } = {}) {
  if (!isBurnInSupported()) {
    const e = new Error('הצריבה דורשת Chrome או Edge במחשב.');
    onError && onError(e); throw e;
  }
  try {
    onProgress && onProgress(0.01, 'קורא את הקובץ…');
    const fileBuffer = await file.arrayBuffer();

    onProgress && onProgress(0.03, 'מנתח אודיו…');
    const audioBuf = await probeAudio(fileBuffer);

    onProgress && onProgress(0.04, 'מנתח וידאו…');
    const video = await demuxVideo(fileBuffer);

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: video.width, height: video.height },
      ...(audioBuf ? { audio: { codec: 'aac', sampleRate: audioBuf.sampleRate, numberOfChannels: audioBuf.numberOfChannels } } : {}),
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });

    await transcodeVideo({ video, muxer, state, onProgress });
    if (audioBuf) await encodeAudio({ audioBuf, muxer, onProgress });

    muxer.finalize();
    const { buffer } = muxer.target;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    downloadBlob(blob, nameForOutput(file.name));
    onDone && onDone('הסרטון מוכן! ירד אליכם קובץ MP4 עם הפס.');
  } catch (e) {
    onError && onError(e);
    throw e;
  }
}

function nameForOutput(orig) {
  const base = (orig || 'video').replace(/\.[^.]+$/, '');
  return `${base}-with-bar.mp4`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
