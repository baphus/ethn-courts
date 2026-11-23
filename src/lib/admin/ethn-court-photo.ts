import sharp from "sharp";

export const MAX_COURT_PHOTO_BYTES = 5 * 1024 * 1024;
export async function normalizeCourtPhoto(bytes: Buffer, type: string): Promise<Buffer> {
  if (!bytes.length || bytes.length > MAX_COURT_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("INVALID_INPUT");
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: false });
    const metadata = await image.metadata();
    const format = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[type];
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1) throw new Error();
    const photo = await image.rotate().resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (photo.length > 1048576) throw new Error();
    return photo;
  } catch { throw new Error("INVALID_INPUT"); }
}
