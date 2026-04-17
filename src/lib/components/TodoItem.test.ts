import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import TodoItem from "$lib/components/TodoItem.svelte";

describe("TodoItem", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("renders todo text", () => {
		render(TodoItem, {
			props: {
				todo: { id: "1", text: "Test task", completed: false, createdAt: Date.now() },
			},
		});
		expect(screen.getByText("Test task")).toBeInTheDocument();
	});

	it("renders checkbox unchecked for active todo", () => {
		render(TodoItem, {
			props: {
				todo: { id: "1", text: "Test task", completed: false, createdAt: Date.now() },
			},
		});
		const checkbox = screen.getByRole("checkbox");
		expect(checkbox).not.toBeChecked();
	});

	it("renders checkbox checked for completed todo", () => {
		render(TodoItem, {
			props: {
				todo: { id: "1", text: "Done task", completed: true, createdAt: Date.now() },
			},
		});
		const checkbox = screen.getByRole("checkbox");
		expect(checkbox).toBeChecked();
	});

	it("renders remove button", () => {
		render(TodoItem, {
			props: {
				todo: { id: "1", text: "Test task", completed: false, createdAt: Date.now() },
			},
		});
		expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
	});
});
