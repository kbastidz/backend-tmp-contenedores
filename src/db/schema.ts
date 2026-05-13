import { pgTable, text, timestamp, boolean, primaryKey, integer, uuid } from "drizzle-orm/pg-core";

// --- Tablas Requeridas por Better Auth ---

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("emailVerified").notNull(),
	image: text("image"),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expiresAt").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
	ipAddress: text("ipAddress"),
	userAgent: text("userAgent"),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
	refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expiresAt").notNull(),
	createdAt: timestamp("createdAt"),
	updatedAt: timestamp("updatedAt"),
});

// --- Tablas de Administración de Usuarios (RBAC) ---

export const role = pgTable("role", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull().unique(),
	description: text("description"),
	active: boolean("active").default(true),
	createdAt: timestamp("createdAt").defaultNow(),
});

export const option = pgTable("option", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	route: text("route").notNull().unique(),
	icon: text("icon"),
	module: text("module"),
	description: text("description"),
	active: boolean("active").default(true),
});

export const permission = pgTable("permission", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(), // Ej: "Lectura"
	action: text("action").notNull().unique(), // Ej: "READ"
	description: text("description"),
});

export const userRole = pgTable("user_role", {
	userId: text("userId").notNull().references(() => user.id, { onDelete: 'cascade' }),
	roleId: uuid("roleId").notNull().references(() => role.id, { onDelete: 'cascade' }),
}, (table) => ({
	pk: primaryKey({ columns: [table.userId, table.roleId] }),
}));

export const roleOptionPermission = pgTable("role_option_permission", {
	roleId: uuid("roleId").notNull().references(() => role.id, { onDelete: 'cascade' }),
	optionId: uuid("optionId").notNull().references(() => option.id, { onDelete: 'cascade' }),
	permissionId: uuid("permissionId").notNull().references(() => permission.id, { onDelete: 'cascade' }),
}, (table) => ({
	pk: primaryKey({ columns: [table.roleId, table.optionId, table.permissionId] }),
}));
