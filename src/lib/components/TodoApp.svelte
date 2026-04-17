<script lang="ts">
import { todoStore } from "$lib/stores/todos.svelte";
import TodoInput from "./TodoInput.svelte";
import TodoItem from "./TodoItem.svelte";

type Filter = "all" | "active" | "completed";
let filter = $state<Filter>("all");

const filtered = $derived(
	filter === "all"
		? todoStore.items
		: filter === "active"
			? todoStore.items.filter((t) => !t.completed)
			: todoStore.items.filter((t) => t.completed),
);
</script>

<section class="mx-auto flex min-h-dvh w-full max-w-xl flex-col p-4 sm:p-8">
	<header class="mb-6 flex items-center gap-3">
		<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-base-200 text-xl font-bold text-primary" aria-hidden="true">F</div>
		<div>
			<h1 class="text-2xl font-extrabold tracking-tight">Finclair</h1>
			<p class="text-sm text-base-content/60">Your personal financial clarity.</p>
		</div>
	</header>

	<TodoInput />

	{#if todoStore.total > 0}
		<div class="tabs tabs-boxed mb-4" role="navigation" aria-label="Filter todos">
			<button class="tab" class:tab-active={filter === 'all'} onclick={() => (filter = 'all')}>
				All <span class="badge badge-sm ml-1">{todoStore.total}</span>
			</button>
			<button class="tab" class:tab-active={filter === 'active'} onclick={() => (filter = 'active')}>
				Active <span class="badge badge-sm ml-1">{todoStore.remaining}</span>
			</button>
			<button class="tab" class:tab-active={filter === 'completed'} onclick={() => (filter = 'completed')}>
				Done <span class="badge badge-sm ml-1">{todoStore.completed}</span>
			</button>
		</div>
	{/if}

	<ul class="flex flex-col gap-1" aria-label="Todo list">
		{#each filtered as todo (todo.id)}
			<TodoItem {todo} />
		{/each}
	</ul>

	{#if filtered.length === 0}
		<p class="py-12 text-center text-sm text-base-content/50">
			{#if filter === 'all'}
				No tasks yet. Add one above.
			{:else if filter === 'active'}
				All tasks completed!
			{:else}
				No completed tasks.
			{/if}
		</p>
	{/if}

	{#if todoStore.completed > 0}
		<footer class="mt-6 text-center">
			<button class="btn btn-outline btn-error btn-sm" onclick={() => todoStore.clearCompleted()}>
				Clear completed ({todoStore.completed})
			</button>
		</footer>
	{/if}
</section>
