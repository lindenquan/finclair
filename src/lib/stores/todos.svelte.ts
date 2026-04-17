export interface Todo {
	id: string;
	text: string;
	completed: boolean;
	createdAt: number;
}

const STORAGE_KEY = "finclair-todos";

function loadTodos(): Todo[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as Todo[];
	} catch {
		return [];
	}
}

function saveTodos(todos: Todo[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
	} catch {
		// localStorage not available
	}
}

function createTodoStore() {
	let todos = $state<Todo[]>(loadTodos());

	function persist() {
		saveTodos(todos);
	}

	return {
		get items() {
			return todos;
		},
		get total() {
			return todos.length;
		},
		get completed() {
			return todos.filter((t) => t.completed).length;
		},
		get remaining() {
			return todos.filter((t) => !t.completed).length;
		},
		add(text: string) {
			const trimmed = text.trim();
			if (!trimmed) return;
			todos = [
				{
					id: crypto.randomUUID(),
					text: trimmed,
					completed: false,
					createdAt: Date.now(),
				},
				...todos,
			];
			persist();
		},
		remove(id: string) {
			todos = todos.filter((t) => t.id !== id);
			persist();
		},
		toggle(id: string) {
			todos = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
			persist();
		},
		clearCompleted() {
			todos = todos.filter((t) => !t.completed);
			persist();
		},
	};
}

export const todoStore = createTodoStore();
