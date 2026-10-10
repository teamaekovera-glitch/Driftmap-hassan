import { describe, expect, it } from "vitest";
import {
  PHOTO_JPEG_QUALITY,
  PhotoError,
  compressPhoto,
  computeTargetDimensions,
  createCanvasCodec,
  type PhotoCodec,
} from "./photo";

// ---------------------------------------------------------------------------
// computeTargetDimensions — the long-edge clamp, pure
// ---------------------------------------------------------------------------

describe("computeTargetDimensions", () => {
  it("clamps a landscape camera frame to the 1600px long edge", () => {
    expect(computeTargetDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it("clamps portrait frames", () => {
    expect(computeTargetDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it("never upscales small captures", () => {
    expect(computeTargetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(computeTargetDimensions(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("respects a custom long edge", () => {
    expect(computeTargetDimensions(4000, 3000, 800)).toEqual({ width: 800, height: 600 });
  });

  it("keeps at least one pixel at extreme aspect ratios", () => {
    expect(computeTargetDimensions(5000, 2)).toEqual({ width: 1600, height: 1 });
  });

  it("rejects unusable dimensions with a typed error", () => {
    for (const [width, height] of [
      [0, 100],
      [-5, 100],
      [Number.NaN, 100],
      [Number.POSITIVE_INFINITY, 100],
    ]) {
      expect(() => computeTargetDimensions(width, height)).toThrowError(PhotoError);
    }
  });
});

// ---------------------------------------------------------------------------
// compressPhoto — decode → clamp → encode with a quality budget
// ---------------------------------------------------------------------------

interface EncodeCall {
  width: number;
  height: number;
  quality: number;
}

/** A codec whose encoded size is a function of quality — deterministic. */
function fakeCodec(sizeForQuality: (quality: number) => number): {
  codec: PhotoCodec;
  calls: EncodeCall[];
} {
  const calls: EncodeCall[] = [];
  const codec: PhotoCodec = {
    async decode() {
      // A 4000×3000 "camera original".
      return { source: {} as CanvasImageSource, width: 4000, height: 3000 };
    },
    async encode(_source, width, height, quality) {
      calls.push({ width, height, quality });
      return new Blob([new Uint8Array(sizeForQuality(quality))], { type: "image/jpeg" });
    },
  };
  return { codec, calls };
}

describe("compressPhoto", () => {
  it("encodes once at the requested quality when the output fits", async () => {
    const { codec, calls } = fakeCodec(() => 100_000);
    const result = await compressPhoto(new Blob([new Uint8Array(10)]), { codec });

    expect(calls).toHaveLength(1);
    expect(result.quality).toBe(PHOTO_JPEG_QUALITY);
    // The 4000×3000 decode clamps to the default long edge.
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(calls[0]).toEqual({ width: 1600, height: 1200, quality: PHOTO_JPEG_QUALITY });
  });

  it("steps quality down until the output fits the budget", async () => {
    const { codec, calls } = fakeCodec((quality) => (quality >= 0.7 ? 2_000_000 : 500_000));
    const result = await compressPhoto(new Blob([new Uint8Array(10)]), { codec, maxBytes: 1_000_000 });

    expect(calls.map((call) => call.quality)).toEqual([0.82, 0.7, 0.58]);
    expect(result.quality).toBe(0.58);
    expect(result.blob.size).toBe(500_000);
    expect(result.blob.size).toBeLessThanOrEqual(1_000_000);
  });

  it("returns the smallest attempt when nothing fits the budget", async () => {
    const { codec, calls } = fakeCodec(() => 5_000_000);
    const result = await compressPhoto(new Blob([new Uint8Array(10)]), { codec });

    expect(calls[calls.length - 1].quality).toBe(0.4);
    expect(result.quality).toBe(0.4);
    expect(result.blob.size).toBe(5_000_000); // a heavy photo beats a lost capture
  });

  it("lets a custom long edge flow into the encoder", async () => {
    const { codec, calls } = fakeCodec(() => 10_000);
    await compressPhoto(new Blob([new Uint8Array(10)]), { codec, maxLongEdge: 800 });

    expect(calls[0]).toEqual({ width: 800, height: 600, quality: PHOTO_JPEG_QUALITY });
  });

  it("propagates decode failures as typed errors", async () => {
    const codec: PhotoCodec = {
      decode: async () => {
        throw new PhotoError("decode-failed", "corrupt image");
      },
      encode: async () => new Blob([]),
    };
    await expect(compressPhoto(new Blob([new Uint8Array(10)]), { codec })).rejects.toMatchObject({
      code: "decode-failed",
    });
  });

  it("reports target dimensions, not source dimensions", async () => {
    const { codec, calls } = fakeCodec(() => 10_000);
    const result = await compressPhoto(new Blob([new Uint8Array(10)]), { codec });

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(calls.every((call) => call.width === result.width && call.height === result.height)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createCanvasCodec — the real codec's behavior where no canvas exists
// ---------------------------------------------------------------------------

describe("createCanvasCodec", () => {
  it("fails with a typed error in Node, where there is no image decoder", async () => {
    const error = await createCanvasCodec()
      .decode(new Blob([new Uint8Array(10)]))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PhotoError);
    expect((error as PhotoError).code).toBe("encode-unsupported");
  });
});
