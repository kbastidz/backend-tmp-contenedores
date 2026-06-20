-- =============================================================
-- Script de creación completa de base de datos
-- Proyecto: Terminal Risk Monitor (TRM)
-- Schemas: public (Better Auth + RBAC) | trm (dominio TRM)
-- =============================================================

-- Extensión para UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- SCHEMA PUBLIC — Better Auth + RBAC
-- =============================================================

-- ── user ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user" (
    id          TEXT PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL UNIQUE,
    "emailVerified" BOOLEAN NOT NULL,
    image       TEXT,
    "createdAt" TIMESTAMP   NOT NULL,
    "updatedAt" TIMESTAMP   NOT NULL
);

-- ── session ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session (
    id          TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMP   NOT NULL,
    token       TEXT        NOT NULL UNIQUE,
    "createdAt" TIMESTAMP   NOT NULL,
    "updatedAt" TIMESTAMP   NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId"    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

-- ── account ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account (
    id                      TEXT PRIMARY KEY,
    "accountId"             TEXT        NOT NULL,
    "providerId"            TEXT        NOT NULL,
    "userId"                TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accessToken"           TEXT,
    "refreshToken"          TEXT,
    "idToken"               TEXT,
    "accessTokenExpiresAt"  TIMESTAMP,
    "refreshTokenExpiresAt" TIMESTAMP,
    scope                   TEXT,
    password                TEXT,
    "createdAt"             TIMESTAMP   NOT NULL,
    "updatedAt"             TIMESTAMP   NOT NULL
);

-- ── verification ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification (
    id          TEXT PRIMARY KEY,
    identifier  TEXT        NOT NULL,
    value       TEXT        NOT NULL,
    "expiresAt" TIMESTAMP   NOT NULL,
    "createdAt" TIMESTAMP,
    "updatedAt" TIMESTAMP
);

-- ── role ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    active      BOOLEAN     DEFAULT TRUE,
    "createdAt" TIMESTAMP   DEFAULT NOW()
);

-- ── option ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS option (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    route       TEXT        NOT NULL UNIQUE,
    icon        TEXT,
    module      TEXT,
    description TEXT,
    active      BOOLEAN     DEFAULT TRUE
);

-- ── permission ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permission (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    action      TEXT        NOT NULL UNIQUE,
    description TEXT
);

-- ── user_role ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_role (
    "userId"    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "roleId"    UUID        NOT NULL REFERENCES role(id)   ON DELETE CASCADE,
    PRIMARY KEY ("userId", "roleId")
);

-- ── role_option_permission ────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_option_permission (
    "roleId"        UUID    NOT NULL REFERENCES role(id)       ON DELETE CASCADE,
    "optionId"      UUID    NOT NULL REFERENCES option(id)     ON DELETE CASCADE,
    "permissionId"  UUID    NOT NULL REFERENCES permission(id) ON DELETE CASCADE,
    PRIMARY KEY ("roleId", "optionId", "permissionId")
);

-- =============================================================
-- SCHEMA TRM
-- =============================================================

CREATE SCHEMA IF NOT EXISTS trm;

