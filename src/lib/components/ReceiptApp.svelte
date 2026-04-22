<script lang="ts">
  import { onMount } from "svelte";
  import { getQuota, isFirebaseConfigured, type QuotaInfo, type ReceiptData, scanReceipt } from "$lib/services/receipt";

  let quota = $state<QuotaInfo | null>(null);
  let result = $state<ReceiptData | null>(null);
  let error = $state<string | null>(null);
  let scanning = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  onMount(async () => {
    if (!isFirebaseConfigured) return;
    try {
      quota = await getQuota();
    } catch {
      // quota unavailable — non-fatal
    }
  });

  async function handleFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    error = null;
    result = null;
    scanning = true;

    try {
      result = await scanReceipt(file);
      quota = await getQuota();
    } catch (err) {
      error = err instanceof Error ? err.message : "Scan failed. Please try again.";
    } finally {
      scanning = false;
    }
  }
</script>

<section class="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 sm:p-8">
	<header class="flex items-center gap-3">
		<div
			class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-base-200 text-xl font-bold text-primary"
			aria-hidden="true"
		>
			F
		</div>
		<div>
			<h1 class="text-2xl font-extrabold tracking-tight">Finclair</h1>
			<p class="text-sm text-base-content/60">Your personal financial clarity.</p>
		</div>
	</header>

	{#if !isFirebaseConfigured}
		<div class="alert alert-warning">
			<span>Firebase not configured — scanning unavailable in offline mode.</span>
		</div>
	{:else}
		{#if quota}
			<div class="stats stats-horizontal shadow">
				<div class="stat">
					<div class="stat-title">Scans remaining</div>
					<div class="stat-value text-primary">{quota.remaining}</div>
					<div class="stat-desc">{quota.used} of {quota.total} used</div>
				</div>
			</div>
		{/if}

		<div class="card bg-base-200">
			<div class="card-body items-center gap-4 text-center">
				<h2 class="card-title">Scan a receipt</h2>
				<p class="text-sm text-base-content/60">
					Upload a photo of your receipt and Finclair will extract the items and totals.
				</p>
				<input
					bind:this={fileInput}
					type="file"
					accept="image/jpeg,image/png,image/webp"
					class="hidden"
					onchange={handleFile}
				/>
				<button
					class="btn btn-primary"
					disabled={scanning || quota?.remaining === 0}
					onclick={() => fileInput?.click()}
				>
					{#if scanning}
						<span class="loading loading-spinner loading-sm"></span>
						Scanning…
					{:else}
						Upload receipt
					{/if}
				</button>
				{#if quota?.remaining === 0}
					<p class="text-sm text-error">No scans remaining. Purchase more credits to continue.</p>
				{/if}
			</div>
		</div>

		{#if error}
			<div class="alert alert-error" role="alert">
				<span>{error}</span>
			</div>
		{/if}

		{#if result}
			<div class="card bg-base-100 shadow">
				<div class="card-body gap-4">
					<div class="flex items-start justify-between">
						<div>
							<h2 class="card-title">{result.store || "Unknown store"}</h2>
							{#if result.date}
								<p class="text-sm text-base-content/60">{result.date}</p>
							{/if}
						</div>
						<span class="badge badge-primary">{result.currency}</span>
					</div>

					<div class="divider my-0"></div>

					<ul class="flex flex-col gap-1">
						{#each result.items as item (item.name)}
							<li class="flex justify-between text-sm">
								<span>{item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</span>
								<span class="font-mono">{item.price.toFixed(2)}</span>
							</li>
						{/each}
					</ul>

					<div class="divider my-0"></div>

					<div class="flex flex-col gap-1 text-sm">
						<div class="flex justify-between">
							<span class="text-base-content/70">Subtotal</span>
							<span class="font-mono">{result.subtotal.toFixed(2)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-base-content/70">Tax</span>
							<span class="font-mono">{result.tax.toFixed(2)}</span>
						</div>
						<div class="flex justify-between text-base font-bold">
							<span>Total</span>
							<span class="font-mono">{result.total.toFixed(2)}</span>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</section>
