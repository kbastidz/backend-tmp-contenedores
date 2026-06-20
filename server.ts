import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { auth } from "./src/lib/auth.ts";
import { db } from "./src/db/index.ts";
import * as schema from "./src/db/schema.ts";
import * as trm from "./src/db/schema-trm.ts";
import { user } from "./src/db/schema.ts";
import { eq, and, sql, desc, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { trmLogger } from "./src/lib/trm-logger.ts";

const fastify = Fastify({ logger: true });

// ── Request timing storage ────────────────────────────────────
const requestStartTimes = new WeakMap<object, number>();

// --- Plugins ---
fastify.register(cors, {
	origin: (origin, cb) => {
		const allowed = [
			"http://localhost:3000",
			"http://localhost:3001",
			...(process.env.FRONTEND_URL
				? process.env.FRONTEND_URL.split(",").map((u) => u.trim())
				: []),
		];
		if (!origin || allowed.includes(origin)) {
			cb(null, true);
		} else {
			cb(new Error("Not allowed by CORS"), false);
		}
	},
	credentials: true,
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
});
fastify.register(cookie);

// Allow DELETE (and other methods) to send Content-Type: application/json with an empty body
fastify.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
	if (!body || (body as string).trim() === "") {
		done(null, undefined);
	} else {
		try {
			done(null, JSON.parse(body as string));
		} catch (err: any) {
			err.statusCode = 400;
			done(err, undefined);
		}
	}
});

// ── Hooks de logging ──────────────────────────────────────────
fastify.addHook("onRequest", async (request) => {
	requestStartTimes.set(request, Date.now());
});

fastify.addHook("onResponse", async (request, reply) => {
	const start = requestStartTimes.get(request) ?? Date.now();
	const durationMs = Date.now() - start;
	const level = reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 ? "warn" : "info";
	trmLogger[level](`${request.method} ${request.url}`, {
		service: "server",
		method: request.method,
		path: request.url,
		statusCode: reply.statusCode,
		durationMs,
	});
});

// --- Middleware de Autenticación ---
fastify.addHook("preHandler", async (request, reply) => {
	const headers = new Headers();
	for (const [key, value] of Object.entries(request.headers)) {
		if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
	}

	// Soporte para clientes cross-site (ej. GitHub Pages) que no pueden enviar cookies.
	// Si viene un Bearer token en Authorization, lo buscamos directamente en la BD
	// porque el token del body del sign-in es el campo `session.token`, no el valor
	// completo de la cookie (que incluye la firma HMAC y no está disponible en el cliente).
	const authHeader = request.headers["authorization"];
	if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
		const token = authHeader.slice(7).trim();
		if (token) {
			const sessionRows = await db
				.select()
				.from(schema.session)
				.where(eq(schema.session.token, token))
				.limit(1);
			if (sessionRows.length > 0) {
				const session = sessionRows[0];
				const now = new Date();
				if (new Date(session.expiresAt) > now) {
					const userRows = await db
						.select()
						.from(schema.user)
						.where(eq(schema.user.id, session.userId))
						.limit(1);
					if (userRows.length > 0) {
						request.user = userRows[0];
						request.session = session;
						return; // Autenticado, saltar el resto del preHandler
					}
				}
			}
		}
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

const requireAuth = (request: any, reply: any) => {
	if (!request.user) { reply.status(401).send({ error: "No autenticado" }); return false; }
	return true;
};

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

// --- Rutas de Perfil ---
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

// --- API de Administración ---

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
	const u = await db.query.user.findFirst({ where: eq(schema.user.id, id) });
	if (!u) return reply.status(404).send({ error: "Usuario no encontrado" });
	const roles = await db
		.select({ id: schema.role.id, name: schema.role.name })
		.from(schema.role)
		.innerJoin(schema.userRole, eq(schema.role.id, schema.userRole.roleId))
		.where(eq(schema.userRole.userId, id));
	return { ...u, roles };
});

fastify.patch("/api/users/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const body = request.body as any;
	const [updated] = await db.update(schema.user).set(body).where(eq(schema.user.id, id)).returning();
	return updated;
});

fastify.delete("/api/users/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	await db.delete(schema.session).where(eq(schema.session.userId, id));
	await db.delete(schema.account).where(eq(schema.account.userId, id));
	await db.delete(schema.user).where(eq(schema.user.id, id));
	return { success: true };
});

// Roles
fastify.get("/api/roles", async () => await db.query.role.findMany());

fastify.post("/api/roles", async (request) => {
	const [newRole] = await db.insert(schema.role).values(request.body as any).returning();
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
	const [updated] = await db.update(schema.role).set(request.body as any).where(eq(schema.role.id, id)).returning();
	return updated;
});

