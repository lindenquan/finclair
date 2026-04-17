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

export async function scanReceipt(file: File): Promise<ReceiptData> {
	if (!functions) throw new Error("Firebase not configured. Receipt scanning unavailable offline.");
	const fn = httpsCallable<
		{ image: string; mimeType: string },
		{ success: boolean; data: ReceiptData }
	>(functions, "scanReceipt");
	const base64 = await fileToBase64(file);
	const result = await fn({ image: base64, mimeType: file.type });
	return result.data.data;
}

export async function getQuota(): Promise<QuotaInfo> {
	if (!functions) return { remaining: 0, total: 0, used: 0 };
	const fn = httpsCallable<void, QuotaInfo>(functions, "getMyQuota");
	const result = await fn();
	return result.data;
}

export { isFirebaseConfigured } from "$lib/firebase";

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			resolve(dataUrl.split(",")[1]);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}
