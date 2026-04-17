import { HttpsError, onCall } from "firebase-functions/v2/https";
import { addPurchasedScans, consumeScan, getQuota } from "./quota.js";
import { parseReceipt } from "./receipt.js";

// Ensure admin is initialized
import "./admin.js";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export const scanReceipt = onCall({ maxInstances: 10 }, async (request) => {
	if (!request.auth) {
		throw new HttpsError("unauthenticated", "Sign in required.");
	}

	const { image, mimeType } = request.data as { image?: string; mimeType?: string };

	if (!image || !mimeType) {
		throw new HttpsError("invalid-argument", "image and mimeType are required.");
	}

	if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
		throw new HttpsError("invalid-argument", "Unsupported image type.");
	}

	const sizeBytes = Math.ceil((image.length * 3) / 4);
	if (sizeBytes > MAX_IMAGE_SIZE) {
		throw new HttpsError("invalid-argument", "Image too large (max 10MB).");
	}

	const canScan = await consumeScan(request.auth.uid);
	if (!canScan) {
		throw new HttpsError("resource-exhausted", "No scans remaining. Purchase more credits.");
	}

	try {
		const data = await parseReceipt(image, mimeType);
		return { success: true, data };
	} catch {
		throw new HttpsError("internal", "Failed to parse receipt.");
	}
});

export const getMyQuota = onCall(async (request) => {
	if (!request.auth) {
		throw new HttpsError("unauthenticated", "Sign in required.");
	}
	return getQuota(request.auth.uid);
});

export const redeemPurchase = onCall(async (request) => {
	if (!request.auth) {
		throw new HttpsError("unauthenticated", "Sign in required.");
	}

	const { purchaseToken, scans } = request.data as {
		purchaseToken?: string;
		scans?: number;
	};

	if (!purchaseToken || !scans || scans <= 0) {
		throw new HttpsError("invalid-argument", "Invalid purchase data.");
	}

	// TODO: Verify purchaseToken with Google Play Developer API
	// For now, trust the token — implement server-side verification before production
	await addPurchasedScans(request.auth.uid, scans);
	return getQuota(request.auth.uid);
});
