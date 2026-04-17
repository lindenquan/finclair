import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Node 22+ has a built-in localStorage that shadows jsdom's.
// Provide a proper in-memory mock.
const store = new Map<string, string>();
const localStorageMock: Storage = {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => store.set(key, value),
	removeItem: (key: string) => store.delete(key),
	clear: () => store.clear(),
	get length() {
		return store.size;
	},
	key: (index: number) => [...store.keys()][index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// Mock Firebase so it doesn't try to initialize during tests
vi.mock("firebase/app", () => ({
	initializeApp: vi.fn(() => ({})),
	getApps: vi.fn(() => []),
	getApp: vi.fn(() => ({})),
}));

vi.mock("firebase/auth", () => ({
	getAuth: vi.fn(() => ({ currentUser: null })),
	onAuthStateChanged: vi.fn(),
	signInWithPopup: vi.fn(),
	signOut: vi.fn(),
	GoogleAuthProvider: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
	getFirestore: vi.fn(() => ({})),
}));

vi.mock("firebase/functions", () => ({
	getFunctions: vi.fn(() => ({})),
	httpsCallable: vi.fn(() => vi.fn()),
}));
