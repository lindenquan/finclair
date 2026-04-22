<script lang="ts">
  import { authStore } from "$lib/stores/auth.svelte";

  let activeTab = $state<"google" | "offline">("google");
</script>

<main class="flex min-h-dvh items-center justify-center p-4">
  <div class="card w-full max-w-sm bg-base-200 shadow-xl">
    <div class="card-body items-center text-center">
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl bg-base-300 text-3xl font-bold text-primary"
        aria-hidden="true"
      >
        F
      </div>
      <h1 class="card-title text-2xl font-extrabold">Finclair</h1>
      <p class="text-sm text-base-content/60">Your personal financial clarity.</p>

      <!-- Prominent tab toggle -->
      <div class="mt-5 flex w-full gap-2">
        <button
          class="btn flex-1"
          class:btn-primary={activeTab === "google"}
          class:btn-ghost={activeTab !== "google"}
          onclick={() => (activeTab = "google")}
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google
        </button>
        <button
          class="btn flex-1"
          class:btn-neutral={activeTab === "offline"}
          class:btn-ghost={activeTab !== "offline"}
          onclick={() => (activeTab = "offline")}
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
          </svg>
          No Login
        </button>
      </div>

      {#if activeTab === "google"}
        <p class="mt-3 text-xs text-base-content/40">
          Sign in with Google to sync your data to your Google Drive, use AI receipt scanning, and
          back up everything securely.
        </p>

        {#if authStore.loginError === "popup-blocked"}
          <div role="alert" class="alert alert-warning mt-2 text-left text-xs">
            <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
            <span>Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.</span>
          </div>
        {/if}

        {#if authStore.loginError === "cookie-blocked" || authStore.loginError === "unknown"}
          <div role="alert" class="alert alert-warning mt-2 text-left text-xs">
            <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
            <span>Sign-in failed. Please allow third-party cookies in your browser settings and try again.</span>
          </div>
        {/if}

        <div class="card-actions mt-4 w-full">
          <button
            class="btn btn-primary w-full gap-2"
            onclick={() => authStore.login()}
            disabled={authStore.loading}
          >
            {#if authStore.loading}
              <span class="loading loading-spinner loading-sm"></span>
              Signing in…
            {:else}
              Sign in with Google
            {/if}
          </button>
        </div>
      {:else}
        <div class="mt-3 space-y-2 text-left text-sm text-base-content/60">
          <p>Use Finclair without an account. Keep in mind:</p>
          <ul class="list-inside list-disc space-y-1 text-xs">
            <li>No server backup — data can be lost if you clear your browser</li>
            <li>No AI-assisted receipt scanning</li>
            <li>All data stays local on this device only</li>
            <li>Zero connection with Google Drive or any server</li>
          </ul>
        </div>
        <div class="card-actions mt-4 w-full">
          <button
            class="btn btn-neutral w-full"
            onclick={() => authStore.enterOfflineMode()}
          >
            Continue without login
          </button>
        </div>
      {/if}
    </div>
  </div>
</main>
