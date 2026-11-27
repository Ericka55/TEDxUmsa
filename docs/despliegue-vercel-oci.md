# Despliegue de TEDxUMSA: Vercel + Oracle Cloud

La arquitectura recomendada para este proyecto es:

- **Vercel:** Next.js, con el directorio `frontend` como raíz del proyecto.
- **OCI Compute:** API NestJS, detrás de Nginx y HTTPS.
- **OCI Database with PostgreSQL:** base de datos PostgreSQL con endpoint privado dentro de una VCN. No usar Oracle Autonomous Database: el proyecto usa Prisma con `provider = "postgresql"`.

OCI Database with PostgreSQL asigna un endpoint privado; la API debe ejecutarse en una red que pueda alcanzarlo. No se debe abrir PostgreSQL al público. [Documentación de OCI PostgreSQL](https://docs.oracle.com/en-us/iaas/Content/postgresql/overview.htm) · [Crear un sistema PostgreSQL](https://docs.oracle.com/en-us/iaas/Content/postgresql/create-db.htm)

**Costos:** confirma el costo estimado en OCI antes de aprovisionar la base administrada. Oracle factura este servicio según cómputo, almacenamiento, rendimiento y otros recursos asociados; no asumas que está cubierto por Always Free. [Facturación de OCI Database with PostgreSQL](https://docs.oracle.com/en-us/iaas/Content/postgresql/billing.htm)

## 1. Preparar el repositorio

Vercel importa el código desde un repositorio Git. Esta copia local debe estar en GitHub (o en otro proveedor compatible) antes de importarla. No subas `.env`, archivos de claves, `node_modules`, `backend/uploads` ni datos de producción. El `.gitignore` ya excluye `.env`, `node_modules` y `backend/uploads`.

El repositorio es un monorepo npm con `frontend/` y `backend/`; Vercel documenta importar cada aplicación con su propio Root Directory. Para este proyecto, importa `frontend/`. [Monorepos en Vercel](https://vercel.com/docs/monorepos)

## 2. Configurar el proyecto Vercel

1. En Vercel, importa el repositorio Git y selecciona `frontend` como **Root Directory**.
2. Framework: **Next.js**. Usa el comando de instalación y build detectados automáticamente; no configures `frontend` como raíz del repositorio Git.
3. En **Settings → Environment Variables**, define para Production y Preview:

   - `NEXT_PUBLIC_API_URL=https://api.TU-DOMINIO/api`

   El valor debe apuntar al backend HTTPS e incluir `/api`. Es público y queda incluido en el bundle del navegador; no pongas secretos con prefijo `NEXT_PUBLIC_`. Las variables de Vercel se aplican a despliegues nuevos, por lo que después de cambiarlas hay que volver a desplegar. [Variables de entorno en Vercel](https://vercel.com/docs/environment-variables)

4. Asocia un dominio al frontend, por ejemplo `www.TU-DOMINIO`.

## 3. Preparar PostgreSQL en OCI

1. Crea el servicio **OCI Database with PostgreSQL** en una VCN y una subnet privada.
2. Guarda el endpoint privado, puerto, nombre de base, usuario de runtime y contraseña en OCI Vault o en un gestor de secretos.
3. Configura reglas de red para que solo la VM de la API alcance PostgreSQL en el puerto 5432. No expongas ese puerto a `0.0.0.0/0`.
4. Usa una cuenta de aplicación de privilegios mínimos en runtime y una cuenta separada para migraciones. El servicio administra PostgreSQL; no es Oracle Database.

## 4. API NestJS en OCI Compute

1. Crea una VM Linux en la misma VCN que la base, con acceso SSH restringido a tu IP.
2. Instala la versión LTS de Node.js compatible con el proyecto y clona el repositorio privado.
3. Desde la raíz del repositorio ejecuta `npm ci`, `npm run db:generate` y `npm run build --workspace=@tedxumsa/api`.
4. Configura la API como servicio `systemd` con directorio de trabajo `backend` y comando `node dist/main.js`. Mantén `backend/uploads` en almacenamiento persistente: las fotos no deben desaparecer al actualizar el código.
5. Configura Nginx como proxy HTTPS para `127.0.0.1:3001`. Abre únicamente los puertos 80/443 al público en OCI; no publiques directamente el puerto 3001.
6. Configura DNS `api.TU-DOMINIO` para llegar al proxy de la API y habilita TLS.

La documentación de OCI explica que una VM solo es accesible públicamente si tiene IP pública y las reglas de red necesarias; limita esas reglas a los puertos y orígenes requeridos. [Acceso de red a Compute en OCI](https://docs.oracle.com/en-us/iaas/Content/Security/Reference/configuration_tasks.htm)

## 5. Variables de entorno de producción

Configura las siguientes variables en el servicio de la API, usando los valores reales de producción en el gestor de secretos de OCI. No las guardes en el repositorio:

```text
NODE_ENV=production
API_PORT=3001
DATABASE_URL=postgresql://USUARIO:CONTRASENA@HOST:5432/tedxumsa?schema=public
DATABASE_MIGRATION_URL=postgresql://USUARIO:CONTRASENA@HOST:5432/tedxumsa?schema=public
WEB_ORIGIN=https://www.TU-DOMINIO
TRUST_PROXY_HOPS=1
JWT_SECRET=REEMPLAZA_CON_UN_SECRETO_ALEATORIO_LARGO
AUTH_COOKIE_SAME_SITE=lax
RESEND_API_KEY=REEMPLAZA_CON_TU_API_KEY
MAIL_FROM=<remitente verificado, si se enviarán encuestas>
```

Ejecuta las migraciones con `DATABASE_MIGRATION_URL` antes de iniciar la nueva versión de la API:

```powershell
npm.cmd exec -- prisma migrate deploy
```

Luego, inicializa o actualiza la cuenta administradora usando `ADMIN_EMAIL` y `ADMIN_PASSWORD` en el entorno de despliegue y el script `npm run db:seed-admin`. No reutilices la contraseña local como contraseña de producción.

## 6. Dominios y sesiones

Usa dominios bajo el mismo dominio registrable, por ejemplo `www.TU-DOMINIO` y `api.TU-DOMINIO`. La aplicación usa cookies HttpOnly y solicitudes con credenciales; además, el backend solo permite el origen exacto indicado en `WEB_ORIGIN`. Usar un dominio de Vercel (`*.vercel.app`) junto con otro dominio de API puede convertir la cookie en una cookie de terceros, que algunos navegadores bloquean.

## 7. Comprobación tras el despliegue

- Abre `https://api.TU-DOMINIO/api/events` y confirma una respuesta HTTP válida.
- Confirma que `https://www.TU-DOMINIO` carga los eventos.
- Prueba login/logout de administrador, formulario, selección de butaca, ticket QR y check-in.
- Comprueba que el navegador no reporte errores de CORS, CSP o cookies.
- Verifica que archivos `/uploads/...` sigan cargando tras reiniciar y actualizar la VM.
- Crea un evento de prueba, no uses datos personales reales para validar el flujo.

## Estado actual

La compilación local de frontend y backend pasó. Aún no se desplegó: esta carpeta no tiene repositorio Git/remoto configurado, la consulta de sesión de Vercel falló por bloqueo de red del entorno y no hay una VM, base OCI ni dominio configurados en esta sesión.
