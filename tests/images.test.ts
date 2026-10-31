import { describe, expect, it } from "vitest";
import { blobToDataUrl, dataUrlToImage } from "@/services/images";

describe("image conversions", () => {
  it("round-trips bytes through a data URL", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const url = await blobToDataUrl(new Blob([bytes], { type: "image/png" }));
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    const back = dataUrlToImage(url);
    expect(back.mimeType).toBe("image/png");
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(bytes);
  });

  it("handles images larger than one conversion chunk", async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    const back = dataUrlToImage(await blobToDataUrl(new Blob([bytes])));
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(bytes);
  });
});