fastify.delete("/api/roles/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	await db.delete(schema.role).where(eq(schema.role.id, id));
	return { success: true };
});

// Opciones
fastify.get("/api/options", async () => await db.query.option.findMany());

fastify.post("/api/options", async (request) => {
	const [newOption] = await db.insert(schema.option).values(request.body as any).returning();
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
	const [updated] = await db.update(schema.option).set(request.body as any).where(eq(schema.option.id, id)).returning();
	return updated;
});

fastify.delete("/api/options/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	await db.delete(schema.option).where(eq(schema.option.id, id));
	return { success: true };
});

// Permisos
fastify.get("/api/permissions", async () => await db.query.permission.findMany());

fastify.get("/api/permissions/:id", async (request, reply) => {
	const { id } = request.params as { id: string };
	const perm = await db.query.permission.findFirst({ where: eq(schema.permission.id, id) });
	if (!perm) return reply.status(404).send({ error: "Permiso no encontrado" });
	return perm;
});

fastify.post("/api/permissions", async (request) => {
	const [newPerm] = await db.insert(schema.permission).values(request.body as any).returning();
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

fastify.get("/api/roles/:roleId/options", async (request) => {
	const { roleId } = request.params as { roleId: string };
	const result = await db
		.select({ option: schema.option, permission: schema.permission })
		.from(schema.roleOptionPermission)
		.innerJoin(schema.option, eq(schema.roleOptionPermission.optionId, schema.option.id))
		.innerJoin(schema.permission, eq(schema.roleOptionPermission.permissionId, schema.permission.id))
		.where(eq(schema.roleOptionPermission.roleId, roleId));
	return result;
});

fastify.post("/api/roles/:roleId/options", async (request) => {
	const { roleId } = request.params as { roleId: string };
	const body = request.body as { optionId: string; permissionIds: string[] };
	const values = body.permissionIds.map((permissionId) => ({ roleId, optionId: body.optionId, permissionId }));
	const created = await db.insert(schema.roleOptionPermission).values(values).onConflictDoNothing().returning();
	return created;
});

fastify.delete("/api/roles/:roleId/options/:optionId/:permissionId", async (request) => {
	const { roleId, optionId, permissionId } = request.params as { roleId: string; optionId: string; permissionId: string };
	await db.delete(schema.roleOptionPermission).where(
		and(
			eq(schema.roleOptionPermission.roleId, roleId),
			eq(schema.roleOptionPermission.optionId, optionId),
			eq(schema.roleOptionPermission.permissionId, permissionId)
		)
	);
	return { success: true };
});

fastify.post("/api/seed", async () => {
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

// ============================================================
//  TRM — TERMINALES
// ============================================================
fastify.get("/api/trm/terminales", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	return db.select().from(trm.terminal).orderBy(trm.terminal.nombre);
});

fastify.post("/api/trm/terminales", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.terminal).values(req.body as any).returning();
	return row;
});

fastify.get("/api/trm/terminales/:id", async (req, rep) => {
	const { id } = req.params as { id: string };
	const row = await db.select().from(trm.terminal).where(eq(trm.terminal.id, id)).limit(1);
	if (!row.length) return rep.status(404).send({ error: "Terminal no encontrada" });
	return row[0];
});

fastify.patch("/api/trm/terminales/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.terminal).set(req.body as any).where(eq(trm.terminal.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/terminales/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.terminal).where(eq(trm.terminal.id, id));
	return { success: true };
});

// ============================================================
//  TRM — ÁREAS
// ============================================================
fastify.get("/api/trm/areas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id?: string };
	const query = db.select().from(trm.areas);
	return terminal_id ? query.where(eq(trm.areas.terminal_id, terminal_id)) : query;
});

fastify.post("/api/trm/areas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.areas).values(req.body as any).returning();
	return row;
});

fastify.patch("/api/trm/areas/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.areas).set(req.body as any).where(eq(trm.areas.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/areas/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.areas).where(eq(trm.areas.id, id));
	return { success: true };
});

// ============================================================
//  TRM — EQUIPOS
// ============================================================
fastify.get("/api/trm/equipos", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id, area_id } = req.query as { terminal_id?: string; area_id?: string };
	let query = db.select().from(trm.equipos).orderBy(trm.equipos.nombre) as any;
	if (terminal_id) query = query.where(eq(trm.equipos.terminal_id, terminal_id));
	if (area_id) query = query.where(eq(trm.equipos.area_id, area_id));
	return query;
});

fastify.post("/api/trm/equipos", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.equipos).values(req.body as any).returning();
	return row;
});

