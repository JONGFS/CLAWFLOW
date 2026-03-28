import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface SceneItem {
  photo_index: number;
  overlay_text: string;
  duration_sec: number;
  voiceover_segment: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

export function canExportMp4(): boolean {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return false;
  }

  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
    return false;
  }

  const ctx = new OffscreenCanvas(1, 1).getContext('2d');
  return Boolean(ctx);
}

async function loadImage(source: string | File): Promise<ImageBitmap> {
  if (source instanceof File) {
    return createImageBitmap(source);
  }
  // For blob: URLs, convert via image element workaround
  if (source.startsWith('blob:')) {
    const res = await fetch(source);
    const blob = await res.blob();
    return createImageBitmap(blob);
  }
  const res = await fetch(source);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

function drawCoverFit(
  ctx: OffscreenCanvasRenderingContext2D,
  img: ImageBitmap,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = img.width * scale;
  const sh = img.height * scale;
  ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh);
}

function drawOverlay(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  w: number,
) {
  if (!text) return;

  const pad = 24;
  const margin = 40;
  const fontSize = 52;

  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';

  // Measure wrapped lines
  const maxWidth = w - margin * 2 - pad * 2;
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineHeight = fontSize * 1.25;
  const boxH = lines.length * lineHeight + pad * 2;
  const boxY = HEIGHT - 120 - boxH;

  // Semi-transparent background
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(margin, boxY, w - margin * 2, boxH, 12);
  } else {
    const radius = 12;
    ctx.moveTo(margin + radius, boxY);
    ctx.lineTo(w - margin - radius, boxY);
    ctx.quadraticCurveTo(w - margin, boxY, w - margin, boxY + radius);
    ctx.lineTo(w - margin, boxY + boxH - radius);
    ctx.quadraticCurveTo(w - margin, boxY + boxH, w - margin - radius, boxY + boxH);
    ctx.lineTo(margin + radius, boxY + boxH);
    ctx.quadraticCurveTo(margin, boxY + boxH, margin, boxY + boxH - radius);
    ctx.lineTo(margin, boxY + radius);
    ctx.quadraticCurveTo(margin, boxY, margin + radius, boxY);
  }
  ctx.fill();

  // White text
  ctx.fillStyle = '#ffffff';
  lines.forEach((ln, i) => {
    ctx.fillText(ln, margin + pad, boxY + pad + i * lineHeight, maxWidth);
  });
}

export async function renderVideoToMp4(
  scenes: SceneItem[],
  photoSources: (string | File)[],
  onProgress: (pct: number) => void,
): Promise<Blob> {
  if (!canExportMp4()) {
    throw new Error('MP4 export requires a Chromium browser with WebCodecs, OffscreenCanvas, and image bitmap support.');
  }

  if (scenes.length === 0) {
    throw new Error('No scenes were generated to export.');
  }

  // Preload images
  const uniqueIndices = [...new Set(scenes.map(s => s.photo_index))];
  const images = new Map<number, ImageBitmap>();
  await Promise.all(
    uniqueIndices.map(async idx => {
      const source = photoSources[idx] ?? photoSources[photoSources.length - 1];
      if (source) images.set(idx, await loadImage(source));
    }),
  );

  const totalFrames = scenes.reduce(
    (acc, s) => acc + Math.round(s.duration_sec * FPS),
    0,
  );
  if (totalFrames < 1) {
    throw new Error('Generated scenes do not contain any renderable frames.');
  }

  // Set up MP4 muxer
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width: WIDTH,
      height: HEIGHT,
    },
    fastStart: 'in-memory',
  });

  // Set up encoder
  let framesEncoded = 0;
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta ?? undefined);
      framesEncoded++;
      onProgress(Math.round((framesEncoded / totalFrames) * 100));
    },
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  encoder.configure({
    codec: 'avc1.42001f', // H.264 Baseline
    width: WIDTH,
    height: HEIGHT,
    bitrate: 4_000_000,
    framerate: FPS,
  });

  // Render frames
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d')!;

  let frameIndex = 0;

  for (const scene of scenes) {
    const frameDuration = Math.round(scene.duration_sec * FPS);
    const img = images.get(scene.photo_index);

    for (let f = 0; f < frameDuration; f++) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      if (img) drawCoverFit(ctx, img, WIDTH, HEIGHT);
      drawOverlay(ctx, scene.overlay_text, WIDTH);

      const timestamp = (frameIndex / FPS) * 1_000_000; // microseconds
      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: (1 / FPS) * 1_000_000,
      });

      const keyFrame = f === 0; // keyframe at start of each scene
      encoder.encode(frame, { keyFrame });
      frame.close();

      frameIndex++;

      // Yield to main thread periodically to keep UI responsive
      if (frameIndex % 30 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  await encoder.flush();
  if (encoderError) {
    throw encoderError;
  }
  encoder.close();
  muxer.finalize();

  return new Blob([target.buffer], { type: 'video/mp4' });
}
