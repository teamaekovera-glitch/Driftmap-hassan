/**
 * Photo compression — the promise that a confirmed capture saves as
 * "typically a few hundred KB", never a multi-megabyte camera original.
 *
 * Pipeline: decode → clamp the long edge to 1600px → encode JPEG, stepping
 * quality down until the output fits the size budget. The budget is a
 * target, not a gate: when nothing fits, the smallest attempt is returned
 * rather than failing the capture — a lost photo is worse than a heavy one.
 *
 * The codec is injectable: `createCanvasCodec` is the real browser path
 * (createImageBitmap + canvas), and tests supply a fake to exercise the
 * dimension and quality-budget logic in Node, where no canvas exists.
 */

export const PHOTO_MAX_LONG_EDGE = 1600;
export const PHOTO_JPEG_QUALITY = 0.82;
/** Quality steps down until the encode fits this budget or the ladder ends. */
export const PHOTO_MAX_BYTES = 900_000;
export const PHOTO_MIME = "image/jpeg";

const QUALITY_FLOOR = 0.4;
const QUALITY_STEP = 0.12;
const MAX_LADDER_STEPS = 8;

export type PhotoErrorCode = "decode-failed" | "encode-failed" | "encode-unsupported";

export class PhotoError extends Error {
  readonly code: PhotoErrorCode;

  constructor(code: PhotoErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PhotoError";
    this.code = code;
  }
}

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  /** Quality of the encode that produced the blob. */
  quality: number;
}

/**
 * Long-edge clamp without upscaling. A 4000×3000 camera frame becomes
 * 1600×1200; an 800×600 upload stays 800×600.
 */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxLongEdge: number = PHOTO_MAX_LONG_EDGE,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new PhotoError("decode-failed", `Image dimensions are not usable: ${width}×${height}.`);
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxLongEdge / longEdge;
  // At least one pixel survives even extreme aspect ratios.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** What a codec hands back after decoding: something drawable, plus its size. */
export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface PhotoCodec {
  decode(blob: Blob): Promise<DecodedImage>;
  encode(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob>;
}

/** The drawing surface the two browser context types share, structurally. */
interface DrawContext {
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
}

/** The real codec: OffscreenCanvas when present, DOM canvas otherwise. */
export function createCanvasCodec(): PhotoCodec {
  return {
    async decode(blob: Blob): Promise<DecodedImage> {
      if (typeof createImageBitmap !== "function") {
        throw new PhotoError(
          "encode-unsupported",
          "Reading photos needs a browser with image decoding support — raw files are left untouched.",
        );
      }
      try {
        const bitmap = await createImageBitmap(blob);
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
      } catch (error) {
        throw new PhotoError("decode-failed", "This file could not be read as an image.", { cause: error });
      }
    },

    async encode(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob> {
      const canvas = createCanvas(width, height);
      // Both 2D context flavors implement the three members DrawContext
      // declares; the structural assertion keeps one shared draw path.
      const context = canvas.getContext("2d") as DrawContext | null;
      if (!context) {
        throw new PhotoError("encode-unsupported", "This browser refused a 2D drawing context.");
      }
      // JPEG has no alpha channel — flatten onto white so transparent
      // sources stay light instead of turning black.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);
      try {
        return await encodeCanvas(canvas, quality);
      } catch (error) {
        throw error instanceof PhotoError
          ? error
          : new PhotoError("encode-failed", "This browser could not encode the compressed photo.", { cause: error });
      }
    },
  };
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new PhotoError(
    "encode-unsupported",
    "Compressing photos needs a browser canvas, which is not available here.",
  );
}

function encodeCanvas(canvas: OffscreenCanvas | HTMLCanvasElement, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: PHOTO_MIME, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new PhotoError("encode-failed", "This browser could not encode the compressed photo."));
        }
      },
      PHOTO_MIME,
      quality,
    );
  });
}

export interface CompressOptions {
  codec?: PhotoCodec;
  maxLongEdge?: number;
  quality?: number;
  maxBytes?: number;
}

/**
 * Compress one capture: decode, clamp the long edge, encode at the starting
 * quality, then step quality down until the blob fits the byte budget. The
 * result reports the dimensions and quality actually encoded.
 */
export async function compressPhoto(input: Blob, options: CompressOptions = {}): Promise<CompressResult> {
  const codec = options.codec ?? createCanvasCodec();
  const maxLongEdge = options.maxLongEdge ?? PHOTO_MAX_LONG_EDGE;
  const maxBytes = options.maxBytes ?? PHOTO_MAX_BYTES;
  const startQuality = options.quality ?? PHOTO_JPEG_QUALITY;

  const { source, width, height } = await codec.decode(input);
  const target = computeTargetDimensions(width, height, maxLongEdge);

  const attempts: { blob: Blob; quality: number }[] = [];
  for (const quality of buildQualityLadder(startQuality)) {
    const blob = await codec.encode(source, target.width, target.height, quality);
    if (blob.size <= maxBytes) {
      return { blob, width: target.width, height: target.height, quality };
    }
    attempts.push({ blob, quality });
  }
  // The ladder is never empty, so this is unreachable — but a failed capture
  // must never surface as a raw TypeError on an undefined index.
  const last = attempts[attempts.length - 1];
  if (!last) {
    throw new PhotoError("encode-failed", "No compression attempt was made.");
  }
  return { blob: last.blob, width: target.width, height: target.height, quality: last.quality };
}

/**
 * Starting quality first, then steps of 0.12 down to the 0.4 floor, rounded
 * to two decimals so the ladder is stable across engines.
 */
function buildQualityLadder(start: number): number[] {
  const ladder: number[] = [];
  for (let quality = start; quality > QUALITY_FLOOR - 1e-9 && ladder.length < MAX_LADDER_STEPS; quality -= QUALITY_STEP) {
    ladder.push(Number(quality.toFixed(2)));
  }
  const floor = Number(QUALITY_FLOOR.toFixed(2));
  if (ladder[ladder.length - 1] !== floor) {
    ladder.push(floor);
  }
  return ladder;
}