fastify.get("/api/trm/equipos/:id", async (req, rep) => {
	const { id } = req.params as { id: string };
	const row = await db.select().from(trm.equipos).where(eq(trm.equipos.id, id)).limit(1);
	if (!row.length) return rep.status(404).send({ error: "Equipo no encontrado" });
	return row[0];
});

fastify.patch("/api/trm/equipos/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const body = { ...(req.body as any), actualizado_en: new Date() };
	const [row] = await db.update(trm.equipos).set(body).where(eq(trm.equipos.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/equipos/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.equipos).where(eq(trm.equipos.id, id));
	return { success: true };
});

// ============================================================
//  TRM — RIESGOS
// ============================================================
fastify.get("/api/trm/riesgos", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id?: string };
	const responsableUser = alias(user, "responsable_user");
	const conditions: any[] = [];
	if (terminal_id) conditions.push(eq(trm.riesgos.terminal_id, terminal_id));
	const tienePlanSubquery = sql`(SELECT COUNT(*) FROM ${trm.planesMitigacion} WHERE ${trm.planesMitigacion.riesgo_id} = ${trm.riesgos.id}) > 0`;
	const rows = await db.select({
		...getTableColumns(trm.riesgos),
		responsable_nombre: responsableUser.name,
		area_nombre: trm.areas.nombre,
		terminal_nombre: trm.terminal.nombre,
		tiene_plan: tienePlanSubquery,
	})
		.from(trm.riesgos)
		.leftJoin(responsableUser, eq(trm.riesgos.responsable_id, responsableUser.id))
		.leftJoin(trm.areas, eq(trm.riesgos.area_id, trm.areas.id))
		.leftJoin(trm.terminal, eq(trm.riesgos.terminal_id, trm.terminal.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(trm.riesgos.creado_en));
	return rep.send(rows);
});

fastify.post("/api/trm/riesgos", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const body = req.body as any;
	if (body.terminal_id === "") body.terminal_id = null;
	if (body.area_id === "") body.area_id = null;
	if (body.responsable_id === "") body.responsable_id = null;
	if (body.probabilidad && body.impacto) body.score = body.probabilidad * body.impacto;
	const [row] = await db.insert(trm.riesgos).values(body).returning();
	return row;
});

fastify.get("/api/trm/riesgos/:id", async (req, rep) => {
	const { id } = req.params as { id: string };
	const row = await db.select().from(trm.riesgos).where(eq(trm.riesgos.id, id)).limit(1);
	if (!row.length) return rep.status(404).send({ error: "Riesgo no encontrado" });
	const planes = await db.select().from(trm.planesMitigacion).where(eq(trm.planesMitigacion.riesgo_id, id));
	const controles = await db.select({
		id: trm.riesgosControles.id,
		riesgo_id: trm.riesgosControles.riesgo_id,
		control_id: trm.riesgosControles.control_id,
		efectivo: trm.riesgosControles.efectivo,
		observaciones: trm.riesgosControles.observaciones,
		evaluado_en: trm.riesgosControles.evaluado_en,
		control_nombre: trm.controles.nombre,
	})
		.from(trm.riesgosControles)
		.innerJoin(trm.controles, eq(trm.riesgosControles.control_id, trm.controles.id))
		.where(eq(trm.riesgosControles.riesgo_id, id));
	const historial = await db.select().from(trm.riesgosEstadosHistorial)
		.where(eq(trm.riesgosEstadosHistorial.riesgo_id, id))
		.orderBy(desc(trm.riesgosEstadosHistorial.creado_en));
	return { ...row[0], planes, controles, historial };
});

fastify.patch("/api/trm/riesgos/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const body = req.body as any;
	const [current] = await db.select().from(trm.riesgos).where(eq(trm.riesgos.id, id)).limit(1);
	if (!current) return rep.status(404).send({ error: "Riesgo no encontrado" });
	if (body.estado && body.estado !== current.estado) {
		await db.insert(trm.riesgosEstadosHistorial).values({
			riesgo_id: id,
			estado_anterior: current.estado,
			estado_nuevo: body.estado,
			justificacion: body.justificacion_cambio_estado,
			cambiado_por: req.user?.id,
			nombre_usuario: req.user?.name,
		});
	}
	if (body.probabilidad && body.impacto) body.score = body.probabilidad * body.impacto;
	body.actualizado_en = new Date();
	const [row] = await db.update(trm.riesgos).set(body).where(eq(trm.riesgos.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/riesgos/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.riesgos).where(eq(trm.riesgos.id, id));
	return { success: true };
});

fastify.get("/api/trm/riesgos/:id/historial", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	return db.select().from(trm.riesgosEstadosHistorial)
		.where(eq(trm.riesgosEstadosHistorial.riesgo_id, id))
		.orderBy(desc(trm.riesgosEstadosHistorial.creado_en));
});