-- ── trm.terminal ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.terminal (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(200) NOT NULL,
    codigo      VARCHAR(50),
    ubicacion   TEXT,
    activa      BOOLEAN     DEFAULT TRUE,
    creado_en   TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.areas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.areas (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(150) NOT NULL,
    descripcion TEXT,
    terminal_id UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    activa      BOOLEAN     DEFAULT TRUE
);

-- ── trm.equipos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.equipos (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    area_id         UUID        REFERENCES trm.areas(id),
    codigo          VARCHAR(30)  NOT NULL,
    nombre          VARCHAR(150) NOT NULL,
    tipo            VARCHAR(80),
    ciclo_mtto_dias INTEGER     DEFAULT 30,
    ultimo_mtto     DATE,
    proximo_mtto    DATE,
    estado          VARCHAR(30)  DEFAULT 'OK',
    activo          BOOLEAN     DEFAULT TRUE,
    creado_en       TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.controles ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.controles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(300) NOT NULL,
    descripcion TEXT,
    tipo        VARCHAR(100),
    activo      BOOLEAN     DEFAULT TRUE
);

-- ── trm.riesgos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.riesgos (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id                 UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    area_id                     UUID        REFERENCES trm.areas(id),
    responsable_id              TEXT        REFERENCES "user"(id),
    responsable_accion_id       TEXT        REFERENCES "user"(id),
    codigo                      VARCHAR(50),
    nombre                      VARCHAR(300) NOT NULL,
    descripcion                 TEXT,
    causa                       TEXT,
    categoria                   VARCHAR(100),
    probabilidad                INTEGER,
    impacto                     INTEGER,
    score                       INTEGER,
    nivel                       VARCHAR(20),
    estado                      VARCHAR(30)  DEFAULT 'Activo',
    proxima_revision            DATE,
    observaciones_internas      TEXT,
    justificacion_cambio_estado TEXT,
    antecedentes_descripcion    TEXT,
    score_anterior              INTEGER,
    nivel_anterior              VARCHAR(20),
    creado_en                   TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en              TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.riesgos_controles ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.riesgos_controles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    riesgo_id   UUID        NOT NULL REFERENCES trm.riesgos(id)   ON DELETE CASCADE,
    control_id  UUID        NOT NULL REFERENCES trm.controles(id) ON DELETE CASCADE,
    efectivo    BOOLEAN     DEFAULT FALSE,
    observaciones TEXT,
    evaluado_en TIMESTAMPTZ
);

-- ── trm.incidentes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.incidentes (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id             UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    area_id                 UUID        REFERENCES trm.areas(id),
    equipo_id               UUID        REFERENCES trm.equipos(id),
    responsable_id          TEXT        REFERENCES "user"(id),
    responsable_nombre      VARCHAR(200),
    codigo                  VARCHAR(50),
    titulo                  VARCHAR(300) NOT NULL,
    descripcion             TEXT,
    severidad               VARCHAR(30),
    estado                  VARCHAR(30)  DEFAULT 'Abierto',
    fecha_ocurrencia        DATE,
    hora_ocurrencia         TIME,
    turno                   VARCHAR(30),
    causa_inmediata         TEXT,
    causa_raiz              TEXT,
    acciones_inmediatas     TEXT,
    testigos                TEXT,
    factores_contribuyentes TEXT,
    lecciones_aprendidas    TEXT,
    observaciones_internas  TEXT,
    motivo_cierre           TEXT,
    riesgo_id               UUID        REFERENCES trm.riesgos(id),
    creado_en               TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en          TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.incidentes_riesgos (N:M) ─────────────────────────────
CREATE TABLE IF NOT EXISTS trm.incidentes_riesgos (
    incidente_id UUID NOT NULL REFERENCES trm.incidentes(id) ON DELETE CASCADE,
    riesgo_id    UUID NOT NULL REFERENCES trm.riesgos(id)    ON DELETE CASCADE,
    PRIMARY KEY (incidente_id, riesgo_id)
);

-- ── trm.planes_mitigacion ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.planes_mitigacion (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id                 UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    area_id                     UUID        REFERENCES trm.areas(id),
    riesgo_id                   UUID        REFERENCES trm.riesgos(id),
    responsable_id              TEXT        REFERENCES "user"(id),
    codigo                      VARCHAR(50),
    titulo                      VARCHAR(300) NOT NULL,
    descripcion                 TEXT,
    objetivo                    TEXT,
    tipo_control                TEXT,
    estrategia                  TEXT,
    indicador                   TEXT,
    norma                       TEXT,
    nota_avance                 TEXT,
    recursos_adicionales        TEXT,
    justificacion_cambio        TEXT,
    observaciones               TEXT,
    aprobador                   TEXT,
    estado                      VARCHAR(30)  DEFAULT 'Pendiente',
    progreso                    INTEGER     DEFAULT 0,
    fecha_inicio                DATE,
    fecha_limite                DATE,
    fecha_revision              DATE,
    observaciones_responsable   TEXT,
    evidencia_cierre            TEXT,
    justificacion_cambio_estado TEXT,
    progreso_anterior           INTEGER     DEFAULT 0,
    estado_anterior             VARCHAR(30),
    porcentaje_efectividad      NUMERIC(5,2),
    creado_en                   TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en              TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.planes_tareas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.planes_tareas (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID        NOT NULL REFERENCES trm.planes_mitigacion(id) ON DELETE CASCADE,
    descripcion     VARCHAR(500) NOT NULL,
    responsable     VARCHAR(200),
    fecha_limite    DATE,
    estado          VARCHAR(30)  DEFAULT 'Pendiente',
    orden           INTEGER     DEFAULT 0,
    creado_en       TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.planes_avance_historial ───────────────────────────────
CREATE TABLE IF NOT EXISTS trm.planes_avance_historial (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID        NOT NULL REFERENCES trm.planes_mitigacion(id) ON DELETE CASCADE,
    progreso_anterior   INTEGER,
    progreso_nuevo      INTEGER     NOT NULL,
    estado_anterior     VARCHAR(30),
    estado_nuevo        VARCHAR(30),
    nota                TEXT,
    actualizado_por     TEXT        REFERENCES "user"(id),
    nombre_usuario      VARCHAR(200),
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.escalamientos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.escalamientos (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id         UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    creado_por          TEXT        REFERENCES "user"(id),
    codigo              VARCHAR(50),
    motivo              TEXT        NOT NULL,
    urgencia            VARCHAR(30),
    estado              VARCHAR(30)  DEFAULT 'Enviado',
    re_escalado_de      UUID,
    nivel_escalamiento  INTEGER     DEFAULT 1,
    respuesta_texto     TEXT,
    respuesta_autor     VARCHAR(200),
    respuesta_usuario_id TEXT       REFERENCES "user"(id),
    auto_generado       BOOLEAN     DEFAULT FALSE,
    horas_sin_respuesta INTEGER,
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.escalamientos_planes (N:M) ────────────────────────────
CREATE TABLE IF NOT EXISTS trm.escalamientos_planes (
    escalamiento_id UUID NOT NULL REFERENCES trm.escalamientos(id)      ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES trm.planes_mitigacion(id)  ON DELETE CASCADE,
    PRIMARY KEY (escalamiento_id, plan_id)
);

-- ── trm.escalamientos_historial ───────────────────────────────
CREATE TABLE IF NOT EXISTS trm.escalamientos_historial (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    escalamiento_id UUID        NOT NULL REFERENCES trm.escalamientos(id) ON DELETE CASCADE,
    accion          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    realizado_por   VARCHAR(200),
    usuario_id      TEXT        REFERENCES "user"(id),
    color_hex       VARCHAR(7)  DEFAULT '#185FA5',
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.acciones_correctivas ──────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.acciones_correctivas (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    responsable_id  TEXT        REFERENCES "user"(id),
    titulo          VARCHAR(300) NOT NULL,
    descripcion     TEXT,
    estado          VARCHAR(30)  DEFAULT 'Pendiente',
    fecha_limite    DATE,
    escalamiento_id UUID        REFERENCES trm.escalamientos(id),
    riesgo_id       UUID        REFERENCES trm.riesgos(id),
    prioridad       VARCHAR(20)  DEFAULT 'Media',
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.kri ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.kri (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    nombre          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    unidad          VARCHAR(50),
    umbral_alerta   NUMERIC(10,2),
    umbral_critico  NUMERIC(10,2),
    activo          BOOLEAN     DEFAULT TRUE
);

-- ── trm.kri_valores ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.kri_valores (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    kri_id          UUID        NOT NULL REFERENCES trm.kri(id) ON DELETE CASCADE,
    terminal_id     UUID        REFERENCES trm.terminal(id),
    periodo         DATE        NOT NULL,
    valor           NUMERIC(10,2),
    estado          VARCHAR(20)  DEFAULT 'OK',
    registrado_por  TEXT        REFERENCES "user"(id),
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.riesgos_estados_historial ─────────────────────────────
CREATE TABLE IF NOT EXISTS trm.riesgos_estados_historial (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    riesgo_id       UUID        NOT NULL REFERENCES trm.riesgos(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(30),
    estado_nuevo    VARCHAR(30)  NOT NULL,
    justificacion   TEXT,
    cambiado_por    TEXT        REFERENCES "user"(id),
    nombre_usuario  VARCHAR(200),
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.incidentes_estados_historial ──────────────────────────
CREATE TABLE IF NOT EXISTS trm.incidentes_estados_historial (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    incidente_id    UUID        NOT NULL REFERENCES trm.incidentes(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(30),
    estado_nuevo    VARCHAR(30)  NOT NULL,
    justificacion   TEXT,
    cambiado_por    TEXT        REFERENCES "user"(id),
    nombre_usuario  VARCHAR(200),
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.mapa_zonas ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.mapa_zonas (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    geojson         TEXT,
    nombre          VARCHAR(150),
    nivel_riesgo    VARCHAR(20),
    total_riesgos   INTEGER     DEFAULT 0,
    total_incidentes INTEGER    DEFAULT 0,
    orden           INTEGER     DEFAULT 0
);

-- ── trm.mapa_marcadores ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.mapa_marcadores (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    zona_id         UUID        REFERENCES trm.mapa_zonas(id),
    lat             NUMERIC(10,7),
    lng             NUMERIC(10,7),
    titulo          VARCHAR(200),
    entidad_tipo    VARCHAR(30),
    entidad_id      UUID,
    nivel           VARCHAR(20),
    color_hex       VARCHAR(7),
    pulsante        BOOLEAN     DEFAULT FALSE,
    tooltip         TEXT,
    actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.comentarios ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.comentarios (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    entidad_tipo    VARCHAR(30)  NOT NULL,
    entidad_id      UUID        NOT NULL,
    texto           TEXT        NOT NULL,
    visible_para    VARCHAR(30)  DEFAULT 'todos',
    autor_id        TEXT        REFERENCES "user"(id),
    nombre_autor    VARCHAR(200),
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.notificaciones ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.notificaciones (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    usuario_id      TEXT        REFERENCES "user"(id) ON DELETE CASCADE,
    tipo            VARCHAR(50)  NOT NULL,
    titulo          VARCHAR(200) NOT NULL,
    mensaje         TEXT,
    entidad_tipo    VARCHAR(30),
    entidad_id      UUID,
    leida           BOOLEAN     DEFAULT FALSE,
    leida_en        TIMESTAMPTZ,
    nivel           VARCHAR(20)  DEFAULT 'info',
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.adjuntos ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.adjuntos (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id         UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    entidad_tipo        VARCHAR(30)  NOT NULL,
    entidad_id          UUID        NOT NULL,
    nombre_archivo      VARCHAR(300) NOT NULL,
    tipo_mime           VARCHAR(100),
    tamano_bytes        INTEGER,
    url_almacenamiento  TEXT,
    descripcion         TEXT,
    subido_por          TEXT        REFERENCES "user"(id),
    subido_en           TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.reportes_programados ──────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.reportes_programados (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id) ON DELETE CASCADE,
    nombre          VARCHAR(200) NOT NULL,
    tipo            VARCHAR(30)  DEFAULT 'ejecutivo_mensual',
    frecuencia      VARCHAR(20)  DEFAULT 'mensual',
    dia_envio       INTEGER,
    hora_envio      TIME        DEFAULT '08:00',
    destinatarios   TEXT[],
    formato         VARCHAR(10)  DEFAULT 'pdf',
    activo          BOOLEAN     DEFAULT TRUE,
    ultimo_envio    TIMESTAMPTZ,
    proximo_envio   TIMESTAMPTZ,
    creado_por      TEXT        REFERENCES "user"(id),
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.exportaciones ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.exportaciones (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        REFERENCES trm.terminal(id),
    usuario_id      TEXT        REFERENCES "user"(id),
    tipo            VARCHAR(100),
    formato         VARCHAR(20),
    url             TEXT,
    estado          VARCHAR(20)  DEFAULT 'Completado',
    error_mensaje   TEXT,
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.auditoria_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.auditoria_log (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id         UUID        REFERENCES trm.terminal(id),
    usuario_id          TEXT        REFERENCES "user"(id),
    accion              VARCHAR(100) NOT NULL,
    tabla               VARCHAR(100),
    registro_id         VARCHAR(100),
    datos_anteriores    TEXT,
    datos_nuevos        TEXT,
    modulo_registro_id  VARCHAR(100),
    duracion_ms         INTEGER,
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

-- ── trm.dashboard_metricas ────────────────────────────────────
CREATE TABLE IF NOT EXISTS trm.dashboard_metricas (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id                 UUID        NOT NULL REFERENCES trm.terminal(id) ON DELETE CASCADE,
    calculado_en                TIMESTAMPTZ DEFAULT NOW(),
    periodo                     DATE        NOT NULL,
    total_riesgos_activos       INTEGER     DEFAULT 0,
    riesgos_criticos            INTEGER     DEFAULT 0,
    riesgos_altos               INTEGER     DEFAULT 0,
    riesgos_medios              INTEGER     DEFAULT 0,
    riesgos_bajos               INTEGER     DEFAULT 0,
    total_incidentes_mes        INTEGER     DEFAULT 0,
    incidentes_criticos_mes     INTEGER     DEFAULT 0,
    incidentes_graves_mes       INTEGER     DEFAULT 0,
    dias_sin_accidentes         INTEGER     DEFAULT 0,
    planes_activos              INTEGER     DEFAULT 0,
    planes_vencidos             INTEGER     DEFAULT 0,
    planes_completados_mes      INTEGER     DEFAULT 0,
    efectividad_controles_pct   NUMERIC(5,2),
    acciones_vencidas           INTEGER     DEFAULT 0,
    acciones_pendientes         INTEGER     DEFAULT 0,
    escalamientos_pendientes    INTEGER     DEFAULT 0
);

-- =============================================================
-- ÍNDICES útiles para rendimiento
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_riesgos_terminal    ON trm.riesgos(terminal_id);
CREATE INDEX IF NOT EXISTS idx_riesgos_estado       ON trm.riesgos(estado);
CREATE INDEX IF NOT EXISTS idx_incidentes_terminal  ON trm.incidentes(terminal_id);
CREATE INDEX IF NOT EXISTS idx_incidentes_estado    ON trm.incidentes(estado);
CREATE INDEX IF NOT EXISTS idx_planes_terminal      ON trm.planes_mitigacion(terminal_id);
CREATE INDEX IF NOT EXISTS idx_planes_estado        ON trm.planes_mitigacion(estado);
CREATE INDEX IF NOT EXISTS idx_planes_riesgo        ON trm.planes_mitigacion(riesgo_id);
CREATE INDEX IF NOT EXISTS idx_escalamientos_term   ON trm.escalamientos(terminal_id);
CREATE INDEX IF NOT EXISTS idx_escalamientos_estado ON trm.escalamientos(estado);
CREATE INDEX IF NOT EXISTS idx_kri_valores_periodo  ON trm.kri_valores(kri_id, periodo);
CREATE INDEX IF NOT EXISTS idx_notif_usuario        ON trm.notificaciones(usuario_id, leida);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla      ON trm.auditoria_log(tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_session_userId       ON session("userId");
CREATE INDEX IF NOT EXISTS idx_account_userId       ON account("userId");

-- =============================================================
-- SEED — Permisos base
-- =============================================================

INSERT INTO permission (name, action, description) VALUES
    ('Lectura',       'READ',   'Permiso de lectura'),
    ('Escritura',     'WRITE',  'Permiso de escritura'),
    ('Actualización', 'UPDATE', 'Permiso de actualización'),
    ('Eliminación',   'DELETE', 'Permiso de eliminación'),
    ('Exportación',   'EXPORT', 'Permiso de exportación')
ON CONFLICT (action) DO NOTHING;
