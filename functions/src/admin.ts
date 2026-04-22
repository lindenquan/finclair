import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize app - supports both production and emulator environments
// When FIRESTORE_EMULATOR_HOST is set, Firebase Admin automatically uses it
export const app = getApps().length > 0 ? getApps()[0] : initializeApp();
export const db = getFirestore(app);