// ============================================================
//  TRM — INCIDENTES
// ============================================================
fastify.get("/api/trm/incidentes", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id?: string };
	const responsableUser = alias(user, "responsable_user");
	const conditions: any[] = [];
	if (terminal_id) conditions.push(eq(trm.incidentes.terminal_id, terminal_id));
	const rows = await db.select({
		...getTableColumns(trm.incidentes),
		responsable_nombre: responsableUser.name,
		area_nombre: trm.areas.nombre,
		terminal_nombre: trm.terminal.nombre,
		equipo_nombre: trm.equipos.nombre,
	})
		.from(trm.incidentes)
		.leftJoin(responsableUser, eq(trm.incidentes.responsable_id, responsableUser.id))
		.leftJoin(trm.areas, eq(trm.incidentes.area_id, trm.areas.id))
		.leftJoin(trm.terminal, eq(trm.incidentes.terminal_id, trm.terminal.id))
		.leftJoin(trm.equipos, eq(trm.incidentes.equipo_id, trm.equipos.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(trm.incidentes.creado_en));
	return rep.send(rows);
});

fastify.post("/api/trm/incidentes", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.incidentes).values(req.body as any).returning();
	return row;
});

fastify.get("/api/trm/incidentes/:id", async (req, rep) => {
	const { id } = req.params as { id: string };
	const row = await db.select().from(trm.incidentes).where(eq(trm.incidentes.id, id)).limit(1);
	if (!row.length) return rep.status(404).send({ error: "Incidente no encontrado" });
	const historial = await db.select().from(trm.incidentesEstadosHistorial)
		.where(eq(trm.incidentesEstadosHistorial.incidente_id, id))
		.orderBy(desc(trm.incidentesEstadosHistorial.creado_en));
	return { ...row[0], historial };
});

fastify.patch("/api/trm/incidentes/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const body = req.body as any;
	const [current] = await db.select().from(trm.incidentes).where(eq(trm.incidentes.id, id)).limit(1);
	if (!current) return rep.status(404).send({ error: "Incidente no encontrado" });
	if (body.estado && body.estado !== current.estado) {
		await db.insert(trm.incidentesEstadosHistorial).values({
			incidente_id: id,
			estado_anterior: current.estado,
			estado_nuevo: body.estado,
			justificacion: body.justificacion_cambio_estado,
			cambiado_por: req.user?.id,
			nombre_usuario: req.user?.name,
		});
	}
	const [row] = await db.update(trm.incidentes).set({ ...body, actualizado_en: new Date() }).where(eq(trm.incidentes.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/incidentes/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.incidentes).where(eq(trm.incidentes.id, id));
	return { success: true };
});

fastify.get("/api/trm/incidentes/:id/historial", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	return db.select().from(trm.incidentesEstadosHistorial)
		.where(eq(trm.incidentesEstadosHistorial.incidente_id, id))
		.orderBy(desc(trm.incidentesEstadosHistorial.creado_en));
});

// ============================================================
//  TRM — PLANES DE MITIGACIÓN
// ============================================================
fastify.get("/api/trm/planes", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id, riesgo_id, estado } = req.query as { terminal_id?: string; riesgo_id?: string; estado?: string };
	const responsableUser = alias(user, "responsable_user");
	const conditions: any[] = [];
	if (terminal_id) conditions.push(eq(trm.planesMitigacion.terminal_id, terminal_id));
	if (riesgo_id) conditions.push(eq(trm.planesMitigacion.riesgo_id, riesgo_id));
	if (estado) conditions.push(eq(trm.planesMitigacion.estado, estado));
	const rows = await db.select({
		...getTableColumns(trm.planesMitigacion),
		responsable_nombre: responsableUser.name,
		area_nombre: trm.areas.nombre,
		riesgo_codigo: trm.riesgos.codigo,
		riesgo_nombre: trm.riesgos.nombre,
	})
		.from(trm.planesMitigacion)
		.leftJoin(responsableUser, eq(trm.planesMitigacion.responsable_id, responsableUser.id))
		.leftJoin(trm.areas, eq(trm.planesMitigacion.area_id, trm.areas.id))
		.leftJoin(trm.riesgos, eq(trm.planesMitigacion.riesgo_id, trm.riesgos.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(trm.planesMitigacion.creado_en));
	return rep.send(rows);
});

fastify.post("/api/trm/planes", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.planesMitigacion).values(req.body as any).returning();
	return row;
});

