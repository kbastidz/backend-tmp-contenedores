import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { auth } from "./src/lib/auth.ts";
import { db } from "./src/db/index.ts";
import * as trm from "./src/db/schema-trm.ts";
import { user } from "./src/db/schema.ts";
import { eq, and, desc, sql, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { trmLogger } from "./src/lib/trm-logger.ts";

const fastify = Fastify({ logger: false }); // desactivamos el logger built-in, usamos trmLogger

// ── Request timing storage ────────────────────────────────────
const requestStartTimes = new WeakMap<object, number>();

// ── Hooks de logging ──────────────────────────────────────────
fastify.addHook("onRequest", async (request) => {
  requestStartTimes.set(request, Date.now());
});

fastify.addHook("preHandler", async (request) => {
  trmLogger.info(`→ ${request.method} ${request.url}`, {
    service: "trm-server",
    method: request.method,
    path: request.url,
    payload: ["POST", "PUT", "PATCH"].includes(request.method) ? request.body : undefined,
  });
});

fastify.addHook("onResponse", async (request, reply) => {
  const start = requestStartTimes.get(request) ?? Date.now();
  const durationMs = Date.now() - start;
  const level = reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 ? "warn" : "info";
  trmLogger[level](`${request.method} ${request.url}`, {
    service: "trm-server",
    method: request.method,
    path: request.url,
    statusCode: reply.statusCode,
    durationMs,
  });
});

fastify.addHook("onError", async (request, reply, error) => {
  const start = requestStartTimes.get(request) ?? Date.now();
  trmLogger.error(`${request.method} ${request.url}`, {
    service: "trm-server",
    method: request.method,
    path: request.url,
    durationMs: Date.now() - start,
    error: { message: error.message, stack: error.stack },
  });
});

fastify.register(cors, { origin: true, credentials: true });
fastify.register(cookie);

// ── Auth middleware ───────────────────────────────────────────
fastify.addHook("preHandler", async (request) => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(request.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  }
  const session = await auth.api.getSession({ headers });
  if (session) {
    request.user = session.user;
    request.session = session.session;
  }
});

declare module "fastify" {
  interface FastifyRequest { user?: any; session?: any; }
}

const requireAuth = (request: any, reply: any) => {
  if (!request.user) { reply.status(401).send({ error: "No autenticado" }); return false; }
  return true;
};

// ── Health ────────────────────────────────────────────────────
fastify.get("/health", async () => ({ status: "ok", timestamp: new Date() }));

// ============================================================
//  TERMINALES
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
//  ÁREAS
// ============================================================
fastify.get("/api/trm/areas", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { terminal_id } = req.query as { terminal_id?: string };
  const query = db.select().from(trm.areas);
  return terminal_id
    ? query.where(eq(trm.areas.terminal_id, terminal_id))
    : query;
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
//  EQUIPOS
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
//  RIESGOS
// ============================================================
fastify.get("/api/trm/riesgos", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { terminal_id } = req.query as { terminal_id?: string };
  const responsableUser = alias(user, "responsable_user");
  const conditions: any[] = [];
  if (terminal_id) conditions.push(eq(trm.riesgos.terminal_id, terminal_id));
  
  // Subquery para verificar si el riesgo tiene planes
  const tienePlanSubquery = sql`(SELECT COUNT(*) FROM ${trm.planesMitigacion} WHERE ${trm.planesMitigacion.riesgo_id} = ${trm.riesgos.id}) > 0`;
  
  const rows = await db.select({
    ...getTableColumns(trm.riesgos),
    responsable_nombre: responsableUser.name,
    area_nombre:        trm.areas.nombre,
    terminal_nombre:    trm.terminal.nombre,
    tiene_plan:         tienePlanSubquery,
  })
    .from(trm.riesgos)
    .leftJoin(responsableUser, eq(trm.riesgos.responsable_id, responsableUser.id))
    .leftJoin(trm.areas,    eq(trm.riesgos.area_id,    trm.areas.id))
    .leftJoin(trm.terminal, eq(trm.riesgos.terminal_id, trm.terminal.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(trm.riesgos.creado_en));
  return rep.send(rows);
});

fastify.post("/api/trm/riesgos", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const body = req.body as any;
  // Convertir strings vacíos de campos UUID a null
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
  // Planes, controles e incidentes vinculados
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
  
  // Obtener riesgo actual antes de actualizar
  const [current] = await db.select().from(trm.riesgos).where(eq(trm.riesgos.id, id)).limit(1);
  if (!current) return rep.status(404).send({ error: "Riesgo no encontrado" });
  
  // Verificar si el estado está cambiando
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

// Historial de estados de un riesgo
fastify.get("/api/trm/riesgos/:id/historial", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { id } = req.params as { id: string };
  return db.select().from(trm.riesgosEstadosHistorial)
    .where(eq(trm.riesgosEstadosHistorial.riesgo_id, id))
    .orderBy(desc(trm.riesgosEstadosHistorial.creado_en));
});

// ============================================================
//  INCIDENTES
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
    area_nombre:        trm.areas.nombre,
    terminal_nombre:    trm.terminal.nombre,
    equipo_nombre:      trm.equipos.nombre,
  })
    .from(trm.incidentes)
    .leftJoin(responsableUser, eq(trm.incidentes.responsable_id, responsableUser.id))
    .leftJoin(trm.areas,    eq(trm.incidentes.area_id,    trm.areas.id))
    .leftJoin(trm.terminal, eq(trm.incidentes.terminal_id, trm.terminal.id))
    .leftJoin(trm.equipos,  eq(trm.incidentes.equipo_id,  trm.equipos.id))
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
  
  // Obtener incidente actual antes de actualizar
  const [current] = await db.select().from(trm.incidentes).where(eq(trm.incidentes.id, id)).limit(1);
  if (!current) return rep.status(404).send({ error: "Incidente no encontrado" });
  
  // Verificar si el estado está cambiando
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
  
  const updatedBody = { ...body, actualizado_en: new Date() };
  const [row] = await db.update(trm.incidentes).set(updatedBody).where(eq(trm.incidentes.id, id)).returning();
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
//  PLANES DE MITIGACIÓN
// ============================================================
fastify.get("/api/trm/planes", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { terminal_id, riesgo_id, estado } = req.query as { terminal_id?: string; riesgo_id?: string; estado?: string };
  const responsableUser = alias(user, "responsable_user");
  const conditions: any[] = [];
  if (terminal_id) conditions.push(eq(trm.planesMitigacion.terminal_id, terminal_id));
  if (riesgo_id)   conditions.push(eq(trm.planesMitigacion.riesgo_id, riesgo_id));
  if (estado)      conditions.push(eq(trm.planesMitigacion.estado, estado));
  const rows = await db.select({
    ...getTableColumns(trm.planesMitigacion),
    responsable_nombre: responsableUser.name,
    area_nombre:        trm.areas.nombre,
    riesgo_codigo:      trm.riesgos.codigo,
    riesgo_nombre:      trm.riesgos.nombre,
  })
    .from(trm.planesMitigacion)
    .leftJoin(responsableUser, eq(trm.planesMitigacion.responsable_id, responsableUser.id))
    .leftJoin(trm.areas,   eq(trm.planesMitigacion.area_id,   trm.areas.id))
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
  const body = { ...(req.body as any), actualizado_en: new Date() };
  const [row] = await db.update(trm.planesMitigacion).set(body).where(eq(trm.planesMitigacion.id, id)).returning();
  return row;
});

