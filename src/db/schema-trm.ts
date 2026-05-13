import {
  pgSchema,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  numeric,
  timestamp,
  time,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import { user } from "./schema.ts"; // reutilizamos la tabla user de Better Auth

export const trm = pgSchema("trm");

// ── terminal ─────────────────────────────────────────────────
export const terminal = trm.table("terminal", {
  id: uuid("id").defaultRandom().primaryKey(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  codigo: varchar("codigo", { length: 50 }),
  ubicacion: text("ubicacion"),
  activa: boolean("activa").default(true),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── areas ────────────────────────────────────────────────────
export const areas = trm.table("areas", {
  id: uuid("id").defaultRandom().primaryKey(),
  nombre: varchar("nombre", { length: 150 }).notNull(),
  descripcion: text("descripcion"),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  activa: boolean("activa").default(true),
});

// ── riesgos ──────────────────────────────────────────────────
export const riesgos = trm.table("riesgos", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  area_id: uuid("area_id").references(() => areas.id),
  responsable_id: text("responsable_id").references(() => user.id),
  codigo: varchar("codigo", { length: 50 }),
  nombre: varchar("nombre", { length: 300 }).notNull(),
  descripcion: text("descripcion"),
  causa: text("causa"),
  categoria: varchar("categoria", { length: 100 }),
  probabilidad: integer("probabilidad"),
  impacto: integer("impacto"),
  score: integer("score"),
  nivel: varchar("nivel", { length: 20 }),
  estado: varchar("estado", { length: 30 }).default("Activo"),
  proxima_revision: date("proxima_revision"),
  observaciones_internas: text("observaciones_internas"),
  justificacion_cambio_estado: text("justificacion_cambio_estado"),
  antecedentes_descripcion: text("antecedentes_descripcion"),
  score_anterior: integer("score_anterior"),
  nivel_anterior: varchar("nivel_anterior", { length: 20 }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow(),
  responsable_accion_id: text("responsable_accion_id").references(() => user.id)
});

// ── equipos ──────────────────────────────────────────────────
export const equipos = trm.table("equipos", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  area_id: uuid("area_id").references(() => areas.id),
  codigo: varchar("codigo", { length: 30 }).notNull(),
  nombre: varchar("nombre", { length: 150 }).notNull(),
  tipo: varchar("tipo", { length: 80 }),
  ciclo_mtto_dias: integer("ciclo_mtto_dias").default(30),
  ultimo_mtto: date("ultimo_mtto"),
  proximo_mtto: date("proximo_mtto"),
  estado: varchar("estado", { length: 30 }).default("OK"),
  activo: boolean("activo").default(true),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow(),
});

// ── incidentes ───────────────────────────────────────────────
export const incidentes = trm.table("incidentes", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  area_id: uuid("area_id").references(() => areas.id),
  equipo_id: uuid("equipo_id").references(() => equipos.id),
  responsable_id: text("responsable_id").references(() => user.id),
  responsable_nombre: varchar("responsable_nombre", { length: 200 }),
  codigo: varchar("codigo", { length: 50 }),
  titulo: varchar("titulo", { length: 300 }).notNull(),
  descripcion: text("descripcion"),
  severidad: varchar("severidad", { length: 30 }),
  estado: varchar("estado", { length: 30 }).default("Abierto"),
  fecha_ocurrencia: date("fecha_ocurrencia"),
  hora_ocurrencia: time("hora_ocurrencia"),
  turno: varchar("turno", { length: 30 }),
  causa_inmediata: text("causa_inmediata"),
  causa_raiz: text("causa_raiz"),
  acciones_inmediatas: text("acciones_inmediatas"),
  testigos: text("testigos"),
  factores_contribuyentes: text("factores_contribuyentes"),
  lecciones_aprendidas: text("lecciones_aprendidas"),
  observaciones_internas: text("observaciones_internas"),
  motivo_cierre: text("motivo_cierre"),
  riesgo_id: uuid("riesgo_id").references(() => riesgos.id),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow(),
});

// ── incidentes_riesgos (relación N:M) ────────────────────────
export const incidentesRiesgos = trm.table("incidentes_riesgos", {
  incidente_id: uuid("incidente_id").notNull().references(() => incidentes.id, { onDelete: "cascade" }),
  riesgo_id: uuid("riesgo_id").notNull().references(() => riesgos.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.incidente_id, t.riesgo_id] }) }));

