# TEDxUMSA — plataforma de gestión de eventos

Aplicación web para publicar eventos TEDxUMSA, recibir inscripciones, asignar butacas y gestionar la operación de cada evento desde un panel administrativo.

## Tecnologías

| Área | Tecnología | Uso |
| --- | --- | --- |
| Interfaz web | **Next.js 16**, **React 19** y **TypeScript** | Portada, formularios públicos, mapa de butacas, tickets y paneles. |
| API | **NestJS 10** y **TypeScript** | API REST, autenticación, validación y reglas de negocio. |
| Persistencia | **PostgreSQL** | Almacenamiento relacional de cuentas, eventos, salones, butacas e inscripciones. |
| Acceso a datos | **Prisma 6** | Esquema, cliente tipado y migraciones de base de datos. |
| Validación | **class-validator** y **class-transformer** | Validación y transformación de los datos recibidos por la API. |
| Imágenes | **Sharp** | Lectura y validación del contenido, formato y dimensiones de las fotos de salones. |
| Códigos QR | **qrcode** | Generación del QR incluido en el pase del asistente. |
| Correo | **Resend** (opcional) | Envío de enlaces de encuestas de satisfacción al cerrar un evento. |
| Documentación de API | **Swagger** | Exploración de endpoints en `/api/docs` durante el desarrollo. |

El repositorio usa **npm workspaces** para mantener `frontend/` y `backend/` como aplicaciones separadas. El esquema Prisma y los scripts de base de datos viven en la raíz. No se necesita Docker para el desarrollo local.

## Funcionalidades

- Portada pública con eventos publicados y enlaces de inscripción.
- Formularios por evento con preguntas configurables por el administrador.
- Selección de butaca y control de disponibilidad para evitar asignaciones duplicadas.
- Pase de inscripción con código QR.
- Gestión de salones reutilizables, incluida la edición de dimensiones, distribución de butacas y fotografía del recinto.
- Panel administrativo para consultar eventos, inscripciones, respuestas, ocupación y acreditaciones.
- Escaneo de QR o ingreso de código para registrar la asistencia.
- Colaboradores asignados a eventos para apoyar las tareas permitidas.
- Encuesta de satisfacción y métricas de respuestas cuando se configura el servicio de correo.

## Requisitos

- Node.js compatible con Next.js 16 (Node.js 20.9 o posterior recomendado).
- npm.
- Una instancia de PostgreSQL accesible desde la máquina.

## Configuración local

1. Clona el repositorio e instala las dependencias desde la carpeta raíz:

   ```powershell
   git clone https://github.com/Ericka55/TEDxUmsa.git
   cd TEDxUmsa
   npm install
   ```

2. Crea una base de datos PostgreSQL llamada `tedxumsa`. Configura PostgreSQL con una cuenta de servicio para la aplicación y una cuenta con permisos de migración. No uses la cuenta administradora de PostgreSQL como credencial habitual del servidor.

3. Copia `.env.example` a `.env` y completa sus variables. En particular:

   - `DATABASE_URL`: conexión de runtime a la base `tedxumsa`.
   - `DATABASE_MIGRATION_URL`: conexión con permisos para ejecutar migraciones Prisma.
   - `API_PORT`, `WEB_ORIGIN` y `NEXT_PUBLIC_API_URL`: direcciones locales de la API y de la web.
   - `ADMIN_EMAIL` y `ADMIN_PASSWORD`: credenciales iniciales del administrador; utiliza una contraseña larga y privada.
   - `JWT_SECRET`: secreto aleatorio para firmar sesiones; no es la contraseña del administrador.
   - `RESEND_API_KEY` y `MAIL_FROM`: opcionales, necesarios para enviar encuestas por correo.

   No subas `.env` a GitHub ni compartas sus valores. El archivo `.env.example` sirve como plantilla y no debe contener credenciales reales.

4. Genera el cliente de Prisma y aplica las migraciones:

   ```powershell
   npm run db:generate
   npm run db:migrate -- --name init
   ```

   `DATABASE_URL` y `DATABASE_MIGRATION_URL` deben estar definidas para que Prisma valide el esquema y aplique cambios.

5. Crea la cuenta inicial del administrador:

   ```powershell
   npm run db:seed-admin
   ```

   El comando lee `ADMIN_EMAIL` y `ADMIN_PASSWORD` desde `.env` y almacena la contraseña como hash en la tabla de usuarios.

## Ejecutar en desarrollo

Abre dos terminales en la raíz del repositorio.

**Terminal 1 — API NestJS:**

```powershell
cd backend
npm run dev
```

**Terminal 2 — aplicación Next.js:**

```powershell
cd frontend
npm run dev
```

La raíz también ofrece `npm run dev` para iniciar ambos procesos a la vez. Mantén las terminales abiertas mientras trabajas.

- Web: <http://localhost:3000>
- API: <http://localhost:3001/api>
- Swagger en desarrollo: <http://localhost:3001/api/docs>
- Acceso administrativo: <http://localhost:3000/admin/forms>

## Estructura del proyecto

```text
backend/                 API NestJS: módulos, controladores, servicios y DTOs
frontend/                Next.js: páginas públicas y administración
prisma/schema.prisma     Modelo PostgreSQL y configuración de Prisma
prisma/migrations/       Historial de migraciones
docs/                    Arquitectura, auditoría y guías operativas
scripts/                 Comandos auxiliares de desarrollo y migración
```

La interfaz se comunica con la API; no se conecta directamente a PostgreSQL. La API valida las solicitudes y ejecuta las operaciones a través de Prisma.

## Scripts principales

Ejecutados desde la raíz:

| Comando | Propósito |
| --- | --- |
| `npm run dev` | Inicia frontend y backend en paralelo. |
| `npm run build` | Compila los workspaces disponibles. |
| `npm run db:generate` | Genera el cliente de Prisma. |
| `npm run db:migrate -- --name nombre` | Crea y aplica una migración en desarrollo. |
| `npm run db:seed-admin` | Crea o actualiza la cuenta inicial del administrador. |
| `npm run db:studio` | Abre Prisma Studio para inspeccionar la base configurada. |

## Seguridad y despliegue

- Mantén secretos y cadenas de conexión en variables de entorno del servidor.
- Usa una cuenta de base de datos de runtime con privilegios limitados y credenciales de migración separadas.
- Configura HTTPS, dominios permitidos y variables seguras antes de producción.
- Las fotos de salones se limitan y validan en el navegador y en la API; el backend comprueba el formato real con Sharp.
- Para desplegar, el frontend, la API y PostgreSQL necesitan configuraciones y variables de entorno compatibles entre sí. La API debe estar disponible mientras se registran asistentes y se acreditan sus códigos QR.

Consulta [docs/arquitectura.md](docs/arquitectura.md) para el modelo y las reglas de datos, [docs/auditoria-tecnica.md](docs/auditoria-tecnica.md) para los hallazgos y verificaciones, y [docs/postgres-cuentas-servicio.md](docs/postgres-cuentas-servicio.md) para la configuración de cuentas PostgreSQL.
