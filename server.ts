import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { auth } from "./src/lib/auth.ts";
import { db } from "./src/db/index.ts";
import * as schema from "./src/db/schema.ts";
import { eq, and, sql } from "drizzle-orm";

const fastify = Fastify({ logger: true });

// --- Plugins ---
fastify.register(cors, {
	origin: true, // En producción, especifica tus dominios
	credentials: true,
});
fastify.register(cookie);

// --- Middleware de Autenticación ---
fastify.addHook("preHandler", async (request, reply) => {
	const headers = new Headers();
	for (const [key, value] of Object.entries(request.headers)) {
		if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
	}
	const session = await auth.api.getSession({ headers });
	if (session) {
		request.user = session.user;
		request.session = session.session;
	}
});

// Extender tipos de Fastify
declare module "fastify" {
	interface FastifyRequest {
		user?: any;
		session?: any;
	}
}

// --- Rutas de Better Auth ---
fastify.all("/api/auth/*", async (request, reply) => {
	const url = `${process.env.BETTER_AUTH_URL}${request.url}`;
	const headers = new Headers();
	for (const [key, value] of Object.entries(request.headers)) {
		if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
	}
	const webRequest = new Request(url, {
		method: request.method,
		headers,
		body: ["GET", "HEAD"].includes(request.method) ? undefined : JSON.stringify(request.body),
	});
	const res = await auth.handler(webRequest);
	reply.status(res.status);
	res.headers.forEach((value, key) => {
		reply.header(key, value);
	});
	const text = await res.text();
	try {
		return reply.send(JSON.parse(text));
	} catch {
		return reply.send(text);
	}
});

// --- Rutas de Salud ---
fastify.get("/health", async () => ({ status: "ok", timestamp: new Date() }));

// --- Rutas de Perfil (Basadas en la colección) ---

fastify.get("/me", async (request, reply) => {
	if (!request.user) return reply.status(401).send({ error: "No autenticado" });

	const userRoles = await db
		.select({ role: schema.role })
		.from(schema.userRole)
		.innerJoin(schema.role, eq(schema.userRole.roleId, schema.role.id))
		.where(eq(schema.userRole.userId, request.user.id));

	return { ...request.user, roles: userRoles.map((r) => r.role) };
});

fastify.get("/me/menu", async (request, reply) => {
	if (!request.user) return reply.status(401).send({ error: "No autenticado" });

	const menu = await db
		.selectDistinct({ option: schema.option })
		.from(schema.option)
		.innerJoin(schema.roleOptionPermission, eq(schema.option.id, schema.roleOptionPermission.optionId))
		.innerJoin(schema.userRole, eq(schema.roleOptionPermission.roleId, schema.userRole.roleId))
		.where(and(eq(schema.userRole.userId, request.user.id), eq(schema.option.active, true)));

	return menu.map((r) => r.option);
});

fastify.get("/me/permissions", async (request, reply) => {
	if (!request.user) return reply.status(401).send({ error: "No autenticado" });
	const { route } = request.query as { route: string };

	const permissions = await db
		.selectDistinct({ action: schema.permission.action })
		.from(schema.permission)
		.innerJoin(schema.roleOptionPermission, eq(schema.permission.id, schema.roleOptionPermission.permissionId))
		.innerJoin(schema.option, eq(schema.roleOptionPermission.optionId, schema.option.id))
		.innerJoin(schema.userRole, eq(schema.roleOptionPermission.roleId, schema.userRole.roleId))
		.where(and(eq(schema.userRole.userId, request.user.id), eq(schema.option.route, route)));

	return permissions.map((r) => r.action);
});

// --- API de Administración (Usuarios, Roles, etc.) ---

// Usuarios
fastify.get("/api/users", async (request, reply) => {
	if (!request.user) return reply.status(401).send({ error: "No autenticado" });
	const users = await db.query.user.findMany();
	const usersWithRoles = await Promise.all(
		users.map(async (u) => {
			const roles = await db
				.select({ id: schema.role.id, name: schema.role.name })
				.from(schema.role)
				.innerJoin(schema.userRole, eq(schema.role.id, schema.userRole.roleId))
				.where(eq(schema.userRole.userId, u.id));
			return { ...u, roles };
		})
	);
	return usersWithRoles;
});

fastify.get("/api/users/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const user = await db.query.user.findFirst({ where: eq(schema.user.id, id) });
	if (!user) return reply.status(404).send({ error: "Usuario no encontrado" });
	const roles = await db
		.select({ id: schema.role.id, name: schema.role.name })
		.from(schema.role)
		.innerJoin(schema.userRole, eq(schema.role.id, schema.userRole.roleId))
		.where(eq(schema.userRole.userId, id));
	return { ...user, roles };
});

fastify.patch("/api/users/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const body = request.body as any;
	const [updated] = await db.update(schema.user).set(body).where(eq(schema.user.id, id)).returning();
	return updated;
});

fastify.delete("/api/users/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	// Eliminar registros relacionados antes de borrar el usuario
	await db.delete(schema.session).where(eq(schema.session.userId, id));
	await db.delete(schema.account).where(eq(schema.account.userId, id));
	await db.delete(schema.user).where(eq(schema.user.id, id));
	return { success: true };
});

// Roles
fastify.get("/api/roles", async () => {
	return await db.query.role.findMany();
});

fastify.post("/api/roles", async (request) => {
	const body = request.body as any;
	const [newRole] = await db.insert(schema.role).values(body).returning();
	return newRole;
});

