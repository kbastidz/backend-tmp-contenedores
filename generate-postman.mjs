const BASE = "{{base_url}}";

const autoSave = (varName) => ([{
  listen: "test",
  script: {
    type: "text/javascript",
    exec: [`const r = pm.response.json(); if (r && r.id) pm.collectionVariables.set('${varName}', r.id);`]
  }
}]);

const autoSaveList = (varName) => ([{
  listen: "test",
  script: {
    type: "text/javascript",
    exec: [`const r = pm.response.json(); if (Array.isArray(r) && r.length) pm.collectionVariables.set('${varName}', r[0].id);`]
  }
}]);

const GET = (name, url, events = []) => ({ name, event: events, request: { method: "GET", url } });
const POST = (name, url, rawBody, events = []) => ({ name, event: events, request: { method: "POST", header: [{ key: "Content-Type", value: "application/json" }], url, body: { mode: "raw", raw: rawBody } } });
const PATCH = (name, url, rawBody) => ({ name, request: { method: "PATCH", header: [{ key: "Content-Type", value: "application/json" }], url, body: { mode: "raw", raw: rawBody } } });
const DELETE = (name, url) => ({ name, request: { method: "DELETE", url } });
const folder = (name, items) => ({ name, item: items });

const collection = {
  info: {
    name: "Terminal Risk Monitor — API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  variable: [
    { key: "base_url", value: "http://localhost:3001" },
    { key: "terminal_id", value: "" },
    { key: "usuario_id", value: "" },
    { key: "area_id", value: "" },
    { key: "riesgo_id", value: "" },
    { key: "incidente_id", value: "" },
    { key: "plan_id", value: "" },
    { key: "escalamiento_id", value: "" },
    { key: "accion_id", value: "" },
    { key: "control_id", value: "" },
    { key: "kri_id", value: "" },
    { key: "reporte_id", value: "" },
    { key: "zona_id", value: "" },
    { key: "marcador_id", value: "" },
    { key: "comentario_id", value: "" },
    { key: "notificacion_id", value: "" },
    { key: "adjunto_id", value: "" }
  ],
  item: [
    folder("🟢 Health", [
      GET("GET /health", `${BASE}/health`)
    ]),

    folder("🏭 Terminales", [
      GET("Listar terminales", `${BASE}/api/trm/terminales`, autoSaveList("terminal_id")),
      POST("Crear terminal", `${BASE}/api/trm/terminales`, JSON.stringify({ nombre: "Terminal Norte", codigo: "TN-01", ubicacion: "Zona Industrial Norte", activa: true }, null, 2), autoSave("terminal_id")),
      GET("Obtener terminal por ID", `${BASE}/api/trm/terminales/{{terminal_id}}`),
      PATCH("Actualizar terminal", `${BASE}/api/trm/terminales/{{terminal_id}}`, JSON.stringify({ nombre: "Terminal Norte Actualizada" }, null, 2)),
      DELETE("Eliminar terminal", `${BASE}/api/trm/terminales/{{terminal_id}}`)
    ]),

    // Usuarios: se gestionan desde server.ts (/api/users) — Better Auth
    // Los IDs de usuario que se usan aquí son los de la tabla "user" de auth

    folder("🏢 Áreas", [
      GET("Listar áreas", `${BASE}/api/trm/areas?terminal_id={{terminal_id}}`, autoSaveList("area_id")),
      POST("Crear área", `${BASE}/api/trm/areas`, JSON.stringify({ nombre: "Operaciones", descripcion: "Área de operaciones portuarias", terminal_id: "{{terminal_id}}", activa: true }, null, 2), autoSave("area_id")),
      PATCH("Actualizar área", `${BASE}/api/trm/areas/{{area_id}}`, JSON.stringify({ descripcion: "Área de operaciones y logística" }, null, 2)),
      DELETE("Eliminar área", `${BASE}/api/trm/areas/{{area_id}}`)
    ]),

    folder("⚠️ Riesgos", [
      GET("Listar riesgos", `${BASE}/api/trm/riesgos?terminal_id={{terminal_id}}`, autoSaveList("riesgo_id")),
      POST("Crear riesgo", `${BASE}/api/trm/riesgos`, JSON.stringify({ terminal_id: "{{terminal_id}}", area_id: "{{area_id}}", responsable_id: "{{usuario_id}}", codigo: "RSG-001", nombre: "Falla en sistema de grúas", descripcion: "Riesgo de falla mecánica en grúas pórtico", categoria: "Operacional", probabilidad: 3, impacto: 4, nivel: "Alto", estado: "Activo" }, null, 2), autoSave("riesgo_id")),
      GET("Obtener riesgo por ID", `${BASE}/api/trm/riesgos/{{riesgo_id}}`),
      PATCH("Actualizar riesgo", `${BASE}/api/trm/riesgos/{{riesgo_id}}`, JSON.stringify({ estado: "En revisión", justificacion_cambio_estado: "Se detectaron nuevas evidencias" }, null, 2)),
      GET("Historial de estados", `${BASE}/api/trm/riesgos/{{riesgo_id}}/historial`),
      POST("Vincular control a riesgo", `${BASE}/api/trm/riesgos/{{riesgo_id}}/controles`, JSON.stringify({ control_id: "{{control_id}}", efectivo: true, observaciones: "Control verificado en auditoría" }, null, 2)),
      DELETE("Desvincular control de riesgo", `${BASE}/api/trm/riesgos/{{riesgo_id}}/controles/{{control_id}}`),
      DELETE("Eliminar riesgo", `${BASE}/api/trm/riesgos/{{riesgo_id}}`)
    ]),

    folder("🚨 Incidentes", [
      GET("Listar incidentes", `${BASE}/api/trm/incidentes?terminal_id={{terminal_id}}`, autoSaveList("incidente_id")),
      POST("Crear incidente", `${BASE}/api/trm/incidentes`, JSON.stringify({ terminal_id: "{{terminal_id}}", area_id: "{{area_id}}", responsable_id: "{{usuario_id}}", codigo: "INC-001", titulo: "Derrame de combustible en muelle 3", descripcion: "Derrame menor detectado durante operación de carga", severidad: "Grave", estado: "Abierto", fecha_ocurrencia: "2026-04-25" }, null, 2), autoSave("incidente_id")),
      GET("Obtener incidente por ID", `${BASE}/api/trm/incidentes/{{incidente_id}}`),
      PATCH("Actualizar incidente", `${BASE}/api/trm/incidentes/{{incidente_id}}`, JSON.stringify({ estado: "En investigación", observaciones_internas: "Se inició investigación formal" }, null, 2)),
      GET("Historial de estados", `${BASE}/api/trm/incidentes/{{incidente_id}}/historial`),
      DELETE("Eliminar incidente", `${BASE}/api/trm/incidentes/{{incidente_id}}`)
    ]),

    folder("📋 Planes de Mitigación", [
      GET("Listar planes", `${BASE}/api/trm/planes?terminal_id={{terminal_id}}`, autoSaveList("plan_id")),
      POST("Crear plan", `${BASE}/api/trm/planes`, JSON.stringify({ terminal_id: "{{terminal_id}}", riesgo_id: "{{riesgo_id}}", responsable_id: "{{usuario_id}}", codigo: "PLN-001", titulo: "Mantenimiento preventivo de grúas", descripcion: "Programa de mantenimiento trimestral", estado: "Pendiente", progreso: 0, fecha_inicio: "2026-05-01", fecha_limite: "2026-07-31" }, null, 2), autoSave("plan_id")),
      GET("Obtener plan por ID", `${BASE}/api/trm/planes/{{plan_id}}`),
      PATCH("Actualizar plan", `${BASE}/api/trm/planes/{{plan_id}}`, JSON.stringify({ estado: "En progreso", progreso: 25 }, null, 2)),
      POST("Registrar avance", `${BASE}/api/trm/planes/{{plan_id}}/avance`, JSON.stringify({ progreso_nuevo: 60, estado_nuevo: "En progreso", nota: "Se completó la primera fase", nombre_usuario: "Carlos Ramírez" }, null, 2)),
      GET("Historial de avance", `${BASE}/api/trm/planes/{{plan_id}}/historial`),
      DELETE("Eliminar plan", `${BASE}/api/trm/planes/{{plan_id}}`)
    ]),

    folder("📣 Escalamientos", [
      GET("Listar escalamientos", `${BASE}/api/trm/escalamientos?terminal_id={{terminal_id}}`, autoSaveList("escalamiento_id")),
      GET("Listar escalamientos pendientes", `${BASE}/api/trm/escalamientos?estado=Enviado`),
      POST("Crear escalamiento", `${BASE}/api/trm/escalamientos`, JSON.stringify({ terminal_id: "{{terminal_id}}", creado_por: "{{usuario_id}}", codigo: "ESC-001", motivo: "Plan PLN-001 vencido sin completar", urgencia: "Alta", estado: "Enviado", nivel_escalamiento: 1, auto_generado: false }, null, 2), autoSave("escalamiento_id")),
      GET("Obtener escalamiento por ID", `${BASE}/api/trm/escalamientos/{{escalamiento_id}}`),
      PATCH("Actualizar escalamiento", `${BASE}/api/trm/escalamientos/{{escalamiento_id}}`, JSON.stringify({ nivel_escalamiento: 2 }, null, 2)),
      POST("Responder escalamiento", `${BASE}/api/trm/escalamientos/{{escalamiento_id}}/responder`, JSON.stringify({ respuesta_texto: "Se tomaron acciones correctivas inmediatas", respuesta_autor: "Gerente General", respuesta_usuario_id: "{{usuario_id}}" }, null, 2)),
      GET("Historial del escalamiento", `${BASE}/api/trm/escalamientos/{{escalamiento_id}}/historial`),
      DELETE("Eliminar escalamiento", `${BASE}/api/trm/escalamientos/{{escalamiento_id}}`)
    ]),

    folder("✅ Acciones Correctivas", [
      GET("Listar acciones", `${BASE}/api/trm/acciones?terminal_id={{terminal_id}}`, autoSaveList("accion_id")),
      POST("Crear acción", `${BASE}/api/trm/acciones`, JSON.stringify({ terminal_id: "{{terminal_id}}", responsable_id: "{{usuario_id}}", titulo: "Revisión de protocolos de seguridad", descripcion: "Actualizar manual de procedimientos", estado: "Pendiente", fecha_limite: "2026-06-30", prioridad: "Alta", riesgo_id: "{{riesgo_id}}", escalamiento_id: "{{escalamiento_id}}" }, null, 2), autoSave("accion_id")),
      PATCH("Actualizar acción", `${BASE}/api/trm/acciones/{{accion_id}}`, JSON.stringify({ estado: "En progreso", prioridad: "Inmediata" }, null, 2)),
      DELETE("Eliminar acción", `${BASE}/api/trm/acciones/{{accion_id}}`)
    ]),

    folder("🛡️ Controles", [
      GET("Listar controles", `${BASE}/api/trm/controles`, autoSaveList("control_id")),
      POST("Crear control", `${BASE}/api/trm/controles`, JSON.stringify({ nombre: "Inspección visual diaria", descripcion: "Revisión visual de equipos al inicio de turno", tipo: "Preventivo", activo: true }, null, 2), autoSave("control_id")),
      PATCH("Actualizar control", `${BASE}/api/trm/controles/{{control_id}}`, JSON.stringify({ tipo: "Detectivo" }, null, 2)),
      DELETE("Eliminar control", `${BASE}/api/trm/controles/{{control_id}}`)
    ]),

    folder("📊 KRI — Indicadores", [
      GET("Listar KRIs", `${BASE}/api/trm/kri?terminal_id={{terminal_id}}`, autoSaveList("kri_id")),
      POST("Crear KRI", `${BASE}/api/trm/kri`, JSON.stringify({ terminal_id: "{{terminal_id}}", nombre: "Tasa de incidentes por mes", descripcion: "Número de incidentes registrados mensualmente", unidad: "incidentes", umbral_alerta: 5, umbral_critico: 10, activo: true }, null, 2), autoSave("kri_id")),
      PATCH("Actualizar KRI", `${BASE}/api/trm/kri/{{kri_id}}`, JSON.stringify({ umbral_alerta: 4 }, null, 2)),
      GET("Listar valores del KRI", `${BASE}/api/trm/kri/{{kri_id}}/valores`),
      POST("Registrar valor de KRI", `${BASE}/api/trm/kri/{{kri_id}}/valores`, JSON.stringify({ terminal_id: "{{terminal_id}}", periodo: "2026-04-01", valor: 3, estado: "OK", registrado_por: "{{usuario_id}}" }, null, 2)),
      DELETE("Eliminar KRI", `${BASE}/api/trm/kri/{{kri_id}}`)
    ]),

    folder("💬 Comentarios", [
      GET("Listar comentarios de un riesgo", `${BASE}/api/trm/comentarios?entidad_tipo=riesgo&entidad_id={{riesgo_id}}`, autoSaveList("comentario_id")),
      GET("Listar comentarios de un incidente", `${BASE}/api/trm/comentarios?entidad_tipo=incidente&entidad_id={{incidente_id}}`),
      POST("Crear comentario", `${BASE}/api/trm/comentarios`, JSON.stringify({ terminal_id: "{{terminal_id}}", entidad_tipo: "riesgo", entidad_id: "{{riesgo_id}}", texto: "Se requiere revisión urgente antes del próximo turno", visible_para: "supervisores", autor_id: "{{usuario_id}}", nombre_autor: "Carlos Ramírez" }, null, 2), autoSave("comentario_id")),
      DELETE("Eliminar comentario", `${BASE}/api/trm/comentarios/{{comentario_id}}`)
    ]),

    folder("🔔 Notificaciones", [
      GET("Listar notificaciones del usuario", `${BASE}/api/trm/notificaciones?usuario_id={{usuario_id}}`, autoSaveList("notificacion_id")),
      GET("Solo no leídas", `${BASE}/api/trm/notificaciones?usuario_id={{usuario_id}}&solo_no_leidas=true`),
      PATCH("Marcar notificación como leída", `${BASE}/api/trm/notificaciones/{{notificacion_id}}/leer`, "{}"),
      PATCH("Marcar todas como leídas", `${BASE}/api/trm/notificaciones/leer-todas`, JSON.stringify({ usuario_id: "{{usuario_id}}" }, null, 2))
    ]),

    folder("📎 Adjuntos", [
      GET("Listar adjuntos de un riesgo", `${BASE}/api/trm/adjuntos?entidad_tipo=riesgo&entidad_id={{riesgo_id}}`, autoSaveList("adjunto_id")),
      POST("Registrar adjunto", `${BASE}/api/trm/adjuntos`, JSON.stringify({ terminal_id: "{{terminal_id}}", entidad_tipo: "riesgo", entidad_id: "{{riesgo_id}}", nombre_archivo: "informe_riesgo.pdf", tipo_mime: "application/pdf", tamano_bytes: 204800, url_almacenamiento: "https://storage.empresa.com/adjuntos/informe_riesgo.pdf", descripcion: "Informe técnico del riesgo", subido_por: "{{usuario_id}}" }, null, 2), autoSave("adjunto_id")),
      DELETE("Eliminar adjunto", `${BASE}/api/trm/adjuntos/{{adjunto_id}}`)
    ]),

    folder("📅 Reportes Programados", [
      GET("Listar reportes", `${BASE}/api/trm/reportes?terminal_id={{terminal_id}}`, autoSaveList("reporte_id")),
      POST("Crear reporte programado", `${BASE}/api/trm/reportes`, JSON.stringify({ terminal_id: "{{terminal_id}}", nombre: "Reporte Ejecutivo Mensual", tipo: "ejecutivo_mensual", frecuencia: "mensual", dia_envio: 1, hora_envio: "08:00", destinatarios: ["gerencia@empresa.com", "riesgos@empresa.com"], formato: "pdf", activo: true, creado_por: "{{usuario_id}}" }, null, 2), autoSave("reporte_id")),
      PATCH("Actualizar reporte", `${BASE}/api/trm/reportes/{{reporte_id}}`, JSON.stringify({ activo: false }, null, 2)),
      DELETE("Eliminar reporte", `${BASE}/api/trm/reportes/{{reporte_id}}`)
    ]),

    folder("🗺️ Mapa", [
      GET("Listar zonas", `${BASE}/api/trm/mapa/zonas?terminal_id={{terminal_id}}`, autoSaveList("zona_id")),
      POST("Crear zona", `${BASE}/api/trm/mapa/zonas`, JSON.stringify({ terminal_id: "{{terminal_id}}", nombre: "Zona Muelle Norte", nivel_riesgo: "Alto", orden: 1 }, null, 2), autoSave("zona_id")),
      PATCH("Actualizar zona", `${BASE}/api/trm/mapa/zonas/{{zona_id}}`, JSON.stringify({ nivel_riesgo: "Crítico", total_riesgos: 3 }, null, 2)),
      GET("Listar marcadores", `${BASE}/api/trm/mapa/marcadores?terminal_id={{terminal_id}}`, autoSaveList("marcador_id")),
      POST("Crear marcador", `${BASE}/api/trm/mapa/marcadores`, JSON.stringify({ terminal_id: "{{terminal_id}}", zona_id: "{{zona_id}}", lat: 10.9685, lng: -74.7813, titulo: "Grúa Pórtico #3", entidad_tipo: "riesgo", entidad_id: "{{riesgo_id}}", nivel: "Alto", color_hex: "#EF4444", pulsante: true, tooltip: "Riesgo de falla mecánica" }, null, 2), autoSave("marcador_id")),
      PATCH("Actualizar marcador", `${BASE}/api/trm/mapa/marcadores/{{marcador_id}}`, JSON.stringify({ nivel: "Medio", color_hex: "#F59E0B", pulsante: false }, null, 2)),
      DELETE("Eliminar marcador", `${BASE}/api/trm/mapa/marcadores/{{marcador_id}}`)
    ]),

    folder("📈 Dashboard", [
      GET("Métricas en tiempo real", `${BASE}/api/trm/dashboard`),
      GET("Métricas cacheadas por terminal", `${BASE}/api/trm/dashboard/metricas?terminal_id={{terminal_id}}`),
      POST("Guardar métricas cacheadas", `${BASE}/api/trm/dashboard/metricas`, JSON.stringify({ terminal_id: "{{terminal_id}}", periodo: "2026-04-01", total_riesgos_activos: 12, riesgos_criticos: 2, riesgos_altos: 5, riesgos_medios: 3, riesgos_bajos: 2, total_incidentes_mes: 4, incidentes_criticos_mes: 1, planes_activos: 8, planes_vencidos: 1, escalamientos_pendientes: 2, acciones_vencidas: 0 }, null, 2))
    ]),

    folder("📝 Auditoría", [
      GET("Listar logs de auditoría", `${BASE}/api/trm/auditoria?terminal_id={{terminal_id}}`),
      GET("Filtrar por tabla", `${BASE}/api/trm/auditoria?tabla=riesgos`),
      POST("Registrar evento de auditoría", `${BASE}/api/trm/auditoria`, JSON.stringify({ terminal_id: "{{terminal_id}}", usuario_id: "{{usuario_id}}", accion: "UPDATE", tabla: "riesgos", registro_id: "{{riesgo_id}}", datos_anteriores: "{\"estado\":\"Activo\"}", datos_nuevos: "{\"estado\":\"En revisión\"}", modulo_registro_id: "{{riesgo_id}}", duracion_ms: 45 }, null, 2))
    ])
  ]
};

import { writeFileSync } from "fs";
writeFileSync("TRM-API.postman_collection.json", JSON.stringify(collection, null, 2));
console.log("✅ TRM-API.postman_collection.json generado correctamente");
