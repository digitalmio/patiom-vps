import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		server: {
			deps: {
				// Keep a single `graphql` instance shared by the test files and the
				// server libraries (yoga/apollo/mercurius/envelop). Without this,
				// externalization loads a second copy -> "from another module or
				// realm" schema errors. Inline everything to cover transitive
				// graphql consumers (@graphql-tools/*, @whatwg-node/*, ...).
				inline: [/.*/],
			},
		},
	},
});