fastify.get("/api/trm/planes/:id", async (req, rep) => {
	const { id } = req.params as { id: string };
	const row = await db.select().from(trm.planesMitigacion).where(eq(trm.planesMitigacion.id, id)).limit(1);
	if (!row.length) return rep.status(404).send({ error: "Plan no encontrado" });
	const historial = await db.select().from(trm.planesAvanceHistorial)
		.where(eq(trm.planesAvanceHistorial.plan_id, id))
		.orderBy(desc(trm.planesAvanceHistorial.creado_en));
	return { ...row[0], historial };
});

fastify.patch("/api/trm/planes/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.planesMitigacion).set({ ...(req.body as any), actualizado_en: new Date() }).where(eq(trm.planesMitigacion.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/planes/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.planesMitigacion).where(eq(trm.planesMitigacion.id, id));
	return { success: true };
});

fastify.post("/api/trm/planes/:id/avance", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const body = req.body as { progreso_nuevo: number; estado_nuevo?: string; nota?: string; nombre_usuario?: string };
	const [current] = await db.select().from(trm.planesMitigacion).where(eq(trm.planesMitigacion.id, id)).limit(1);
	if (!current) return rep.status(404).send({ error: "Plan no encontrado" });
	const [hist] = await db.insert(trm.planesAvanceHistorial).values({
		plan_id: id,
		progreso_anterior: current.progreso,
		progreso_nuevo: body.progreso_nuevo,
		estado_anterior: current.estado,
		estado_nuevo: body.estado_nuevo ?? current.estado ?? undefined,
		nota: body.nota,
		nombre_usuario: body.nombre_usuario,
	}).returning();
	await db.update(trm.planesMitigacion).set({
		progreso: body.progreso_nuevo,
		...(body.estado_nuevo ? { estado: body.estado_nuevo } : {}),
		actualizado_en: new Date(),
	}).where(eq(trm.planesMitigacion.id, id));
	return hist;
});

fastify.get("/api/trm/planes/:id/historial", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	return db.select().from(trm.planesAvanceHistorial)
		.where(eq(trm.planesAvanceHistorial.plan_id, id))
		.orderBy(desc(trm.planesAvanceHistorial.creado_en));
});

// ============================================================
//  TRM — TAREAS DE PLANES
// ============================================================
fastify.get("/api/trm/planes/:planId/tareas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { planId } = req.params as { planId: string };
	return db.select().from(trm.planesTareas).where(eq(trm.planesTareas.plan_id, planId)).orderBy(trm.planesTareas.orden);
});

fastify.post("/api/trm/planes/:planId/tareas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { planId } = req.params as { planId: string };
	const [row] = await db.insert(trm.planesTareas).values({ ...(req.body as any), plan_id: planId }).returning();
	return row;
});

fastify.patch("/api/trm/planes/:planId/tareas/:tareaId", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { planId, tareaId } = req.params as { planId: string; tareaId: string };
	const [row] = await db.update(trm.planesTareas)
		.set({ ...(req.body as any), actualizado_en: new Date() })
		.where(and(eq(trm.planesTareas.id, tareaId), eq(trm.planesTareas.plan_id, planId)))
		.returning();
	if (!row) return rep.status(404).send({ error: "Tarea no encontrada" });
	return row;
});

fastify.delete("/api/trm/planes/:planId/tareas/:tareaId", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { planId, tareaId } = req.params as { planId: string; tareaId: string };
	await db.delete(trm.planesTareas).where(and(eq(trm.planesTareas.id, tareaId), eq(trm.planesTareas.plan_id, planId)));
	return { success: true };
});

// ============================================================
//  TRM — ESCALAMIENTOS
// ============================================================
fastify.get("/api/trm/escalamientos", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id, estado } = req.query as { terminal_id?: string; estado?: string };
	const creadoPorUser = alias(user, "creado_por_user");
	const conditions: any[] = [];
	if (terminal_id) conditions.push(eq(trm.escalamientos.terminal_id, terminal_id));
	if (estado) conditions.push(eq(trm.escalamientos.estado, estado));
	const rows = await db.select({
		...getTableColumns(trm.escalamientos),
		creado_por_nombre: creadoPorUser.name,
		terminal_nombre: trm.terminal.nombre,
	})
		.from(trm.escalamientos)
		.leftJoin(creadoPorUser, eq(trm.escalamientos.creado_por, creadoPorUser.id))
		.leftJoin(trm.terminal, eq(trm.escalamientos.terminal_id, trm.terminal.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(trm.escalamientos.creado_en));
	return rep.send(rows);
});

fastify.post("/api/trm/escalamientos", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const body = req.body as any;
	if (body.terminal_id === "") body.terminal_id = null;
	if (body.creado_por === "") body.creado_por = null;
	if (body.re_escalado_de === "") body.re_escalado_de = null;
	const [row] = await db.insert(trm.escalamientos).values(body).returning();
	return row;
});