fastify.get("/api/roles/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const role = await db.query.role.findFirst({ where: eq(schema.role.id, id) });
	if (!role) return reply.status(404).send({ error: "Rol no encontrado" });
	return role;
});

fastify.patch("/api/roles/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const body = request.body as any;
	const [updated] = await db.update(schema.role).set(body).where(eq(schema.role.id, id)).returning();
	return updated;
});

fastify.delete("/api/roles/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	await db.delete(schema.role).where(eq(schema.role.id, id));
	return { success: true };
});

// Opciones / Módulos
fastify.get("/api/options", async () => {
	return await db.query.option.findMany();
});

fastify.post("/api/options", async (request) => {
	const body = request.body as any;
	const [newOption] = await db.insert(schema.option).values(body).returning();
	return newOption;
});

fastify.get("/api/options/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const opt = await db.query.option.findFirst({ where: eq(schema.option.id, id) });
	if (!opt) return reply.status(404).send({ error: "Opción no encontrada" });
	return opt;
});

fastify.patch("/api/options/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const body = request.body as any;
	const [updated] = await db.update(schema.option).set(body).where(eq(schema.option.id, id)).returning();
	return updated;
});

fastify.delete("/api/options/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	await db.delete(schema.option).where(eq(schema.option.id, id));
	return { success: true };
});

// Permisos
fastify.get("/api/permissions", async () => {
	return await db.query.permission.findMany();
});

fastify.get("/api/permissions/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const perm = await db.query.permission.findFirst({ where: eq(schema.permission.id, id) });
	if (!perm) return reply.status(404).send({ error: "Permiso no encontrado" });
	return perm;
});

fastify.post("/api/permissions", async (request, reply) => {
	const body = request.body as any;
	const [newPerm] = await db.insert(schema.permission).values(body).returning();
	return newPerm;
});

fastify.delete("/api/permissions/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	await db.delete(schema.permission).where(eq(schema.permission.id, id));
	return { success: true };
});

// User - Roles
fastify.get("/api/users/:userId/roles", async (request) => {
	const { userId } = request.params as { userId: string };
	const result = await db
		.select({ role: schema.role })
		.from(schema.userRole)
		.innerJoin(schema.role, eq(schema.userRole.roleId, schema.role.id))
		.where(eq(schema.userRole.userId, userId));
	return result.map((r) => r.role);
});

fastify.post("/api/users/:userId/roles", async (request, reply) => {
	const { userId } = request.params as { userId: string };
	const body = request.body as { roleId?: string; roleIds?: string[] };
	const roleIds = body?.roleIds ?? (body?.roleId ? [body.roleId] : []);
	if (!roleIds.length) return reply.status(400).send({ error: "roleId o roleIds es requerido" });
	const values = roleIds.map((roleId) => ({ userId, roleId }));
	const created = await db.insert(schema.userRole).values(values).onConflictDoNothing().returning();
	return created;
});

fastify.delete("/api/users/:userId/roles/:roleId", async (request) => {
	const { userId, roleId } = request.params as { userId: string; roleId: string };
	await db.delete(schema.userRole).where(and(eq(schema.userRole.userId, userId), eq(schema.userRole.roleId, roleId)));
	return { success: true };
});


fastify.get("/api/roles/:roleId/options", async (request, reply) => {
	const { roleId } = request.params as { roleId: string };
	const result = await db
		.select({ option: schema.option, permission: schema.permission })
		.from(schema.roleOptionPermission)
		.innerJoin(schema.option, eq(schema.roleOptionPermission.optionId, schema.option.id))
		.innerJoin(schema.permission, eq(schema.roleOptionPermission.permissionId, schema.permission.id))
		.where(eq(schema.roleOptionPermission.roleId, roleId));
	return result;
});

fastify.post("/api/roles/:roleId/options", async (request, reply) => {
	const { roleId } = request.params as { roleId: string };
	const body = request.body as { optionId: string; permissionIds: string[] };
	const values = body.permissionIds.map((permissionId) => ({ roleId, optionId: body.optionId, permissionId }));
	const created = await db.insert(schema.roleOptionPermission).values(values).onConflictDoNothing().returning();
	return created;
});

fastify.delete("/api/roles/:roleId/options/:optionId/:permissionId", async (request, reply) => {
	const { roleId, optionId, permissionId } = request.params as { roleId: string; optionId: string; permissionId: string };
	await db
		.delete(schema.roleOptionPermission)
		.where(
			and(
				eq(schema.roleOptionPermission.roleId, roleId),
				eq(schema.roleOptionPermission.optionId, optionId),
				eq(schema.roleOptionPermission.permissionId, permissionId)
			)
		);
	return { success: true };
});


fastify.post("/api/seed", async (request, reply) => {
	// Crear permisos base
	const basePermissions = [
		{ name: "Lectura", action: "READ", description: "Permiso de lectura" },
		{ name: "Escritura", action: "WRITE", description: "Permiso de escritura" },
		{ name: "Actualización", action: "UPDATE", description: "Permiso de actualización" },
		{ name: "Eliminación", action: "DELETE", description: "Permiso de eliminación" },
		{ name: "Exportación", action: "EXPORT", description: "Permiso de exportación" },
	];

	for (const p of basePermissions) {
		await db.insert(schema.permission).values(p).onConflictDoNothing();
	}

	return { message: "Permisos base inicializados" };
});

// --- Inicio del Servidor ---
const start = async () => {
	try {
		const port = Number(process.env.PORT) || 3000;
		await fastify.listen({ port, host: "0.0.0.0" });
		console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
