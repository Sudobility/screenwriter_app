/**
 * Turn a user-picked image file into a `data:image/png;base64,...` string the image endpoints accept.
 * Any decodable format (PNG, JPEG, WebP, …) is re-encoded to PNG via a canvas, and oversized images are
 * scaled down so the result stays well under the API's 15 MB upload cap.
 */
export async function fileToPngDataUrl(file: File, maxDimension = 2048): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read the image");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
