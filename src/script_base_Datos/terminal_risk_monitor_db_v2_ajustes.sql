-- ============================================================
--  TERMINAL RISK MONITOR — Ajustes y mejoras v2
--  Complementa terminal_risk_monitor_db.sql (v1)
--  Ejecutar DESPUÉS del script original
-- ============================================================

SET search_path TO trm, public;

-- ============================================================
--  BLOQUE 1 · AJUSTES A TABLAS EXISTENTES
-- ============================================================

-- ── riesgos ─────────────────────────────────────────────────
ALTER TABLE riesgos
    ADD COLUMN IF NOT EXISTS observaciones_internas     TEXT,
    ADD COLUMN IF NOT EXISTS justificacion_cambio_estado TEXT,
    ADD COLUMN IF NOT EXISTS antecedentes_descripcion   TEXT,
    ADD COLUMN IF NOT EXISTS score_anterior             INTEGER,   -- para rastrear cambios de score
    ADD COLUMN IF NOT EXISTS nivel_anterior             VARCHAR(20);

-- ── incidentes ──────────────────────────────────────────────
ALTER TABLE incidentes
    ADD COLUMN IF NOT EXISTS observaciones_internas     TEXT,
    ADD COLUMN IF NOT EXISTS motivo_cierre              TEXT,
    ADD COLUMN IF NOT EXISTS riesgo_vinculado_principal UUID REFERENCES riesgos(id);  -- vínculo directo principal

-- ── planes_mitigacion ───────────────────────────────────────
ALTER TABLE planes_mitigacion
    ADD COLUMN IF NOT EXISTS observaciones_responsable  TEXT,
    ADD COLUMN IF NOT EXISTS evidencia_cierre           TEXT,
    ADD COLUMN IF NOT EXISTS justificacion_cambio_estado TEXT,
    ADD COLUMN IF NOT EXISTS progreso_anterior          INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estado_anterior            VARCHAR(30),
    ADD COLUMN IF NOT EXISTS porcentaje_efectividad     NUMERIC(5,2); -- efectividad post-cierre

-- ── escalamientos ───────────────────────────────────────────
ALTER TABLE escalamientos
    ADD COLUMN IF NOT EXISTS re_escalado_de             UUID REFERENCES escalamientos(id),  -- escalamiento padre
    ADD COLUMN IF NOT EXISTS nivel_escalamiento         INTEGER DEFAULT 1,  -- 1=área, 2=gerencia, 3=general
    ADD COLUMN IF NOT EXISTS respuesta_texto            TEXT,
    ADD COLUMN IF NOT EXISTS respuesta_autor            VARCHAR(200),
    ADD COLUMN IF NOT EXISTS respuesta_usuario_id       UUID REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS auto_generado              BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS horas_sin_respuesta        INTEGER;  -- calculado en app

-- ── acciones_correctivas ────────────────────────────────────
ALTER TABLE acciones_correctivas
    ADD COLUMN IF NOT EXISTS escalamiento_id            UUID REFERENCES escalamientos(id),
    ADD COLUMN IF NOT EXISTS riesgo_id                  UUID REFERENCES riesgos(id),
    ADD COLUMN IF NOT EXISTS prioridad                  VARCHAR(20) DEFAULT 'Media'
                             CHECK (prioridad IN ('Inmediata','Alta','Media','Baja'));

-- ── kri_valores ─────────────────────────────────────────────
-- Reemplazar columna generada que no calcula bien sin la dirección
ALTER TABLE kri_valores DROP COLUMN IF EXISTS estado;
ALTER TABLE kri_valores
    ADD COLUMN IF NOT EXISTS estado                     VARCHAR(20) DEFAULT 'OK'
                             CHECK (estado IN ('OK','Alerta','Crítico','Sin dato'));

-- ── auditoria_log ───────────────────────────────────────────
ALTER TABLE auditoria_log
    ADD COLUMN IF NOT EXISTS modulo_registro_id         VARCHAR(100),  -- ID del registro afectado
    ADD COLUMN IF NOT EXISTS duracion_ms                INTEGER;        -- tiempo que tomó la operación

