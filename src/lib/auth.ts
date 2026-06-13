import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.ts";
import * as schema from "../db/schema.ts";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification,
		},
	}),
	trustedOrigins: [
		"http://localhost:3000",
		"http://localhost:3001",
		...(process.env.APP_URL ? [process.env.APP_URL] : []),
		// Soporta múltiples frontends separados por coma: "https://a.com,https://b.com"
		...(process.env.FRONTEND_URL
			? process.env.FRONTEND_URL.split(",").map((u) => u.trim())
			: []),
	],
	emailAndPassword: {
		enabled: true,
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
		},
	},
	// Configuración de cookies para entornos de producción/desarrollo
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // 5 minutos
		},
	},
});
