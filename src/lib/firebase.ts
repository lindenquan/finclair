import { type Analytics, getAnalytics } from "firebase/analytics";
import { type FirebaseApp, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";
import { type Functions, getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _functions: Functions | null = null;
let _analytics: Analytics | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);

  // Initialize App Check with reCAPTCHA v3 (only in browser, not during tests)
  const appCheckSiteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY;
  if (appCheckSiteKey && globalThis.window !== undefined && import.meta.env.MODE !== "test") {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  _auth = getAuth(app);
  _db = getFirestore(app);
  _functions = getFunctions(app);
  _analytics = getAnalytics(app);
}

export const auth = _auth;
export const db = _db;
export const functions = _functions;
export const analytics = _analytics;