fastify.get("/api/trm/escalamientos/:id", async (req, rep) => {
	const { id } = req.params as { id: string };
	const row = await db.select().from(trm.escalamientos).where(eq(trm.escalamientos.id, id)).limit(1);
	if (!row.length) return rep.status(404).send({ error: "Escalamiento no encontrado" });
	const historial = await db.select().from(trm.escalamientosHistorial)
		.where(eq(trm.escalamientosHistorial.escalamiento_id, id))
		.orderBy(desc(trm.escalamientosHistorial.creado_en));
	return { ...row[0], historial };
});

fastify.patch("/api/trm/escalamientos/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.escalamientos).set(req.body as any).where(eq(trm.escalamientos.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/escalamientos/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.escalamientos).where(eq(trm.escalamientos.id, id));
	return { success: true };
});

fastify.post("/api/trm/escalamientos/:id/responder", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const body = req.body as { respuesta_texto: string; respuesta_autor: string; respuesta_usuario_id?: string };
	const [row] = await db.update(trm.escalamientos).set({
		respuesta_texto: body.respuesta_texto,
		respuesta_autor: body.respuesta_autor,
		respuesta_usuario_id: body.respuesta_usuario_id,
		estado: "Respondido",
	}).where(eq(trm.escalamientos.id, id)).returning();
	await db.insert(trm.escalamientosHistorial).values({
		escalamiento_id: id,
		accion: "Respondido",
		descripcion: body.respuesta_texto,
		realizado_por: body.respuesta_autor,
		usuario_id: body.respuesta_usuario_id,
		color_hex: "#22C55E",
	});
	return row;
});

fastify.get("/api/trm/escalamientos/:id/historial", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	return db.select().from(trm.escalamientosHistorial)
		.where(eq(trm.escalamientosHistorial.escalamiento_id, id))
		.orderBy(desc(trm.escalamientosHistorial.creado_en));
});

// ============================================================
//  TRM — ACCIONES CORRECTIVAS
// ============================================================
fastify.get("/api/trm/acciones", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id?: string };
	const query = db.select().from(trm.accionesCorrectivas).orderBy(desc(trm.accionesCorrectivas.creado_en));
	return terminal_id ? query.where(eq(trm.accionesCorrectivas.terminal_id, terminal_id)) : query;
});

fastify.post("/api/trm/acciones", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.accionesCorrectivas).values(req.body as any).returning();
	return row;
});

fastify.patch("/api/trm/acciones/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.accionesCorrectivas).set(req.body as any).where(eq(trm.accionesCorrectivas.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/acciones/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.accionesCorrectivas).where(eq(trm.accionesCorrectivas.id, id));
	return { success: true };
});

// ============================================================
//  TRM — CONTROLES
// ============================================================
fastify.get("/api/trm/controles", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	return db.select().from(trm.controles);
});

fastify.post("/api/trm/controles", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.controles).values(req.body as any).returning();
	return row;
});

fastify.patch("/api/trm/controles/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.controles).set(req.body as any).where(eq(trm.controles.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/controles/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.controles).where(eq(trm.controles.id, id));
	return { success: true };
});

fastify.post("/api/trm/riesgos/:riesgoId/controles", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { riesgoId } = req.params as { riesgoId: string };
	const body = req.body as { control_id: string; efectivo?: boolean; observaciones?: string };
	const [row] = await db.insert(trm.riesgosControles).values({ riesgo_id: riesgoId, ...body }).returning();
	return row;
});

fastify.delete("/api/trm/riesgos/:riesgoId/controles/:controlId", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { riesgoId, controlId } = req.params as { riesgoId: string; controlId: string };
	await db.delete(trm.riesgosControles).where(
		and(eq(trm.riesgosControles.riesgo_id, riesgoId), eq(trm.riesgosControles.control_id, controlId))
	);
	return { success: true };
});

fastify.get("/api/trm/riesgos/:riesgoId/controles", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { riesgoId } = req.params as { riesgoId: string };
	const rows = await db.select({
		id: trm.riesgosControles.id,
		riesgo_id: trm.riesgosControles.riesgo_id,
		control_id: trm.riesgosControles.control_id,
		efectivo: trm.riesgosControles.efectivo,
		observaciones: trm.riesgosControles.observaciones,
		evaluado_en: trm.riesgosControles.evaluado_en,
		control_nombre: trm.controles.nombre,
		control_descripcion: trm.controles.descripcion,
		control_tipo: trm.controles.tipo,
		control_activo: trm.controles.activo,
	})
		.from(trm.riesgosControles)
		.innerJoin(trm.controles, eq(trm.riesgosControles.control_id, trm.controles.id))
		.where(eq(trm.riesgosControles.riesgo_id, riesgoId))
		.orderBy(trm.controles.nombre);
	return rows;
});

