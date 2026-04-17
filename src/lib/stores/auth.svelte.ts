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
	let googleAccessToken = $state<string | null>(null);
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
		get accessToken() {
			return googleAccessToken;
		},

		async login() {
			if (!auth) return;
			loading = true;
			try {
				const provider = new GoogleAuthProvider();
				provider.addScope("https://www.googleapis.com/auth/drive.file");
				const result = await signInWithPopup(auth, provider);
				const credential = GoogleAuthProvider.credentialFromResult(result);
				googleAccessToken = credential?.accessToken ?? null;
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
