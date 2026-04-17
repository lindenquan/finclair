import { VertexAI } from "@google-cloud/vertexai";

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "";
const LOCATION = "us-central1";

const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
const model = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export interface ReceiptData {
	store: string;
	date: string;
	items: { name: string; quantity: number; price: number }[];
	subtotal: number;
	tax: number;
	total: number;
	currency: string;
}

const PROMPT = `Analyze this receipt image and extract structured data.
Return ONLY valid JSON with this exact schema (no markdown, no explanation):
{
  "store": "store name",
  "date": "YYYY-MM-DD",
  "items": [{"name": "item name", "quantity": 1, "price": 1.99}],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00,
  "currency": "USD"
}
If a field is not visible, use empty string for text or 0 for numbers.`;

export async function parseReceipt(imageBase64: string, mimeType: string): Promise<ReceiptData> {
	const result = await model.generateContent({
		contents: [
			{
				role: "user",
				parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: PROMPT }],
			},
		],
	});

	const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
	const cleaned = text.replaceAll(/```json\n?|\n?```/g, "").trim();
	return JSON.parse(cleaned) as ReceiptData;
}