// ── planes_mitigacion ────────────────────────────────────────
export const planesMitigacion = trm.table("planes_mitigacion", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  area_id: uuid("area_id").references(() => areas.id),
  riesgo_id: uuid("riesgo_id").references(() => riesgos.id),
  responsable_id: text("responsable_id").references(() => user.id),
  codigo: varchar("codigo", { length: 50 }),
  titulo: varchar("titulo", { length: 300 }).notNull(),
  descripcion: text("descripcion"),
  objetivo: text("objetivo"),
  tipo_control: text("tipo_control"),
  estrategia: text("estrategia"),
  indicador: text("indicador"),
  norma: text("norma"),
  nota_avance: text("nota_avance"),
  recursos_adicionales: text("recursos_adicionales"),
  justificacion_cambio: text("justificacion_cambio"),
  observaciones: text("observaciones"),
  aprobador: text("aprobador"),
  estado: varchar("estado", { length: 30 }).default("Pendiente"),
  progreso: integer("progreso").default(0),
  fecha_inicio: date("fecha_inicio"),
  fecha_limite: date("fecha_limite"),
  fecha_revision: date("fecha_revision"),
  observaciones_responsable: text("observaciones_responsable"),
  evidencia_cierre: text("evidencia_cierre"),
  justificacion_cambio_estado: text("justificacion_cambio_estado"),
  progreso_anterior: integer("progreso_anterior").default(0),
  estado_anterior: varchar("estado_anterior", { length: 30 }),
  porcentaje_efectividad: numeric("porcentaje_efectividad", { precision: 5, scale: 2 }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow(),
});

// ── escalamientos ────────────────────────────────────────────
export const escalamientos = trm.table("escalamientos", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  creado_por: text("creado_por").references(() => user.id),
  codigo: varchar("codigo", { length: 50 }),
  motivo: text("motivo").notNull(),
  urgencia: varchar("urgencia", { length: 30 }),
  estado: varchar("estado", { length: 30 }).default("Enviado"),
  re_escalado_de: uuid("re_escalado_de"),
  nivel_escalamiento: integer("nivel_escalamiento").default(1),
  respuesta_texto: text("respuesta_texto"),
  respuesta_autor: varchar("respuesta_autor", { length: 200 }),
  respuesta_usuario_id: text("respuesta_usuario_id").references(() => user.id),
  auto_generado: boolean("auto_generado").default(false),
  horas_sin_respuesta: integer("horas_sin_respuesta"),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── escalamientos_planes (relación N:M) ──────────────────────
export const escalamientosPlanes = trm.table("escalamientos_planes", {
  escalamiento_id: uuid("escalamiento_id").notNull().references(() => escalamientos.id, { onDelete: "cascade" }),
  plan_id: uuid("plan_id").notNull().references(() => planesMitigacion.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.escalamiento_id, t.plan_id] }) }));

// ── acciones_correctivas ─────────────────────────────────────
export const accionesCorrectivas = trm.table("acciones_correctivas", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  responsable_id: text("responsable_id").references(() => user.id),
  titulo: varchar("titulo", { length: 300 }).notNull(),
  descripcion: text("descripcion"),
  estado: varchar("estado", { length: 30 }).default("Pendiente"),
  fecha_limite: date("fecha_limite"),
  escalamiento_id: uuid("escalamiento_id").references(() => escalamientos.id),
  riesgo_id: uuid("riesgo_id").references(() => riesgos.id),
  prioridad: varchar("prioridad", { length: 20 }).default("Media"),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── controles ────────────────────────────────────────────────
export const controles = trm.table("controles", {
  id: uuid("id").defaultRandom().primaryKey(),
  nombre: varchar("nombre", { length: 300 }).notNull(),
  descripcion: text("descripcion"),
  tipo: varchar("tipo", { length: 100 }),
  activo: boolean("activo").default(true),
});

// ── riesgos_controles (relación N:M) ─────────────────────────
export const riesgosControles = trm.table("riesgos_controles", {
  id: uuid("id").defaultRandom().primaryKey(),
  riesgo_id: uuid("riesgo_id").notNull().references(() => riesgos.id, { onDelete: "cascade" }),
  control_id: uuid("control_id").notNull().references(() => controles.id, { onDelete: "cascade" }),
  efectivo: boolean("efectivo").default(false),
  observaciones: text("observaciones"),
  evaluado_en: timestamp("evaluado_en", { withTimezone: true }),
});

// ── kri (indicadores) ────────────────────────────────────────
export const kri = trm.table("kri", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  descripcion: text("descripcion"),
  unidad: varchar("unidad", { length: 50 }),
  umbral_alerta: numeric("umbral_alerta", { precision: 10, scale: 2 }),
  umbral_critico: numeric("umbral_critico", { precision: 10, scale: 2 }),
  activo: boolean("activo").default(true),
});