fastify.delete("/api/trm/planes/:id", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { id } = req.params as { id: string };
  await db.delete(trm.planesMitigacion).where(eq(trm.planesMitigacion.id, id));
  return { success: true };
});

// Registrar avance manualmente
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
//  TAREAS DE PLANES
// ============================================================
fastify.get("/api/trm/planes/:planId/tareas", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { planId } = req.params as { planId: string };
  return db.select().from(trm.planesTareas)
    .where(eq(trm.planesTareas.plan_id, planId))
    .orderBy(trm.planesTareas.orden);
});

fastify.post("/api/trm/planes/:planId/tareas", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { planId } = req.params as { planId: string };
  const [row] = await db.insert(trm.planesTareas)
    .values({ ...(req.body as any), plan_id: planId })
    .returning();
  return row;
});

fastify.patch("/api/trm/planes/:planId/tareas/:tareaId", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { planId, tareaId } = req.params as { planId: string; tareaId: string };
  const body = { ...(req.body as any), actualizado_en: new Date() };
  const [row] = await db.update(trm.planesTareas)
    .set(body)
    .where(and(eq(trm.planesTareas.id, tareaId), eq(trm.planesTareas.plan_id, planId)))
    .returning();
  if (!row) return rep.status(404).send({ error: "Tarea no encontrada" });
  return row;
});

fastify.delete("/api/trm/planes/:planId/tareas/:tareaId", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { planId, tareaId } = req.params as { planId: string; tareaId: string };
  await db.delete(trm.planesTareas)
    .where(and(eq(trm.planesTareas.id, tareaId), eq(trm.planesTareas.plan_id, planId)));
  return { success: true };
});

// ============================================================
//  ESCALAMIENTOS
// ============================================================
fastify.get("/api/trm/escalamientos", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { terminal_id, estado } = req.query as { terminal_id?: string; estado?: string };
  const creadoPorUser = alias(user, "creado_por_user");
  const conditions: any[] = [];
  if (terminal_id) conditions.push(eq(trm.escalamientos.terminal_id, terminal_id));
  if (estado)      conditions.push(eq(trm.escalamientos.estado, estado));
  const rows = await db.select({
    ...getTableColumns(trm.escalamientos),
    creado_por_nombre: creadoPorUser.name,
    terminal_nombre:   trm.terminal.nombre,
  })
    .from(trm.escalamientos)
    .leftJoin(creadoPorUser, eq(trm.escalamientos.creado_por, creadoPorUser.id))
    .leftJoin(trm.terminal,  eq(trm.escalamientos.terminal_id, trm.terminal.id))
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

// Responder un escalamiento
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
//  ACCIONES CORRECTIVAS
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
//  CONTROLES
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

// Vincular/desvincular control a riesgo
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

// Listar controles asociados a un riesgo
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
//  KRI — INDICADORES
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

// Valores de KRI
fastify.get("/api/trm/kri/:kriId/valores", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { kriId } = req.params as { kriId: string };
  return db.select().from(trm.kriValores)
    .where(eq(trm.kriValores.kri_id, kriId))
    .orderBy(desc(trm.kriValores.periodo));
});

