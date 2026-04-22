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

let user = $state<User | null>(null);
let loading = $state(!isFirebaseConfigured);
let ready = $state(!isFirebaseConfigured);
let googleAccessToken = $state<string | null>(null);
let manualOffline = $state(false);
let loginError = $state<string | null>(null);

let unsubscribe: (() => void) | null = null;

export function initAuth() {
  if (!auth || unsubscribe) return;
  loading = true;
  ready = false;
  unsubscribe = onAuthStateChanged(auth, (fbUser) => {
    user = fbUser ? mapUser(fbUser) : null;
    loading = false;
    ready = true;
  });
}

export function destroyAuth() {
  unsubscribe?.();
  unsubscribe = null;
}

export const authStore = {
  get user() {
    return user;
  },
  get isLoggedIn() {
    return manualOffline || !isFirebaseConfigured || user !== null;
  },
  get loading() {
    return loading;
  },
  get ready() {
    return manualOffline || !isFirebaseConfigured || ready;
  },
  get offlineMode() {
    return manualOffline || !isFirebaseConfigured;
  },
  get accessToken() {
    return googleAccessToken;
  },
  get loginError() {
    return loginError;
  },

  async login() {
    if (!auth) return;
    loading = true;
    loginError = null;
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/drive.file");
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      googleAccessToken = credential?.accessToken ?? null;
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
        loginError = "popup-blocked";
      } else if (code === "auth/network-request-failed" || code === "auth/internal-error") {
        loginError = "cookie-blocked";
      } else {
        loginError = "unknown";
      }
      loading = false;
    }
  },

  async logout() {
    if (manualOffline) {
      manualOffline = false;
      return;
    }
    if (!auth) return;
    await signOut(auth);
  },

  enterOfflineMode() {
    manualOffline = true;
  },

  async getIdToken(): Promise<string | null> {
    return auth?.currentUser?.getIdToken() ?? null;
  },
};
