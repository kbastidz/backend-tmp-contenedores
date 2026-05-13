import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
	schema: ["./src/db/schema.ts", "./src/db/schema-trm.ts"],
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
	schemaFilter: ["public", "trm"],
});