// ============================================================
//  TRM — KRI
// ============================================================
fastify.get("/api/trm/kri", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id?: string };
	const query = db.select().from(trm.kri);
	return terminal_id ? query.where(eq(trm.kri.terminal_id, terminal_id)) : query;
});

fastify.post("/api/trm/kri", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.kri).values(req.body as any).returning();
	return row;
});

fastify.patch("/api/trm/kri/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.kri).set(req.body as any).where(eq(trm.kri.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/kri/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.kri).where(eq(trm.kri.id, id));
	return { success: true };
});

fastify.get("/api/trm/kri/:kriId/valores", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { kriId } = req.params as { kriId: string };
	return db.select().from(trm.kriValores).where(eq(trm.kriValores.kri_id, kriId)).orderBy(desc(trm.kriValores.periodo));
});

fastify.post("/api/trm/kri/:kriId/valores", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { kriId } = req.params as { kriId: string };
	const [row] = await db.insert(trm.kriValores).values({ kri_id: kriId, ...(req.body as any) }).returning();
	return row;
});

// ============================================================
//  TRM — COMENTARIOS
// ============================================================
fastify.get("/api/trm/comentarios", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { entidad_tipo, entidad_id } = req.query as { entidad_tipo: string; entidad_id: string };
	if (!entidad_tipo || !entidad_id) return rep.status(400).send({ error: "entidad_tipo y entidad_id son requeridos" });
	return db.select().from(trm.comentarios)
		.where(and(eq(trm.comentarios.entidad_tipo, entidad_tipo), eq(trm.comentarios.entidad_id, entidad_id)))
		.orderBy(desc(trm.comentarios.creado_en));
});

fastify.post("/api/trm/comentarios", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.comentarios).values(req.body as any).returning();
	return row;
});

fastify.delete("/api/trm/comentarios/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.comentarios).where(eq(trm.comentarios.id, id));
	return { success: true };
});

// ============================================================
//  TRM — NOTIFICACIONES
// ============================================================
fastify.get("/api/trm/notificaciones", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { usuario_id, solo_no_leidas } = req.query as { usuario_id: string; solo_no_leidas?: string };
	if (!usuario_id) return rep.status(400).send({ error: "usuario_id es requerido" });
	const whereClause = solo_no_leidas === "true"
		? and(eq(trm.notificaciones.usuario_id, usuario_id), eq(trm.notificaciones.leida, false))
		: eq(trm.notificaciones.usuario_id, usuario_id);
	return db.select().from(trm.notificaciones).where(whereClause).orderBy(desc(trm.notificaciones.creado_en));
});

fastify.patch("/api/trm/notificaciones/:id/leer", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.notificaciones).set({ leida: true, leida_en: new Date() }).where(eq(trm.notificaciones.id, id)).returning();
	return row;
});

fastify.patch("/api/trm/notificaciones/leer-todas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { usuario_id } = req.body as { usuario_id: string };
	await db.update(trm.notificaciones)
		.set({ leida: true, leida_en: new Date() })
		.where(and(eq(trm.notificaciones.usuario_id, usuario_id), eq(trm.notificaciones.leida, false)));
	return { success: true };
});

// ============================================================
//  TRM — ADJUNTOS
// ============================================================
fastify.get("/api/trm/adjuntos", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { entidad_tipo, entidad_id } = req.query as { entidad_tipo: string; entidad_id: string };
	if (!entidad_tipo || !entidad_id) return rep.status(400).send({ error: "entidad_tipo y entidad_id son requeridos" });
	return db.select().from(trm.adjuntos)
		.where(and(eq(trm.adjuntos.entidad_tipo, entidad_tipo), eq(trm.adjuntos.entidad_id, entidad_id)))
		.orderBy(desc(trm.adjuntos.subido_en));
});

fastify.post("/api/trm/adjuntos", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.adjuntos).values(req.body as any).returning();
	return row;
});

fastify.delete("/api/trm/adjuntos/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.adjuntos).where(eq(trm.adjuntos.id, id));
	return { success: true };
});

// ============================================================
//  TRM — REPORTES PROGRAMADOS
// ============================================================
fastify.get("/api/trm/reportes", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id?: string };
	const query = db.select().from(trm.reportesProgramados);
	return terminal_id ? query.where(eq(trm.reportesProgramados.terminal_id, terminal_id)) : query;
});

fastify.post("/api/trm/reportes", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.reportesProgramados).values(req.body as any).returning();
	return row;
});

