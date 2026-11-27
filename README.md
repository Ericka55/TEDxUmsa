# TEDxUMSA · Gestión de eventos

Plataforma para publicar eventos, registrar asistentes, asignar butacas y administrar la operación desde un panel privado.

## Arquitectura

Proyecto organizado en dos carpetas: `frontend` (Next.js) y `backend` (NestJS, API REST). PostgreSQL con Prisma es la fuente de verdad. La arquitectura, entidades y reglas de concurrencia están en [docs/arquitectura.md](docs/arquitectura.md).

## Desarrollo

Requiere Node.js 20+, npm y PostgreSQL instalado localmente para usar el creador de formularios. Docker no es necesario.

1. Instala e inicia PostgreSQL localmente. En pgAdmin, conectado como `postgres`, abre Query Tool y crea la base:

   ```sql
   CREATE DATABASE tedxumsa OWNER postgres;
   ```
2. Copia `.env.example` como `.env`; reemplaza `CAMBIA_ESTA_PASSWORD` con la contraseña de PostgreSQL del usuario `postgres`, y cambia también las credenciales del administrador y el secreto JWT. Si la contraseña incluye símbolos como `@`, `:` o `/`, codifícalos para usarlos en la URL.
3. Instala dependencias: `npm install`.
4. Genera Prisma y crea el esquema: `npm run db:generate` y `npm run db:migrate -- --name init`.
5. Crea la cuenta inicial en la tabla `User`: `npm run db:seed-admin`. Este paso toma `ADMIN_EMAIL` y `ADMIN_PASSWORD` del `.env`, y guarda la contraseña como hash.
6. Inicia cada aplicación en su propia terminal (consulta los comandos de abajo).

Web: `http://localhost:3000`. API: `http://localhost:3001/api`; Swagger: `/api/docs`.

### Iniciar frontend y backend en terminales separadas

Primero instala las dependencias una vez, desde la raíz del proyecto:

```powershell
npm install
```

Terminal 1, API:

```powershell
cd C:\Users\HP\Desktop\TEDX\SISTEMA\backend
npm run dev
```

Terminal 2, web:

```powershell
cd C:\Users\HP\Desktop\TEDX\SISTEMA\frontend
npm run dev
```

Deja abiertas las dos terminales mientras uses el sistema. También puedes ejecutar `npm run dev` desde la raíz para arrancar ambas juntas.

La página inicial usa una portada cinematográfica con una fila horizontal de eventos publicados desde la base. El administrador entra a `/admin/forms`, configura el evento, crea el salón y distribuye butacas disponibles, bloqueadas o pasillos, además de elegir qué preguntas mostrar. El sistema publica una URL `/e/<slug>` para compartir; allí el participante selecciona una butaca y completa su inscripción. Las inscripciones concurrentes no pueden confirmar la misma butaca. Cada inscripción devuelve un código único. No se precargan asistentes ficticios.

## Seguridad

El login comprueba cuentas de la tabla `User`; las contraseñas se guardan como hashes scrypt. `ADMIN_EMAIL` y `ADMIN_PASSWORD` solo se usan para crear o restablecer la cuenta inicial con `npm run db:seed-admin`. El JWT vence en ocho horas. No publiques la contraseña de ejemplo. Antes de producción, añade una interfaz para gestionar cuentas, HTTPS, correo verificado y una política de privacidad aprobada.

## QR y control de asistencia

Al inscribirse, cada participante recibe un pase QR descargable con su codigo de confirmacion. El panel `/admin/forms` muestra las inscripciones y el total de asistentes que ya ingresaron; esos datos se actualizan cada cinco segundos. En el panel se puede escanear el QR con la camara o ingresar el codigo manualmente. Un codigo ya utilizado se reconoce como asistencia previamente confirmada.

Si la base de datos ya estaba creada antes de agregar el control de asistencia, detene las terminales de frontend y backend con `Ctrl+C`, vuelve a la raiz y ejecuta una vez:

```powershell
npm install
npm run db:migrate
npm run db:generate
```

Luego vuelve a iniciar frontend y backend en sus terminales habituales.

## Colaboradores y cierre del evento

Desde el dashboard de cada evento, el administrador puede crear colaboradores con correo y contrasena temporal. El colaborador inicia sesion en `http://localhost:3000/colaborador` y vera unicamente los eventos que tiene asignados; desde alli puede abrir el formulario publico para ayudar a completar inscripciones.

Para enviar la encuesta de satisfaccion al terminar un evento, configura `RESEND_API_KEY` y `MAIL_FROM` en `.env`. `MAIL_FROM` debe ser un remitente de un dominio verificado en Resend. Al pulsar **Terminar evento**, las inscripciones se cierran y se envia un enlace unico a cada persona cuyo QR fue acreditado. Los envios pendientes se pueden reintentar desde el dashboard. El resumen muestra promedios, distribucion de calificaciones y comentarios recibidos.

Para actualizar una base existente con colaboradores y encuestas, detene el backend y ejecuta desde la raiz:

```powershell
npm run db:migrate
npm run db:generate
```
