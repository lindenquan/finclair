import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import TodoInput from "$lib/components/TodoInput.svelte";

describe("TodoInput", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("renders input and add button", () => {
		render(TodoInput);
		expect(screen.getByPlaceholderText("What needs to be done?")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
	});

	it("disables add button when input is empty", () => {
		render(TodoInput);
		expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
	});

	it("enables add button when input has text", async () => {
		render(TodoInput);
		const input = screen.getByPlaceholderText("What needs to be done?");
		await fireEvent.input(input, { target: { value: "Buy groceries" } });
		expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
	});
});