-- ── exportaciones ───────────────────────────────────────────
ALTER TABLE exportaciones
    ADD COLUMN IF NOT EXISTS estado                     VARCHAR(20) DEFAULT 'Completado'
                             CHECK (estado IN ('Procesando','Completado','Error')),
    ADD COLUMN IF NOT EXISTS error_mensaje              TEXT;

-- ============================================================
--  BLOQUE 2 · TABLAS NUEVAS
-- ============================================================

-- ── 2.1 Historial de eventos de escalamiento ────────────────
CREATE TABLE IF NOT EXISTS escalamientos_historial (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escalamiento_id     UUID NOT NULL REFERENCES escalamientos(id) ON DELETE CASCADE,
    accion              VARCHAR(100) NOT NULL,  -- 'Creado', 'Notificado', 'Respondido', 'Re-escalado', 'Cerrado'
    descripcion         TEXT,
    realizado_por       VARCHAR(200),           -- nombre o 'Sistema TRM'
    usuario_id          UUID REFERENCES usuarios(id),
    color_hex           VARCHAR(7) DEFAULT '#185FA5',
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esc_hist_esc ON escalamientos_historial(escalamiento_id);
CREATE INDEX IF NOT EXISTS idx_esc_hist_ts  ON escalamientos_historial(creado_en DESC);

-- ── 2.2 Actualizaciones de avance de planes ─────────────────
CREATE TABLE IF NOT EXISTS planes_avance_historial (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id             UUID NOT NULL REFERENCES planes_mitigacion(id) ON DELETE CASCADE,
    progreso_anterior   INTEGER,
    progreso_nuevo      INTEGER NOT NULL,
    estado_anterior     VARCHAR(30),
    estado_nuevo        VARCHAR(30),
    nota                TEXT,                   -- nota del responsable al actualizar
    actualizado_por     UUID REFERENCES usuarios(id),
    nombre_usuario      VARCHAR(200),           -- desnormalizado
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_avance_plan ON planes_avance_historial(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_avance_ts   ON planes_avance_historial(creado_en DESC);

-- ── 2.3 Historial de cambios de estado de riesgo ────────────
CREATE TABLE IF NOT EXISTS riesgos_estados_historial (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    riesgo_id           UUID NOT NULL REFERENCES riesgos(id) ON DELETE CASCADE,
    estado_anterior     VARCHAR(30),
    estado_nuevo        VARCHAR(30) NOT NULL,
    justificacion       TEXT,
    cambiado_por        UUID REFERENCES usuarios(id),
    nombre_usuario      VARCHAR(200),
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_riesc_hist_riesgo ON riesgos_estados_historial(riesgo_id);

-- ── 2.4 Historial de cambios de estado de incidente ─────────
CREATE TABLE IF NOT EXISTS incidentes_estados_historial (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incidente_id        UUID NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
    estado_anterior     VARCHAR(30),
    estado_nuevo        VARCHAR(30) NOT NULL,
    justificacion       TEXT,
    cambiado_por        UUID REFERENCES usuarios(id),
    nombre_usuario      VARCHAR(200),
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incesc_hist_inc ON incidentes_estados_historial(incidente_id);

-- ── 2.5 Notas y comentarios internos (polimórfico) ──────────
-- Permite agregar comentarios a riesgos, incidentes o planes
CREATE TABLE IF NOT EXISTS comentarios (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    terminal_id         UUID REFERENCES terminal(id) ON DELETE CASCADE,
    entidad_tipo        VARCHAR(30) NOT NULL
                        CHECK (entidad_tipo IN ('riesgo','incidente','plan','escalamiento')),
    entidad_id          UUID NOT NULL,
    texto               TEXT NOT NULL,
    visible_para        VARCHAR(30) DEFAULT 'todos'
                        CHECK (visible_para IN ('todos','supervisores','gerencia')),
    autor_id            UUID REFERENCES usuarios(id),
    nombre_autor        VARCHAR(200),
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_entidad ON comentarios(entidad_tipo, entidad_id);

-- ── 2.6 Notificaciones del sistema ──────────────────────────
CREATE TABLE IF NOT EXISTS notificaciones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    terminal_id         UUID REFERENCES terminal(id) ON DELETE CASCADE,
    usuario_id          UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo                VARCHAR(50) NOT NULL,       -- 'alerta_kri', 'plan_vencido', 'escalamiento', etc.
    titulo              VARCHAR(200) NOT NULL,
    mensaje             TEXT,
    entidad_tipo        VARCHAR(30),
    entidad_id          UUID,
    leida               BOOLEAN DEFAULT FALSE,
    leida_en            TIMESTAMPTZ,
    nivel               VARCHAR(20) DEFAULT 'info'
                        CHECK (nivel IN ('info','alerta','critico')),
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_usuario  ON notificaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_leida    ON notificaciones(leida);
CREATE INDEX IF NOT EXISTS idx_notif_ts       ON notificaciones(creado_en DESC);

-- ── 2.7 Sesiones de usuario ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id          UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash          TEXT,                       -- hash del JWT
    ip_address          INET,
    dispositivo         VARCHAR(200),
    activa              BOOLEAN DEFAULT TRUE,
    creada_en           TIMESTAMPTZ DEFAULT NOW(),
    expira_en           TIMESTAMPTZ,
    cerrada_en          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_activa  ON sesiones(activa);

-- ── 2.8 Adjuntos / archivos ──────────────────────────────────
CREATE TABLE IF NOT EXISTS adjuntos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    terminal_id         UUID REFERENCES terminal(id) ON DELETE CASCADE,
    entidad_tipo        VARCHAR(30) NOT NULL
                        CHECK (entidad_tipo IN ('riesgo','incidente','plan','escalamiento')),
    entidad_id          UUID NOT NULL,
    nombre_archivo      VARCHAR(300) NOT NULL,
    tipo_mime           VARCHAR(100),
    tamano_bytes        INTEGER,
    url_almacenamiento  TEXT,
    descripcion         TEXT,
    subido_por          UUID REFERENCES usuarios(id),
    subido_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adjuntos_entidad ON adjuntos(entidad_tipo, entidad_id);

-- ── 2.9 Configuración de reportes programados ───────────────
CREATE TABLE IF NOT EXISTS reportes_programados (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    terminal_id         UUID REFERENCES terminal(id) ON DELETE CASCADE,
    nombre              VARCHAR(200) NOT NULL,
    tipo                VARCHAR(30) DEFAULT 'ejecutivo_mensual',
    frecuencia          VARCHAR(20) DEFAULT 'mensual'
                        CHECK (frecuencia IN ('diario','semanal','quincenal','mensual')),
    dia_envio           INTEGER,                    -- día del mes o día de la semana
    hora_envio          TIME DEFAULT '08:00',
    destinatarios       TEXT[],
    formato             VARCHAR(10) DEFAULT 'pdf'
                        CHECK (formato IN ('pdf','xlsx','ambos')),
    activo              BOOLEAN DEFAULT TRUE,
    ultimo_envio        TIMESTAMPTZ,
    proximo_envio       TIMESTAMPTZ,
    creado_por          UUID REFERENCES usuarios(id),
    creado_en           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2.10 Métricas pre-calculadas (caché dashboard) ──────────
CREATE TABLE IF NOT EXISTS dashboard_metricas (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    terminal_id         UUID NOT NULL REFERENCES terminal(id) ON DELETE CASCADE,
    calculado_en        TIMESTAMPTZ DEFAULT NOW(),
    periodo             DATE NOT NULL,
    -- Riesgos
    total_riesgos_activos       INTEGER DEFAULT 0,
    riesgos_criticos            INTEGER DEFAULT 0,
    riesgos_altos               INTEGER DEFAULT 0,
    riesgos_medios              INTEGER DEFAULT 0,
    riesgos_bajos               INTEGER DEFAULT 0,
    -- Incidentes
    total_incidentes_mes        INTEGER DEFAULT 0,
    incidentes_criticos_mes     INTEGER DEFAULT 0,
    incidentes_graves_mes       INTEGER DEFAULT 0,
    dias_sin_accidentes         INTEGER DEFAULT 0,
    -- Planes
    planes_activos              INTEGER DEFAULT 0,
    planes_vencidos             INTEGER DEFAULT 0,
    planes_completados_mes      INTEGER DEFAULT 0,
    -- Controles
    efectividad_controles_pct   NUMERIC(5,2),
    -- Acciones
    acciones_vencidas           INTEGER DEFAULT 0,
    acciones_pendientes         INTEGER DEFAULT 0,
    -- Escalamientos
    escalamientos_pendientes    INTEGER DEFAULT 0,
    UNIQUE (terminal_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_dash_terminal ON dashboard_metricas(terminal_id);
CREATE INDEX IF NOT EXISTS idx_dash_periodo  ON dashboard_metricas(periodo DESC);

-- ============================================================
--  BLOQUE 3 · AJUSTES AL MAPA (tablas incompletas en v1)
-- ============================================================

-- Ampliar mapa_zonas con más datos útiles
ALTER TABLE mapa_zonas
    ADD COLUMN IF NOT EXISTS nombre            VARCHAR(150),
    ADD COLUMN IF NOT EXISTS nivel_riesgo      VARCHAR(20),    -- calculado
    ADD COLUMN IF NOT EXISTS total_riesgos     INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_incidentes  INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS orden             INTEGER DEFAULT 0;

-- Ampliar mapa_marcadores
ALTER TABLE mapa_marcadores
    ADD COLUMN IF NOT EXISTS nivel             VARCHAR(20),   -- Crítico, Alto, Medio, Bajo
    ADD COLUMN IF NOT EXISTS color_hex         VARCHAR(7),
    ADD COLUMN IF NOT EXISTS pulsante          BOOLEAN DEFAULT FALSE,  -- animación CSS pulse
    ADD COLUMN IF NOT EXISTS tooltip           TEXT,
    ADD COLUMN IF NOT EXISTS actualizado_en    TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
--  BLOQUE 4 · TRIGGERS NUEVOS
-- ============================================================

-- Trigger: registrar automáticamente en planes_avance_historial
-- cuando cambia el progreso o estado de un plan
CREATE OR REPLACE FUNCTION trm.fn_plan_avance_historial()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.progreso IS DISTINCT FROM NEW.progreso
       OR OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO trm.planes_avance_historial (
            plan_id, progreso_anterior, progreso_nuevo,
            estado_anterior, estado_nuevo, nombre_usuario
        ) VALUES (
            NEW.id, OLD.progreso, NEW.progreso,
            OLD.estado, NEW.estado, 'Sistema'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_plan_avance_hist
    AFTER UPDATE ON planes_mitigacion
    FOR EACH ROW EXECUTE FUNCTION trm.fn_plan_avance_historial();

-- Trigger: registrar cambio de estado de riesgo
CREATE OR REPLACE FUNCTION trm.fn_riesgo_estado_historial()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO trm.riesgos_estados_historial (
            riesgo_id, estado_anterior, estado_nuevo, nombre_usuario
        ) VALUES (NEW.id, OLD.estado, NEW.estado, 'Sistema');
    END IF;
    -- Guardar score anterior si cambió
    IF OLD.probabilidad IS DISTINCT FROM NEW.probabilidad
       OR OLD.impacto IS DISTINCT FROM NEW.impacto THEN
        NEW.score_anterior := OLD.probabilidad * OLD.impacto;
        NEW.nivel_anterior  := OLD.nivel;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_riesgo_estado_hist
    BEFORE UPDATE ON riesgos
    FOR EACH ROW EXECUTE FUNCTION trm.fn_riesgo_estado_historial();

-- Trigger: registrar cambio de estado de incidente
CREATE OR REPLACE FUNCTION trm.fn_incidente_estado_historial()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.estado IS DISTINCT FROM NEW.estado THEN
        INSERT INTO trm.incidentes_estados_historial (
            incidente_id, estado_anterior, estado_nuevo, nombre_usuario
        ) VALUES (NEW.id, OLD.estado, NEW.estado, 'Sistema');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_incidente_estado_hist
    AFTER UPDATE ON incidentes
    FOR EACH ROW EXECUTE FUNCTION trm.fn_incidente_estado_historial();

-- Trigger: crear evento en escalamientos_historial al insertar
CREATE OR REPLACE FUNCTION trm.fn_escalamiento_creado()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO trm.escalamientos_historial (
        escalamiento_id, accion, descripcion,
        realizado_por, color_hex
    ) VALUES (
        NEW.id,
        CASE WHEN NEW.auto_generado THEN 'Escalamiento generado automáticamente'
             ELSE 'Escalamiento creado manualmente' END,
        'Planes vinculados con vencimiento detectado por el sistema.',
        CASE WHEN NEW.auto_generado THEN 'Sistema TRM' ELSE 'Usuario' END,
        '#EF9F27'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_escalamiento_creado
    AFTER INSERT ON escalamientos
    FOR EACH ROW EXECUTE FUNCTION trm.fn_escalamiento_creado();

-- Trigger: notificar cuando un plan vence
CREATE OR REPLACE FUNCTION trm.fn_notificar_plan_vencido()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.estado = 'Vencido' AND OLD.estado != 'Vencido' THEN
        INSERT INTO trm.notificaciones (
            terminal_id, usuario_id, tipo, titulo, mensaje,
            entidad_tipo, entidad_id, nivel
        )
        SELECT
            NEW.terminal_id,
            NEW.responsable_id,
            'plan_vencido',
            'Plan vencido: ' || NEW.titulo,
            'El plan ' || NEW.codigo || ' venció el ' || NEW.fecha_limite::TEXT || ' sin completarse.',
            'plan',
            NEW.id,
            'critico'
        WHERE NEW.responsable_id IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_plan_vencido_notif
    AFTER UPDATE ON planes_mitigacion
    FOR EACH ROW EXECUTE FUNCTION trm.fn_notificar_plan_vencido();

-- ============================================================
--  BLOQUE 5 · VISTAS NUEVAS Y ACTUALIZADAS
-- ============================================================

-- Vista: escalamientos pendientes con días sin respuesta
CREATE OR REPLACE VIEW v_escalamientos_pendientes AS
SELECT
    e.id,
    e.codigo,
    e.motivo,
    e.urgencia,
    e.estado,
    e.auto_generado,
    e.nivel_escalamiento,
    e.creado_en,
    EXTRACT(EPOCH FROM (NOW() - e.creado_en))/3600 AS horas_sin_respuesta,
    u.nombres || ' ' || u.apellidos                AS creado_por_nombre,
    COUNT(ep.plan_id)                              AS total_planes
FROM escalamientos e
LEFT JOIN usuarios u ON u.id = e.creado_por
LEFT JOIN escalamientos_planes ep ON ep.escalamiento_id = e.id
WHERE e.estado = 'Enviado'
GROUP BY e.id, e.codigo, e.motivo, e.urgencia, e.estado,
         e.auto_generado, e.nivel_escalamiento, e.creado_en,
         u.nombres, u.apellidos
ORDER BY
    CASE e.urgencia WHEN 'Crítica' THEN 1 WHEN 'Alta' THEN 2 ELSE 3 END,
    e.creado_en ASC;

-- Vista: progreso de planes por riesgo
CREATE OR REPLACE VIEW v_planes_por_riesgo AS
SELECT
    r.id           AS riesgo_id,
    r.codigo       AS riesgo_codigo,
    r.nombre       AS riesgo_nombre,
    r.nivel        AS riesgo_nivel,
    r.score        AS riesgo_score,
    COUNT(p.id)                                              AS total_planes,
    SUM(CASE WHEN p.estado = 'Completado' THEN 1 ELSE 0 END) AS completados,
    SUM(CASE WHEN p.estado = 'En progreso' THEN 1 ELSE 0 END) AS en_progreso,
    SUM(CASE WHEN p.estado = 'Vencido'    THEN 1 ELSE 0 END) AS vencidos,
    SUM(CASE WHEN p.estado = 'Pendiente'  THEN 1 ELSE 0 END) AS pendientes,
    ROUND(AVG(p.progreso), 1)                                AS avance_promedio,
    MIN(p.fecha_limite)                                       AS proximo_vencimiento
FROM riesgos r
LEFT JOIN planes_mitigacion p ON p.riesgo_id = r.id
WHERE r.estado != 'Cerrado'
GROUP BY r.id, r.codigo, r.nombre, r.nivel, r.score;

-- Vista: incidentes vinculados a riesgos (para ficha de riesgo)
CREATE OR REPLACE VIEW v_incidentes_por_riesgo AS
SELECT
    ir.riesgo_id,
    i.id           AS incidente_id,
    i.codigo       AS incidente_codigo,
    i.titulo,
    i.fecha_ocurrencia,
    i.severidad,
    i.estado,
    a.nombre       AS area_nombre
FROM incidentes_riesgos ir
JOIN incidentes i ON i.id = ir.incidente_id
LEFT JOIN areas a ON a.id = i.area_id
ORDER BY i.fecha_ocurrencia DESC;

-- Vista: controles con efectividad por riesgo
CREATE OR REPLACE VIEW v_controles_por_riesgo AS
SELECT
    rc.riesgo_id,
    COUNT(rc.id)                                               AS total_controles,
    SUM(CASE WHEN rc.efectivo THEN 1 ELSE 0 END)              AS controles_efectivos,
    ROUND(
        SUM(CASE WHEN rc.efectivo THEN 1 ELSE 0 END)::NUMERIC
        / NULLIF(COUNT(rc.id), 0) * 100, 1
    )                                                          AS pct_efectividad,
    CASE
        WHEN COUNT(rc.id) = 0 THEN 'Sin controles'
        WHEN SUM(CASE WHEN rc.efectivo THEN 1 ELSE 0 END)::NUMERIC
             / NULLIF(COUNT(rc.id), 0) >= 0.85 THEN 'Suficiente'
        WHEN SUM(CASE WHEN rc.efectivo THEN 1 ELSE 0 END)::NUMERIC
             / NULLIF(COUNT(rc.id), 0) >= 0.65 THEN 'Insuficiente'
        ELSE 'Crítico'
    END                                                        AS estado_efectividad
FROM riesgos_controles rc
GROUP BY rc.riesgo_id;

-- Vista: notificaciones no leídas por usuario
CREATE OR REPLACE VIEW v_notificaciones_pendientes AS
SELECT
    n.*,
    u.nombres || ' ' || u.apellidos AS usuario_nombre
FROM notificaciones n
JOIN usuarios u ON u.id = n.usuario_id
WHERE n.leida = FALSE
ORDER BY
    CASE n.nivel WHEN 'critico' THEN 1 WHEN 'alerta' THEN 2 ELSE 3 END,
    n.creado_en DESC;

-- Vista mejorada del dashboard (reemplaza la v1)
CREATE OR REPLACE VIEW v_dashboard AS
SELECT
    (SELECT COUNT(*) FROM riesgos WHERE estado = 'Activo')                              AS riesgos_activos,
    (SELECT COUNT(*) FROM riesgos WHERE nivel = 'Crítico' AND estado = 'Activo')        AS riesgos_criticos,
    (SELECT COUNT(*) FROM riesgos WHERE nivel = 'Alto'    AND estado = 'Activo')        AS riesgos_altos,
    (SELECT COUNT(*) FROM incidentes
     WHERE DATE_TRUNC('month', fecha_ocurrencia) = DATE_TRUNC('month', CURRENT_DATE))   AS incidentes_mes,
    (SELECT COUNT(*) FROM incidentes
     WHERE severidad IN ('Crítico','Grave')
       AND DATE_TRUNC('month', fecha_ocurrencia) = DATE_TRUNC('month', CURRENT_DATE))   AS incidentes_criticos_mes,
    (SELECT COUNT(*) FROM planes_mitigacion WHERE estado = 'Vencido')                   AS planes_vencidos,
    (SELECT COUNT(*) FROM planes_mitigacion WHERE estado IN ('Pendiente','En progreso')) AS planes_activos,
    (SELECT COUNT(*) FROM acciones_correctivas WHERE estado = 'Vencido')                AS acciones_vencidas,
    (SELECT COUNT(*) FROM escalamientos WHERE estado = 'Enviado')                       AS escalamientos_pendientes,
    (SELECT ROUND(AVG(CASE WHEN rc.efectivo THEN 1.0 ELSE 0.0 END)*100, 1)
     FROM riesgos_controles rc)                                                         AS efectividad_controles_pct,
    (SELECT CURRENT_DATE - MAX(fecha_ocurrencia)
     FROM incidentes WHERE severidad IN ('Grave','Crítico'))                             AS dias_sin_accidente_grave;

-- ============================================================
--  BLOQUE 6 · ÍNDICES ADICIONALES DE RENDIMIENTO
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_riesgos_responsable   ON riesgos(responsable_id);
CREATE INDEX IF NOT EXISTS idx_riesgos_proxima_rev   ON riesgos(proxima_revision);
CREATE INDEX IF NOT EXISTS idx_planes_responsable    ON planes_mitigacion(responsable_id);
CREATE INDEX IF NOT EXISTS idx_planes_progreso       ON planes_mitigacion(progreso);
CREATE INDEX IF NOT EXISTS idx_incidentes_resp       ON incidentes(responsable_id);
CREATE INDEX IF NOT EXISTS idx_incidentes_riesgo_vin ON incidentes(riesgo_vinculado_principal);
CREATE INDEX IF NOT EXISTS idx_esc_nivel             ON escalamientos(nivel_escalamiento);
CREATE INDEX IF NOT EXISTS idx_esc_auto              ON escalamientos(auto_generado);
CREATE INDEX IF NOT EXISTS idx_kri_terminal_periodo  ON kri_valores(terminal_id, periodo DESC);
CREATE INDEX IF NOT EXISTS idx_notif_entidad         ON notificaciones(entidad_tipo, entidad_id);
CREATE INDEX IF NOT EXISTS idx_adj_entidad           ON adjuntos(entidad_tipo, entidad_id);

-- ============================================================
--  BLOQUE 7 · TABLA DE RESUMEN DE CAMBIOS (para referencia)
-- ============================================================

COMMENT ON TABLE escalamientos_historial    IS 'Línea de tiempo de eventos de cada escalamiento';
COMMENT ON TABLE planes_avance_historial    IS 'Registro histórico de cambios de avance y estado de planes';
COMMENT ON TABLE riesgos_estados_historial  IS 'Historial de cambios de estado de riesgos';
COMMENT ON TABLE incidentes_estados_historial IS 'Historial de cambios de estado de incidentes';
COMMENT ON TABLE comentarios                IS 'Notas internas polimórficas para riesgos, incidentes, planes y escalamientos';
COMMENT ON TABLE notificaciones             IS 'Centro de notificaciones del sistema por usuario';
COMMENT ON TABLE sesiones                   IS 'Control de sesiones activas para seguridad';
COMMENT ON TABLE adjuntos                   IS 'Archivos adjuntos para cualquier entidad del sistema';
COMMENT ON TABLE reportes_programados       IS 'Configuración de reportes ejecutivos automáticos';
COMMENT ON TABLE dashboard_metricas         IS 'Caché de métricas para el dashboard (rendimiento)';

-- ============================================================
--  FIN DEL SCRIPT DE AJUSTES v2
-- ============================================================