fastify.post("/api/trm/kri/:kriId/valores", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { kriId } = req.params as { kriId: string };
  const [row] = await db.insert(trm.kriValores).values({ kri_id: kriId, ...(req.body as any) }).returning();
  return row;
});

// ============================================================
//  COMENTARIOS (polimórfico)
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
//  NOTIFICACIONES
// ============================================================
fastify.get("/api/trm/notificaciones", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { usuario_id, solo_no_leidas } = req.query as { usuario_id: string; solo_no_leidas?: string };
  if (!usuario_id) return rep.status(400).send({ error: "usuario_id es requerido" });
  const whereClause = solo_no_leidas === "true"
    ? and(eq(trm.notificaciones.usuario_id, usuario_id), eq(trm.notificaciones.leida, false))
    : eq(trm.notificaciones.usuario_id, usuario_id);
  return db.select().from(trm.notificaciones)
    .where(whereClause)
    .orderBy(desc(trm.notificaciones.creado_en));
});

fastify.patch("/api/trm/notificaciones/:id/leer", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { id } = req.params as { id: string };
  const [row] = await db.update(trm.notificaciones)
    .set({ leida: true, leida_en: new Date() })
    .where(eq(trm.notificaciones.id, id))
    .returning();
  return row;
});

// Marcar todas como leídas
fastify.patch("/api/trm/notificaciones/leer-todas", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { usuario_id } = req.body as { usuario_id: string };
  await db.update(trm.notificaciones)
    .set({ leida: true, leida_en: new Date() })
    .where(and(eq(trm.notificaciones.usuario_id, usuario_id), eq(trm.notificaciones.leida, false)));
  return { success: true };
});

// ============================================================
//  ADJUNTOS
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
//  REPORTES PROGRAMADOS
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
//  MAPA
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
//  DASHBOARD
// ============================================================
fastify.get("/api/trm/dashboard", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { terminal_id } = req.query as { terminal_id?: string };

  // Métricas en tiempo real (sin caché)
  const [riesgosActivos] = await db.select({ count: sql<number>`count(*)` })
    .from(trm.riesgos).where(eq(trm.riesgos.estado, "Activo"));
  const [riesgosCriticos] = await db.select({ count: sql<number>`count(*)` })
    .from(trm.riesgos).where(and(eq(trm.riesgos.nivel, "Crítico"), eq(trm.riesgos.estado, "Activo")));
  const [planesVencidos] = await db.select({ count: sql<number>`count(*)` })
    .from(trm.planesMitigacion).where(eq(trm.planesMitigacion.estado, "Vencido"));
  const [escalamientosPendientes] = await db.select({ count: sql<number>`count(*)` })
    .from(trm.escalamientos).where(eq(trm.escalamientos.estado, "Enviado"));
  const [accionesVencidas] = await db.select({ count: sql<number>`count(*)` })
    .from(trm.accionesCorrectivas).where(eq(trm.accionesCorrectivas.estado, "Vencido"));

  return {
    riesgos_activos: Number(riesgosActivos.count),
    riesgos_criticos: Number(riesgosCriticos.count),
    planes_vencidos: Number(planesVencidos.count),
    escalamientos_pendientes: Number(escalamientosPendientes.count),
    acciones_vencidas: Number(accionesVencidas.count),
    calculado_en: new Date(),
  };
});

// Métricas cacheadas por terminal/periodo
fastify.get("/api/trm/dashboard/metricas", async (req, rep) => {
  if (!requireAuth(req, rep)) return;
  const { terminal_id, periodo } = req.query as { terminal_id: string; periodo?: string };
  if (!terminal_id) return rep.status(400).send({ error: "terminal_id es requerido" });
  const query = db.select().from(trm.dashboardMetricas)
    .where(eq(trm.dashboardMetricas.terminal_id, terminal_id))
    .orderBy(desc(trm.dashboardMetricas.periodo))
    .limit(12);
  return query;
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
//  AUDITORÍA
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
    const port = Number(process.env.TRM_PORT) || 3002;
    await fastify.listen({ port, host: "0.0.0.0" });
    trmLogger.info(`🚀 TRM Server corriendo en http://localhost:${port}`, {
      service: "trm-server",
      method: "STARTUP",
      path: "/",
    });
  } catch (err) {
    trmLogger.error("Error al iniciar el servidor", {
      service: "trm-server",
      method: "STARTUP",
      path: "/",
      error: { message: (err as Error).message, stack: (err as Error).stack },
    });
    process.exit(1);
  }
};

start();
