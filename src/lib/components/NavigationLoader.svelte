<script lang="ts">
	import { navigating } from "$app/stores";
</script>

{#if $navigating}
	<div class="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/20">
		<div class="h-full w-full animate-progress bg-primary"></div>
	</div>
{/if}

<style>
	@keyframes progress {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(0%);
		}
		100% {
			transform: translateX(100%);
		}
	}
	.animate-progress {
		animation: progress 1.2s ease-in-out infinite;
	}
</style>
