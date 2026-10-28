// Gets a receipt the customer picked ready to send: a phone screenshot is several
// megabytes, so a picture is scaled down first. A PDF is sent as it is.

export interface PreparedReceipt {
  name: string;
  type: string;
  data: string;
}

const MAX_BYTES = 1_800_000;
const MAX_SIDE = 1800;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function shrink(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  } catch {
    return null;
  }
}

export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  let blob: Blob = file;
  let type = file.type;
  if (file.type.startsWith("image/") && (file.size > 900_000 || file.type === "image/webp")) {
    const small = await shrink(file);
    if (small) {
      blob = small;
      type = "image/jpeg";
    }
  }
  if (blob.size > MAX_BYTES) {
    throw new Error("That receipt is too large. Take a smaller screenshot, or crop it, and try again.");
  }
  return { name: file.name, type, data: toBase64(await blob.arrayBuffer()) };
}
