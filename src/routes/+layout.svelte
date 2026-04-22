<script lang="ts">
import { onMount } from "svelte";
import "../app.css";
import LoginPage from "$lib/components/LoginPage.svelte";
import NavigationLoader from "$lib/components/NavigationLoader.svelte";
import { authStore, initAuth } from "$lib/stores/auth.svelte";

let { children } = $props();

onMount(() => {
	initAuth();
});
</script>

<svelte:head>
	<title>Finclair</title>
</svelte:head>

<NavigationLoader />

{#if !authStore.ready}
	<div class="flex min-h-dvh items-center justify-center">
		<span class="loading loading-spinner loading-lg text-primary"></span>
	</div>
{:else if authStore.isLoggedIn}
	<div class="navbar bg-base-200 px-4">
		<div class="flex-1">
			<span class="text-lg font-bold">Finclair</span>
		</div>
		{#if !authStore.offlineMode}
			<div class="flex-none gap-2">
				<span class="text-sm text-base-content/60">{authStore.user?.email}</span>
				<div class="avatar">
					<div class="w-8 rounded-full">
						<img src={authStore.user?.picture} alt={authStore.user?.name} referrerpolicy="no-referrer" />
					</div>
				</div>
				<button class="btn btn-ghost btn-sm" onclick={() => authStore.logout()}>Sign out</button>
			</div>
		{/if}
	</div>
	{@render children()}
{:else}
	<LoginPage />
{/if}
