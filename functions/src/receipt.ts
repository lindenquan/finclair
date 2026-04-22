import { VertexAI } from "@google-cloud/vertexai";

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
if (!PROJECT_ID) throw new Error("GCLOUD_PROJECT or GCP_PROJECT must be set");

const LOCATION = "us-central1";

const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
const model = vertexAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
});

export interface ReceiptData {
  store: string;
  date: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
}

function isReceiptData(val: unknown): val is ReceiptData {
  if (!val || typeof val !== "object") return false;
  const v = val as Record<string, unknown>;
  return (
    typeof v.store === "string" &&
    typeof v.date === "string" &&
    Array.isArray(v.items) &&
    typeof v.subtotal === "number" &&
    typeof v.tax === "number" &&
    typeof v.total === "number" &&
    typeof v.currency === "string"
  );
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

  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");

  const cleaned = text.replaceAll(/```json\n?|\n?```/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("Gemini JSON parse failed", { cleaned });
    throw new Error(`Invalid JSON from Gemini: ${String(err)}`);
  }

  if (!isReceiptData(parsed)) {
    throw new Error(`Gemini response did not match schema: ${cleaned.slice(0, 200)}`);
  }
  return parsed;
}
