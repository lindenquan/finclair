import {
	type User as FirebaseUser,
	GoogleAuthProvider,
	onAuthStateChanged,
	signInWithPopup,
	signOut,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "$lib/firebase";

export interface User {
	id: string;
	name: string;
	email: string;
	picture: string;
}

function mapUser(fbUser: FirebaseUser): User {
	return {
		id: fbUser.uid,
		name: fbUser.displayName ?? "",
		email: fbUser.email ?? "",
		picture: fbUser.photoURL ?? "",
	};
}

function createAuthStore() {
	let user = $state<User | null>(null);
	let loading = $state(!isFirebaseConfigured);
	let ready = $state(!isFirebaseConfigured);
	const offlineMode = !isFirebaseConfigured;

	if (auth) {
		loading = true;
		ready = false;
		onAuthStateChanged(auth, (fbUser) => {
			user = fbUser ? mapUser(fbUser) : null;
			loading = false;
			ready = true;
		});
	}

	return {
		get user() {
			return user;
		},
		get isLoggedIn() {
			return offlineMode || user !== null;
		},
		get loading() {
			return loading;
		},
		get ready() {
			return offlineMode || ready;
		},
		get offlineMode() {
			return offlineMode;
		},

		async login() {
			if (!auth) return;
			loading = true;
			try {
				const provider = new GoogleAuthProvider();
				await signInWithPopup(auth, provider);
			} catch {
				loading = false;
			}
		},

		async logout() {
			if (!auth) return;
			await signOut(auth);
		},

		async getIdToken(): Promise<string | null> {
			return auth?.currentUser?.getIdToken() ?? null;
		},
	};
}

export const authStore = createAuthStore();
