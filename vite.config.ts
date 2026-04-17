import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), svelteTesting()],
	server: {
		port: 3000,
	},
	preview: {
		port: 5000,
	},
	test: {
		include: ["src/**/*.test.ts"],
		environment: "jsdom",
		setupFiles: ["src/tests/setup.ts"],
	},
});
