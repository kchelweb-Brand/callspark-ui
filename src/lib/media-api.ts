import { deleteGreetingFn, uploadGreetingFn } from "@/backend/media.server";
import { getSessionToken } from "./auth-api";

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

/**
 * Reads a File into base64. Chunked because spreading a large byte array into
 * String.fromCharCode blows the argument limit on files over a few hundred KB.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      resolve(btoa(binary));
    };
    reader.readAsArrayBuffer(file);
  });
}

export interface UploadedGreeting {
  key: string;
  url: string;
  fileName: string;
  bytes: number;
}

export async function uploadGreeting(file: File): Promise<UploadedGreeting> {
  const base64 = await fileToBase64(file);
  const result = await uploadGreetingFn({
    data: {
      token: requireToken(),
      fileName: file.name,
      contentType: file.type || "audio/mpeg",
      base64,
    },
  });
  return { key: result.key, url: result.url, fileName: result.fileName, bytes: result.bytes };
}

export function deleteGreeting(key: string) {
  return deleteGreetingFn({ data: { token: requireToken(), key } });
}