// ── kri_valores ──────────────────────────────────────────────
export const kriValores = trm.table("kri_valores", {
  id: uuid("id").defaultRandom().primaryKey(),
  kri_id: uuid("kri_id").notNull().references(() => kri.id, { onDelete: "cascade" }),
  terminal_id: uuid("terminal_id").references(() => terminal.id),
  periodo: date("periodo").notNull(),
  valor: numeric("valor", { precision: 10, scale: 2 }),
  estado: varchar("estado", { length: 20 }).default("OK"),
  registrado_por: text("registrado_por").references(() => user.id),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── auditoria_log ────────────────────────────────────────────
export const auditoriaLog = trm.table("auditoria_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id),
  usuario_id: text("usuario_id").references(() => user.id),
  accion: varchar("accion", { length: 100 }).notNull(),
  tabla: varchar("tabla", { length: 100 }),
  registro_id: varchar("registro_id", { length: 100 }),
  datos_anteriores: text("datos_anteriores"),
  datos_nuevos: text("datos_nuevos"),
  modulo_registro_id: varchar("modulo_registro_id", { length: 100 }),
  duracion_ms: integer("duracion_ms"),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── exportaciones ────────────────────────────────────────────
export const exportaciones = trm.table("exportaciones", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id),
  usuario_id: text("usuario_id").references(() => user.id),
  tipo: varchar("tipo", { length: 100 }),
  formato: varchar("formato", { length: 20 }),
  url: text("url"),
  estado: varchar("estado", { length: 20 }).default("Completado"),
  error_mensaje: text("error_mensaje"),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── mapa_zonas ───────────────────────────────────────────────
export const mapaZonas = trm.table("mapa_zonas", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  geojson: text("geojson"),
  nombre: varchar("nombre", { length: 150 }),
  nivel_riesgo: varchar("nivel_riesgo", { length: 20 }),
  total_riesgos: integer("total_riesgos").default(0),
  total_incidentes: integer("total_incidentes").default(0),
  orden: integer("orden").default(0),
});

// ── mapa_marcadores ──────────────────────────────────────────
export const mapaMarcadores = trm.table("mapa_marcadores", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  zona_id: uuid("zona_id").references(() => mapaZonas.id),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  titulo: varchar("titulo", { length: 200 }),
  entidad_tipo: varchar("entidad_tipo", { length: 30 }),
  entidad_id: uuid("entidad_id"),
  nivel: varchar("nivel", { length: 20 }),
  color_hex: varchar("color_hex", { length: 7 }),
  pulsante: boolean("pulsante").default(false),
  tooltip: text("tooltip"),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow(),
});

// ── escalamientos_historial ──────────────────────────────────
export const escalamientosHistorial = trm.table("escalamientos_historial", {
  id: uuid("id").defaultRandom().primaryKey(),
  escalamiento_id: uuid("escalamiento_id").notNull().references(() => escalamientos.id, { onDelete: "cascade" }),
  accion: varchar("accion", { length: 100 }).notNull(),
  descripcion: text("descripcion"),
  realizado_por: varchar("realizado_por", { length: 200 }),
  usuario_id: text("usuario_id").references(() => user.id),
  color_hex: varchar("color_hex", { length: 7 }).default("#185FA5"),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── planes_tareas ────────────────────────────────────────────
export const planesTareas = trm.table("planes_tareas", {
  id: uuid("id").defaultRandom().primaryKey(),
  plan_id: uuid("plan_id").notNull().references(() => planesMitigacion.id, { onDelete: "cascade" }),
  descripcion: varchar("descripcion", { length: 500 }).notNull(),
  responsable: varchar("responsable", { length: 200 }),
  fecha_limite: date("fecha_limite"),
  estado: varchar("estado", { length: 30 }).default("Pendiente"), // Pendiente | En ejecución | Completada
  orden: integer("orden").default(0),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow(),
});

// ── planes_avance_historial ──────────────────────────────────
export const planesAvanceHistorial = trm.table("planes_avance_historial", {
  id: uuid("id").defaultRandom().primaryKey(),
  plan_id: uuid("plan_id").notNull().references(() => planesMitigacion.id, { onDelete: "cascade" }),
  progreso_anterior: integer("progreso_anterior"),
  progreso_nuevo: integer("progreso_nuevo").notNull(),
  estado_anterior: varchar("estado_anterior", { length: 30 }),
  estado_nuevo: varchar("estado_nuevo", { length: 30 }),
  nota: text("nota"),
  actualizado_por: text("actualizado_por").references(() => user.id),
  nombre_usuario: varchar("nombre_usuario", { length: 200 }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── riesgos_estados_historial ────────────────────────────────
export const riesgosEstadosHistorial = trm.table("riesgos_estados_historial", {
  id: uuid("id").defaultRandom().primaryKey(),
  riesgo_id: uuid("riesgo_id").notNull().references(() => riesgos.id, { onDelete: "cascade" }),
  estado_anterior: varchar("estado_anterior", { length: 30 }),
  estado_nuevo: varchar("estado_nuevo", { length: 30 }).notNull(),
  justificacion: text("justificacion"),
  cambiado_por: text("cambiado_por").references(() => user.id),
  nombre_usuario: varchar("nombre_usuario", { length: 200 }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── incidentes_estados_historial ─────────────────────────────
export const incidentesEstadosHistorial = trm.table("incidentes_estados_historial", {
  id: uuid("id").defaultRandom().primaryKey(),
  incidente_id: uuid("incidente_id").notNull().references(() => incidentes.id, { onDelete: "cascade" }),
  estado_anterior: varchar("estado_anterior", { length: 30 }),
  estado_nuevo: varchar("estado_nuevo", { length: 30 }).notNull(),
  justificacion: text("justificacion"),
  cambiado_por: text("cambiado_por").references(() => user.id),
  nombre_usuario: varchar("nombre_usuario", { length: 200 }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── comentarios ──────────────────────────────────────────────
export const comentarios = trm.table("comentarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  entidad_tipo: varchar("entidad_tipo", { length: 30 }).notNull(),
  entidad_id: uuid("entidad_id").notNull(),
  texto: text("texto").notNull(),
  visible_para: varchar("visible_para", { length: 30 }).default("todos"),
  autor_id: text("autor_id").references(() => user.id),
  nombre_autor: varchar("nombre_autor", { length: 200 }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── notificaciones ───────────────────────────────────────────
export const notificaciones = trm.table("notificaciones", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  usuario_id: text("usuario_id").references(() => user.id, { onDelete: "cascade" }),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  mensaje: text("mensaje"),
  entidad_tipo: varchar("entidad_tipo", { length: 30 }),
  entidad_id: uuid("entidad_id"),
  leida: boolean("leida").default(false),
  leida_en: timestamp("leida_en", { withTimezone: true }),
  nivel: varchar("nivel", { length: 20 }).default("info"),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── adjuntos ─────────────────────────────────────────────────
export const adjuntos = trm.table("adjuntos", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  entidad_tipo: varchar("entidad_tipo", { length: 30 }).notNull(),
  entidad_id: uuid("entidad_id").notNull(),
  nombre_archivo: varchar("nombre_archivo", { length: 300 }).notNull(),
  tipo_mime: varchar("tipo_mime", { length: 100 }),
  tamano_bytes: integer("tamano_bytes"),
  url_almacenamiento: text("url_almacenamiento"),
  descripcion: text("descripcion"),
  subido_por: text("subido_por").references(() => user.id),
  subido_en: timestamp("subido_en", { withTimezone: true }).defaultNow(),
});

// ── reportes_programados ─────────────────────────────────────
export const reportesProgramados = trm.table("reportes_programados", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").references(() => terminal.id, { onDelete: "cascade" }),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  tipo: varchar("tipo", { length: 30 }).default("ejecutivo_mensual"),
  frecuencia: varchar("frecuencia", { length: 20 }).default("mensual"),
  dia_envio: integer("dia_envio"),
  hora_envio: time("hora_envio").default("08:00"),
  destinatarios: text("destinatarios").array(),
  formato: varchar("formato", { length: 10 }).default("pdf"),
  activo: boolean("activo").default(true),
  ultimo_envio: timestamp("ultimo_envio", { withTimezone: true }),
  proximo_envio: timestamp("proximo_envio", { withTimezone: true }),
  creado_por: text("creado_por").references(() => user.id),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow(),
});

// ── dashboard_metricas ───────────────────────────────────────
export const dashboardMetricas = trm.table("dashboard_metricas", {
  id: uuid("id").defaultRandom().primaryKey(),
  terminal_id: uuid("terminal_id").notNull().references(() => terminal.id, { onDelete: "cascade" }),
  calculado_en: timestamp("calculado_en", { withTimezone: true }).defaultNow(),
  periodo: date("periodo").notNull(),
  total_riesgos_activos: integer("total_riesgos_activos").default(0),
  riesgos_criticos: integer("riesgos_criticos").default(0),
  riesgos_altos: integer("riesgos_altos").default(0),
  riesgos_medios: integer("riesgos_medios").default(0),
  riesgos_bajos: integer("riesgos_bajos").default(0),
  total_incidentes_mes: integer("total_incidentes_mes").default(0),
  incidentes_criticos_mes: integer("incidentes_criticos_mes").default(0),
  incidentes_graves_mes: integer("incidentes_graves_mes").default(0),
  dias_sin_accidentes: integer("dias_sin_accidentes").default(0),
  planes_activos: integer("planes_activos").default(0),
  planes_vencidos: integer("planes_vencidos").default(0),
  planes_completados_mes: integer("planes_completados_mes").default(0),
  efectividad_controles_pct: numeric("efectividad_controles_pct", { precision: 5, scale: 2 }),
  acciones_vencidas: integer("acciones_vencidas").default(0),
  acciones_pendientes: integer("acciones_pendientes").default(0),
  escalamientos_pendientes: integer("escalamientos_pendientes").default(0),
});