fastify.patch("/api/trm/reportes/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.reportesProgramados).set(req.body as any).where(eq(trm.reportesProgramados.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/reportes/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.reportesProgramados).where(eq(trm.reportesProgramados.id, id));
	return { success: true };
});

// ============================================================
//  TRM — MAPA
// ============================================================
fastify.get("/api/trm/mapa/zonas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id?: string };
	const query = db.select().from(trm.mapaZonas).orderBy(trm.mapaZonas.orden);
	return terminal_id ? query.where(eq(trm.mapaZonas.terminal_id, terminal_id)) : query;
});

fastify.post("/api/trm/mapa/zonas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.mapaZonas).values(req.body as any).returning();
	return row;
});

fastify.patch("/api/trm/mapa/zonas/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.mapaZonas).set(req.body as any).where(eq(trm.mapaZonas.id, id)).returning();
	return row;
});

fastify.get("/api/trm/mapa/marcadores", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id?: string };
	const query = db.select().from(trm.mapaMarcadores);
	return terminal_id ? query.where(eq(trm.mapaMarcadores.terminal_id, terminal_id)) : query;
});

fastify.post("/api/trm/mapa/marcadores", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.mapaMarcadores).values(req.body as any).returning();
	return row;
});

fastify.patch("/api/trm/mapa/marcadores/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	const [row] = await db.update(trm.mapaMarcadores).set(req.body as any).where(eq(trm.mapaMarcadores.id, id)).returning();
	return row;
});

fastify.delete("/api/trm/mapa/marcadores/:id", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { id } = req.params as { id: string };
	await db.delete(trm.mapaMarcadores).where(eq(trm.mapaMarcadores.id, id));
	return { success: true };
});

// ============================================================
//  TRM — DASHBOARD
// ============================================================
fastify.get("/api/trm/dashboard", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [riesgosActivos] = await db.select({ count: sql<number>`count(*)` }).from(trm.riesgos).where(eq(trm.riesgos.estado, "Activo"));
	const [riesgosCriticos] = await db.select({ count: sql<number>`count(*)` }).from(trm.riesgos).where(and(eq(trm.riesgos.nivel, "Crítico"), eq(trm.riesgos.estado, "Activo")));
	const [planesVencidos] = await db.select({ count: sql<number>`count(*)` }).from(trm.planesMitigacion).where(eq(trm.planesMitigacion.estado, "Vencido"));
	const [escalamientosPendientes] = await db.select({ count: sql<number>`count(*)` }).from(trm.escalamientos).where(eq(trm.escalamientos.estado, "Enviado"));
	const [accionesVencidas] = await db.select({ count: sql<number>`count(*)` }).from(trm.accionesCorrectivas).where(eq(trm.accionesCorrectivas.estado, "Vencido"));
	return {
		riesgos_activos: Number(riesgosActivos.count),
		riesgos_criticos: Number(riesgosCriticos.count),
		planes_vencidos: Number(planesVencidos.count),
		escalamientos_pendientes: Number(escalamientosPendientes.count),
		acciones_vencidas: Number(accionesVencidas.count),
		calculado_en: new Date(),
	};
});

fastify.get("/api/trm/dashboard/metricas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id } = req.query as { terminal_id: string; periodo?: string };
	if (!terminal_id) return rep.status(400).send({ error: "terminal_id es requerido" });
	return db.select().from(trm.dashboardMetricas)
		.where(eq(trm.dashboardMetricas.terminal_id, terminal_id))
		.orderBy(desc(trm.dashboardMetricas.periodo))
		.limit(12);
});

fastify.post("/api/trm/dashboard/metricas", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const body = req.body as any;
	const [row] = await db.insert(trm.dashboardMetricas).values(body)
		.onConflictDoUpdate({ target: [trm.dashboardMetricas.terminal_id, trm.dashboardMetricas.periodo], set: body })
		.returning();
	return row;
});

// ============================================================
//  TRM — AUDITORÍA
// ============================================================
fastify.get("/api/trm/auditoria", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const { terminal_id, tabla } = req.query as { terminal_id?: string; tabla?: string };
	let query = db.select().from(trm.auditoriaLog).orderBy(desc(trm.auditoriaLog.creado_en)).limit(200);
	if (terminal_id) query = query.where(eq(trm.auditoriaLog.terminal_id, terminal_id)) as any;
	if (tabla) query = query.where(eq(trm.auditoriaLog.tabla, tabla)) as any;
	return query;
});

fastify.post("/api/trm/auditoria", async (req, rep) => {
	if (!requireAuth(req, rep)) return;
	const [row] = await db.insert(trm.auditoriaLog).values(req.body as any).returning();
	return row;
});

// ============================================================
//  INICIO DEL SERVIDOR
// ============================================================
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