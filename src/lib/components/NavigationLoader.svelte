<script lang="ts">
	import { navigating } from "$app/stores";

	const DELAY_MS = 300;
	let showLoader = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if ($navigating) {
			timer = setTimeout(() => {
				showLoader = true;
			}, DELAY_MS);
		} else {
			if (timer) clearTimeout(timer);
			timer = null;
			showLoader = false;
		}
	});
</script>

{#if showLoader}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-base-100/80 backdrop-blur-sm">
		<span class="loading loading-spinner loading-lg text-primary"></span>
	</div>
{/if}
