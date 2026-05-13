# 🔐 Auth Service API - Microservicio de Autenticación y RBAC

Este es un microservicio robusto de autenticación y administración de usuarios construido con las últimas tecnologías de Node.js. Implementa **Better Auth** para la gestión de sesiones y un sistema completo de **RBAC (Control de Acceso Basado en Roles)**.

## 🚀 Tecnologías

- **Runtime:** Node.js 24+
- **Lenguaje:** TypeScript
- **Framework:** [Fastify](https://fastify.dev/) (Última versión)
- **Autenticación:** [Better Auth](https://www.better-auth.com/) (Email/Password + Google OAuth)
- **ORM:** [Drizzle ORM](https://orm.drizzle.team/)
- **Base de Datos:** PostgreSQL (Compatible con Supabase / Neon)
- **Despliegue:** Optimizado para Railway

## ✨ Características

- ✅ **Autenticación Multi-proveedor:** Email/Password y Google OAuth listos para usar.
- ✅ **Gestión de Sesiones:** Manejo automático de cookies y tokens de sesión.
- ✅ **RBAC Completo:**
  - Gestión de **Roles** (Admin, Editor, User, etc.)
  - Gestión de **Opciones/Módulos** (Rutas del sistema)
  - Gestión de **Permisos** (READ, WRITE, UPDATE, DELETE, EXPORT)
- ✅ **Menú Dinámico:** Generación de sidebar basado en los permisos del usuario autenticado.
- ✅ **Verificación de Permisos:** Endpoint para validar acciones permitidas en rutas específicas.

## 📋 Requisitos Previos

1. **Base de Datos:** Una instancia de PostgreSQL (puedes usar [Supabase](https://supabase.com/) o [Neon](https://neon.tech/)).
2. **Google OAuth:** Credenciales (Client ID y Secret) obtenidas desde [Google Cloud Console](https://console.cloud.google.com/).
3. **Node.js:** Versión 24 o superior instalada.

## 🛠️ Instalación y Configuración

1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Crea un archivo `.env` en la raíz del proyecto:
   ```env
   PORT=3000
   NODE_ENV=development
   DATABASE_URL=postgres://user:password@host:5432/dbname
   BETTER_AUTH_SECRET=tu_secreto_generado_con_openssl
   BETTER_AUTH_URL=http://localhost:3000

   # Google OAuth
   GOOGLE_CLIENT_ID=tu_google_client_id
   GOOGLE_CLIENT_SECRET=tu_google_client_secret
   ```

3. **Sincronizar la base de datos:**
   Ejecuta el siguiente comando para crear las tablas necesarias:
   ```bash
   npm run db:push
   ```

## 🏃 Ejecución

### Desarrollo
```bash
#npm run dev
npx tsx server.ts

```

### Producción
```bash
npm run build
npm start
```

## 🏥 Inicialización (Seed)

Para que el sistema funcione correctamente, debes inicializar los permisos base. Una vez que el servidor esté corriendo, realiza una petición POST:

- **URL:** `http://localhost:3000/api/seed`
- **Método:** `POST`

Esto creará los permisos: `READ`, `WRITE`, `UPDATE`, `DELETE`, `EXPORT`.

## 📖 Resumen de API (Endpoints Principales)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servicio |
| POST | `/auth/sign-up/email` | Registro de usuario |
| POST | `/auth/sign-in/email` | Login con email |
| GET | `/auth/session` | Obtener sesión actual |
| GET | `/me` | Perfil del usuario + Roles |
| GET | `/me/menu` | Menú dinámico según permisos |
| GET | `/api/users` | Listar usuarios (Admin) |
| POST | `/api/roles` | Crear nuevo rol |

> **Nota:** Para el flujo de Google OAuth, utiliza:
> `http://localhost:3000/auth/sign-in/social?provider=google&callbackURL=http://tu-frontend.com/dashboard`

## ☁️ Despliegue en Railway

1. Conecta tu repositorio de GitHub a Railway.
2. Railway detectará automáticamente el `package.json`.
3. Configura las variables de entorno en el panel de Railway.
4. Asegúrate de que `PORT` esté configurado en `3000`.
5. ¡Listo! Railway ejecutará `npm start` automáticamente.

---
Creado para microservicios modernos.
