// lib/trm-logger.ts
// Logger centralizado para todos los servicios TRM

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface TrmLogEntry {
  timestamp: string;
  correlationId: string;
  level: LogLevel;
  service: string;
  method: string;
  path: string;
  durationMs?: number;
  statusCode?: number;
  payload?: unknown;
  response?: unknown;
  error?: {
    message: string;
    stack?: string;
  };
}

// ── Configuración ─────────────────────────────────────────────────────────────

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CURRENT_LEVEL: LogLevel =
  (process.env.TRM_LOG_LEVEL as LogLevel) ?? 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[CURRENT_LEVEL];
}

// ── Generador de correlationId ─────────────────────────────────────────────────

function generateCorrelationId(): string {
  return `trm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Escritor de logs ──────────────────────────────────────────────────────────

function writeLog(entry: TrmLogEntry): void {
  if (!shouldLog(entry.level)) return;

  if (process.env.NODE_ENV === 'production') {
    // Producción: JSON estructurado (compatible con Datadog, CloudWatch, etc.)
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    // Desarrollo: formato legible por humanos
    const icon: Record<LogLevel, string> = {
      debug: '🔍',
      info:  '✅',
      warn:  '⚠️ ',
      error: '❌',
    };
    const color: Record<LogLevel, string> = {
      debug: '\x1b[90m', // gris
      info:  '\x1b[32m', // verde
      warn:  '\x1b[33m', // amarillo
      error: '\x1b[31m', // rojo
    };
    const reset = '\x1b[0m';
    const c = color[entry.level];

    const parts = [
      `${c}${icon[entry.level]} [TRM]${reset}`,
      `[${entry.timestamp}]`,
      `[${entry.correlationId}]`,
      `${c}${entry.level.toUpperCase()}${reset}`,
      `${entry.service}.${entry.method}`,
      entry.path,
    ];

    if (entry.durationMs !== undefined) {
      parts.push(`${entry.durationMs}ms`);
    }
    if (entry.statusCode !== undefined) {
      parts.push(`HTTP ${entry.statusCode}`);
    }

    console.log(parts.join(' | '));

    if (entry.payload !== undefined) {
      console.log(`  ${c}→ payload:${reset}`, JSON.stringify(entry.payload));
    }
    if (entry.error !== undefined) {
      console.log(`  ${c}→ error:${reset}`, entry.error.message);
      if (entry.error.stack && shouldLog('debug')) {
        console.log(entry.error.stack);
      }
    }
  }
}

// ── Logger público ────────────────────────────────────────────────────────────

export const trmLogger = {
  /**
   * Envuelve una llamada fetch al TRM API registrando request/response/error.
   *
   * @example
   * const data = await trmLogger.call('riesgosService', 'list', '/api/trm/riesgos', () =>
   *   fetch(url, options)
   * );
   */
  async call<T>(
    service: string,
    method: string,
    path: string,
    fn: () => Promise<Response>,
    options?: { payload?: unknown },
  ): Promise<T> {
    const correlationId = generateCorrelationId();
    const timestamp = new Date().toISOString();
    const start = Date.now();

    writeLog({
      timestamp,
      correlationId,
      level: 'debug',
      service,
      method,
      path,
      payload: options?.payload,
    });

    let res: Response;
    try {
      res = await fn();
    } catch (networkError) {
      const error = networkError instanceof Error ? networkError : new Error(String(networkError));
      writeLog({
        timestamp: new Date().toISOString(),
        correlationId,
        level: 'error',
        service,
        method,
        path,
        durationMs: Date.now() - start,
        error: { message: error.message, stack: error.stack },
      });
      throw error;
    }

    const durationMs = Date.now() - start;

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      const errorMessage = body?.message ?? `TRM request failed: ${res.status}`;
      writeLog({
        timestamp: new Date().toISOString(),
        correlationId,
        level: res.status >= 500 ? 'error' : 'warn',
        service,
        method,
        path,
        durationMs,
        statusCode: res.status,
        error: { message: errorMessage },
      });
      throw new Error(errorMessage);
    }

    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : (undefined as T);

    writeLog({
      timestamp: new Date().toISOString(),
      correlationId,
      level: 'info',
      service,
      method,
      path,
      durationMs,
      statusCode: res.status,
      // Evita loguear respuestas grandes en producción
      response: process.env.NODE_ENV !== 'production' ? data : undefined,
    });

    return data;
  },

  debug: (msg: string, meta?: object) =>
    writeLog({ timestamp: new Date().toISOString(), correlationId: '-', level: 'debug', service: 'trm', method: '-', path: '-', ...meta, error: undefined }),

  info: (msg: string, meta?: object) =>
    writeLog({ timestamp: new Date().toISOString(), correlationId: '-', level: 'info',  service: 'trm', method: '-', path: msg, ...meta }),

  warn: (msg: string, meta?: object) =>
    writeLog({ timestamp: new Date().toISOString(), correlationId: '-', level: 'warn',  service: 'trm', method: '-', path: msg, ...meta }),

  error: (msg: string, meta?: object) =>
    writeLog({ timestamp: new Date().toISOString(), correlationId: '-', level: 'error', service: 'trm', method: '-', path: msg, ...meta }),
};
