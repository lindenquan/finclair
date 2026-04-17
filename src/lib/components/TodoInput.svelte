<script lang="ts">
import { todoStore } from "$lib/stores/todos.svelte";

let newTodo = $state("");

function handleSubmit(e: SubmitEvent) {
	e.preventDefault();
	todoStore.add(newTodo);
	newTodo = "";
}
</script>

<form class="mb-4 flex gap-2" onsubmit={handleSubmit}>
	<input
		type="text"
		class="input input-bordered flex-1"
		bind:value={newTodo}
		placeholder="What needs to be done?"
		aria-label="New todo"
	/>
	<button type="submit" class="btn btn-primary" disabled={!newTodo.trim()}>Add</button>
</form>
