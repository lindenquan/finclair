<script lang="ts">
import type { Todo } from "$lib/stores/todos.svelte";
import { todoStore } from "$lib/stores/todos.svelte";

let { todo }: { todo: Todo } = $props();
</script>

<li class="flex items-center gap-3 rounded-lg bg-base-200 px-4 py-3" class:opacity-50={todo.completed}>
	<label class="flex flex-1 cursor-pointer items-center gap-3 min-w-0">
		<input
			type="checkbox"
			class="checkbox checkbox-primary checkbox-sm"
			checked={todo.completed}
			onchange={() => todoStore.toggle(todo.id)}
			aria-label={todo.completed ? `Mark "${todo.text}" incomplete` : `Mark "${todo.text}" complete`}
		/>
		<span class="truncate" class:line-through={todo.completed} class:opacity-50={todo.completed}>
			{todo.text}
		</span>
	</label>
	<button
		class="btn btn-ghost btn-xs text-error"
		onclick={() => todoStore.remove(todo.id)}
		aria-label={`Remove "${todo.text}"`}
	>
		✕
	</button>
</li>
