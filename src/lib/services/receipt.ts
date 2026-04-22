import { httpsCallable } from "firebase/functions";
import { functions } from "$lib/firebase";

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

export interface ReceiptData {
  store: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
}

export interface QuotaInfo {
  remaining: number;
  total: number;
  used: number;
}

async function compressImage(file: File, maxDim = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

export async function scanReceipt(file: File): Promise<ReceiptData> {
  if (!functions) throw new Error("Firebase not configured. Receipt scanning unavailable offline.");
  const fn = httpsCallable<
    { image: string; mimeType: string },
    { success: boolean; data: ReceiptData }
  >(functions, "scanReceipt");
  const compressed = await compressImage(file);
  const base64 = await blobToBase64(compressed);
  const result = await fn({ image: base64, mimeType: "image/jpeg" });
  return result.data.data;
}

export async function getQuota(): Promise<QuotaInfo> {
  if (!functions) return { remaining: 0, total: 0, used: 0 };
  const fn = httpsCallable<void, QuotaInfo>(functions, "getMyQuota");
  const result = await fn();
  return result.data;
}

export { isFirebaseConfigured } from "$lib/firebase";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
