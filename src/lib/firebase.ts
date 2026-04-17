import { type Analytics, getAnalytics } from "firebase/analytics";
import { type FirebaseApp, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";
import { type Functions, getFunctions } from "firebase/functions";

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
	appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _functions: Functions | null = null;
let _analytics: Analytics | null = null;

if (isFirebaseConfigured) {
	app = initializeApp(firebaseConfig);
	_auth = getAuth(app);
	_db = getFirestore(app);
	_functions = getFunctions(app);
	_analytics = getAnalytics(app);
}

export const auth = _auth;
export const db = _db;
export const functions = _functions;
export const analytics = _analytics;
