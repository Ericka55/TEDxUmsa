# Auditoría técnica ampliada de TEDxUMSA

**Fecha de revisión:** 25 de noviembre de 2026  
**Alcance:** inspección del código del frontend y backend, estilos, configuración, rutas, esquema Prisma y dependencias instaladas; compilación de los dos workspaces. No se modificó código de la aplicación ni se usó una base con datos reales.

## Alcance y límites de evidencia

Esta auditoría distingue tres tipos de evidencia:

- **Código comprobado:** se inspeccionaron archivos y rutas. Esto demuestra qué implementa el código, no que la función se comporte bien en ejecución.
- **Compilación comprobada:** frontend y backend compilaron con `npm run build`; esto no equivale a una prueba funcional.
- **Prueba visual/funcional:** no se pudo ejecutar un navegador automatizado ni un flujo contra una base de prueba aislada. Por eso no afirmo que se haya comprobado visualmente cada pantalla ni que se haya completado ningún flujo de usuario.

La lista de rutas del frontend revisada es: `/`, `/e/[slug]`, `/s/[token]`, `/admin/forms`, `/admin/forms/[eventId]/responses`, `/admin/halls` y `/colaborador`, junto con `AdminSidebar` y `ThemeToggle`.

---

## Correcto y verificado

### Compilación y arquitectura observada

- `npm run build` terminó correctamente para los workspaces de backend y frontend. El frontend pasó compilación y comprobación de tipos. Se observaron avisos de caché Webpack, pero no errores de build.
- El acceso a PostgreSQL está en el backend mediante Prisma: `prisma/schema.prisma` declara `provider = "postgresql"` y toma la conexión de `DATABASE_URL`. `backend/src/database.module.ts` instancia `PrismaClient`; el navegador no abre conexiones directas a PostgreSQL.
- `backend/src/main.ts` carga el `.env` raíz en desarrollo, configura el prefijo `/api`, CORS desde `WEB_ORIGIN`, JSON hasta 8 MB y los archivos estáticos bajo `/uploads/`. La configuración real de producción (proxy, HTTPS, firewall, secretos y copias de seguridad) no está en el repositorio auditado.
- `.gitignore` excluye `.env` y `.env.*`, permitiendo `.env.example`. Esto es una protección del repositorio, no una comprobación de cómo se despliegan secretos en producción.

### Autenticación y permisos definidos en código

| Rol/operación | Control encontrado | Evidencia |
|---|---|---|
| Login | Busca usuario activo; verifica hash Scrypt; firma JWT HMAC con vencimiento de 8 horas. | `backend/src/auth.controller.ts`, `backend/src/auth.service.ts` |
| ADMIN y ORGANIZER | `AdminGuard` vuelve a consultar al usuario en PostgreSQL y comprueba cuenta activa, rol vigente y pertenencia a uno de esos dos roles. | `backend/src/admin.guard.ts` |
| Solo ADMIN | `AdminOnlyGuard` exige `ADMIN` tanto en el token como en el usuario actual. Se aplica a editar/eliminar eventos y configurar el mapa de un evento. | `backend/src/admin-only.guard.ts`, `backend/src/events.controller.ts` |
| COLLABORATOR | `CollaboratorGuard` valida token, cuenta activa y rol `COLLABORATOR`; la lista de eventos sale de sus asignaciones y solo incluye eventos publicados con inscripción activa. | `backend/src/collaborator.guard.ts`, `backend/src/events.controller.ts`, `backend/src/events.service.ts` |
| Inscripciones y butacas | El registro usa transacción Prisma y el esquema declara unicidad por evento/asistente, código QR, asiento/evento y reserva/inscripción. | `backend/src/events.service.ts`, `prisma/schema.prisma` |

Estas son comprobaciones del código, **no pruebas de autorización con tokens reales**. El detalle de permisos incompletos está en “Incorrecto” y “Riesgo de seguridad”.

### Funciones enlazadas en el código, sin validar su comportamiento real

Se encontraron llamadas frontend/backend para agenda pública, registro, consulta de pase, check-in, respuestas, colaboradores, salones y encuesta. El código también implementa selección de butacas, QR, descarga/impresión de ticket, compartir/agregar al calendario y carga periódica del panel. Su funcionamiento de punta a punta queda pendiente de prueba, detallada abajo.

---

## Incorrecto, requiere corrección

### V-01 — No hay una sola familia tipográfica en todos los componentes

**Archivos:** `frontend/app/styles.css`, con componentes en las siete rutas enumeradas arriba.

No: no todos los módulos, tablas, formularios, botones, menú y diálogos usan una misma familia. La hoja importa ocho familias (`styles.css:1`), y el código asigna explícitamente al menos seis:

- **Hanken Grotesk:** base del `body` (`:6`), controles globales (`:418`), menús, tablas y texto de panel; aparece también en formularios de salones, colaborador y satisfacción.
- **Barlow Condensed:** títulos, tarjetas y etiquetas de varios paneles, páginas de salones/respuestas/colaborador/satisfacción, y partes del formulario (`:321-338`, `:426`, y reglas posteriores hasta `:851`).
- **Manrope:** portada, logotipos, títulos y ticket (`:9`, `:15`, `:77`, `:122`, `:130`, `:281-302`).
- **DM Sans:** botones de navegación, tabs, tema y otras acciones (`:25`, `:46`, `:94`, `:135`, `:197`, `:219`, `:241`, `:291`).
- **Space Mono:** microetiquetas, pasos y metadatos (`:323-325`, `:562`, entre otras reglas).
- **Caveat:** intro manuscrita del formulario de evento (`:109`; se renderiza desde `frontend/app/e/[slug]/page.tsx`).
- **Bodoni Moda** y **Cormorant Garamond** se descargan en el `@import`, pero no se encontró una declaración que las aplique.
- La página de inscripción mezcla además `Georgia`/`Times New Roman` en hero, nombre del evento y descripción (`:306-309`).

**Diferencias y reglas conflictivas concretas:**

1. `.registration-page` se asigna primero a Barlow (`:321`) y después a Hanken junto a `.builder-page`, `.admin-console-shell` y `.seat-step-page` (`:430`). Por cascada, el texto que hereda la familia usa Hanken; las reglas más específicas cambian porciones a Barlow, Manrope, Space Mono o Georgia.
2. Los controles tienen Hanken por regla global (`:418`), pero el botón de inscripción vuelve a Barlow con `!important` (`:463`). Otros botones usan DM Sans, Hanken o heredan según selector; no existe una familia uniforme de botones.
3. La portada `/` usa Manrope para logotipo y títulos, DM Sans para botones, Hanken para texto y Space Mono para algunas etiquetas. El registro `/e/[slug]` usa una mezcla distinta; el ticket mantiene Manrope/Hanken/DM Sans; el panel y las respuestas mezclan Barlow/Hanken/Space Mono/DM Sans; los diálogos de salones tienen títulos Barlow y etiquetas/inputs/botones Hanken (`:486-524`).
4. La tabla de asistentes fija Hanken en encabezados y celdas (`:757-758`), mientras el título usa Barlow (`:755`). El listado individual de respuestas y sus botones reciben reglas diferentes (`:197-204`).

**Conclusión técnica:** hay una identidad tipográfica por jerarquías, pero no una sola familia. Algunas mezclas pueden ser intencionales; no se puede afirmar que el resultado “se ve bien” sin inspección visual en navegador. Debe definirse y documentarse un sistema explícito (display, texto, etiqueta y controles), retirar fuentes importadas sin uso y eliminar reglas duplicadas/conflictivas.

### V-02 — Identidad de diseño parcialmente consistente, pero no centralizada ni visualmente verificada

**Archivo principal:** `frontend/app/styles.css` (854 líneas, con reglas históricas y varias reglas repetidas).

- El rojo institucional predominante es `#DC2626`, con fondos oscuros y texto claro; existen variaciones codificadas a mano, por ejemplo `#c43a3d`, `#c90022`, `#ef3636`, diferentes negros y grises. Muchas reglas no usan variables/tokens.
- Tamaños, pesos, bordes, espaciados y estilos de botones se definen por componente y vuelven a sobrescribirse en secciones posteriores. Ejemplos: botón global (`:418`), `.builder-button` (`:94`), tabs de respuestas (`:197`), botones de selección de asiento (`:241`), controles de salones (`:512-524`) y botones del panel (`:741-754`, `:850-851`).
- El tema claro tiene reglas añadidas para varias vistas (`:220-235`, `:265-274`, `:293-294`, `:403`, `:471-532`, `:704-733`, `:843-844`), pero los overrides son selectivos y la hoja no ofrece un conjunto central de tokens semánticos que garantice paridad entre cada componente. No se comprobó contraste ni legibilidad en pantalla.
- Responsive CSS sí existe (por ejemplo `:179-205`, `:314-318`, `:353-365`, `:391-392`), pero no se probaron anchos reales ni overflow, navegación móvil, tablas, formularios, modal o mapa de butacas.
- `frontend/app/theme-toggle.tsx:19` muestra literalmente `?` en ambos estados aunque cambia la etiqueta accesible. Es un defecto visible confirmado por código.

**Conclusión:** los módulos comparten colores y recursos TEDxUMSA, pero no hay evidencia para afirmar que tamaños/espaciados/botones y tema claro sean uniformes en todos los estados. Hace falta consolidar tokens y hacer una revisión visual por ruta y viewport.

### F-01 — Colaboradores no pueden acreditar asistentes

**Archivos:** `backend/src/events.controller.ts`, `backend/src/collaborator.guard.ts`, `frontend/app/colaborador/page.tsx`, `frontend/app/admin/forms/page.tsx`.

El portal de colaborador permite iniciar sesión, ver eventos asignados y copiar/abrir el enlace de inscripción. El endpoint de check-in es `POST /api/events/admin/registrations/:confirmationCode/check-in` y usa `AdminGuard` (ADMIN/ORGANIZER), mientras `CollaboratorGuard` solo protege `GET /api/events/collaborator`. No se encontró endpoint de acreditación protegido por `CollaboratorGuard` ni interfaz de escaneo en `/colaborador`. Si el propósito de colaboradores incluye escanear y confirmar entradas, esa función no está disponible para ellos. El endpoint de check-in tampoco recibe `eventId` para limitar el token a un evento asignado.

### F-02 — `GET /api/halls` escribe datos

**Archivo:** `backend/src/halls.service.ts`, método `list()`.

La lectura migra salones heredados mediante `hall.upsert()` y `event.updateMany()` antes de listar. Eso produce escrituras y trabajo repetido al consultar. La migración debe ser una tarea explícita separada del GET.

### F-03 — Validación de request incompleta

**Archivos:** `backend/src/main.ts`, `backend/src/events.controller.ts`, `backend/src/auth.controller.ts`, `backend/src/halls.controller.ts`, `backend/src/events.service.ts`, `backend/src/halls.service.ts`.

El `ValidationPipe` global usa `whitelist` y `transform`, pero los controladores reciben `Record<string, unknown>`, no DTOs decorados; por tanto, las reglas de `class-validator` no se aplican a esos cuerpos. Hay validación manual (p. ej., correo, butacas y campos personalizados), pero textos comunes del evento/inscripción no tienen topes consistentes. El parser admite 8 MB (`main.ts:14`). Los endpoints de login, registro y encuesta también están sin control de frecuencia.

### F-04 — Registro persistente de auditoría no implementado

**Archivo:** `prisma/schema.prisma` (`AuditLog`) y servicios bajo `backend/src`.

El modelo existe, pero no se encontraron escrituras `auditLog.create` o equivalentes en los servicios revisados. Las acciones administrativas no guardan un historial funcional de actor/acción.

### F-05 — Verificación de tipo de imagen no inspecciona el contenido

**Archivo:** `backend/src/halls.service.ts`, `savePhoto()`.

La carga restringe el MIME declarado a JPEG/PNG/WebP y el tamaño a 5 MB, pero no valida firma/decodificación binaria. Los archivos se sirven directamente como estáticos desde `/uploads/`. La operación requiere acceso administrativo, lo que limita quién puede cargar; aun así, el MIME declarado no prueba que los bytes sean una imagen.

### F-06 — Consultas completas/polling cada cinco segundos

**Archivos:** `frontend/app/admin/forms/page.tsx:177,234-258`, `frontend/app/admin/forms/[eventId]/responses/page.tsx:44-64`, `backend/src/events.service.ts:316-375`.

El panel descarga de nuevo la lista de eventos y pide inscripciones por evento en intervalos de cinco segundos; la pantalla de respuestas repite la carga. Los listados no están paginados y el panel arma estadísticas desde relaciones completas. Esto aumenta consultas, tráfico y memoria con el crecimiento de datos.

---

## Pendiente de pruebas

### Tipografía y diseño visual

No se pudo cumplir la petición de inspección **visual** de todas las páginas: no se tomó una captura de navegador ni se usó una herramienta visual automatizada en esta auditoría. Lo informado en V-01/V-02 es resultado de CSS/JSX estático. Faltan capturas e inspección real de todas estas vistas en escritorio y móvil:

| Ruta/vista | Qué falta observar en navegador |
|---|---|
| `/` | portada vacía y con eventos, carga/error de API, cards, header y theme claro |
| `/e/[slug]` | formulario y acentos, preguntas configuradas, responsive, selector de asientos, ocupado/libre y tema claro |
| Estado de ticket en `/e/[slug]` | render de QR, asiento, datos, compartir, calendario y vista de impresión/PDF |
| `/s/[token]` | carga, escalas de satisfacción, envío y estado ya respondido |
| `/admin/forms` | login, dashboard por evento, menú/colapso, formularios, colaboradores, QR, check-in, cierre y métricas |
| `/admin/forms/[eventId]/responses` | tabs, respuestas individuales, texto largo, listas grandes y navegación lateral |
| `/admin/halls` | catálogo, modal, carga/preview de foto, formulario largo y menú compartido |
| `/colaborador` | login, eventos asignados, copia y apertura del link, permisos de sesión |

### Funcionalidades: qué se probó realmente y qué no

**Probado en esta revisión:**

- `npm run build` — compilación del backend y frontend correcta.
- `npm audit --omit=dev` — intentado, pero no completó: error de red al endpoint de advisories npm y error de escritura de caché. No es resultado de “sin vulnerabilidades”.
- Inspección estática de llamadas frontend, controladores, guards, servicios y esquema Prisma.

**No probado en ejecución:** no se completó ningún caso funcional HTTP/UI ni operación de base de datos. En particular, están pendientes:

1. Login correcto/incorrecto, expiración JWT, logout, usuario desactivado y rechazo de token/rol adulterado.
2. Portada con eventos activos, sin eventos, error de API y enlaces a la inscripción.
3. Creación/edición/borrado de evento; validación de estados, borrado de relaciones y persistencia de preguntas personalizadas.
4. Inscripción completa y duplicada; validación de campos; recuperación de inscripción guardada en navegador.
5. Selección de asiento disponible, rechazo de asiento bloqueado/ocupado, carreras simultáneas, expiración/reutilización de reserva y eventos sin mapa.
6. QR generado y leído, endpoint de pase, credencial compartida, impresión/PDF, calendario y compartir desde navegador/dispositivo.
7. Escáner de cámara, permisos HTTPS/cámara, navegador sin `BarcodeDetector`, entrada manual, QR inválido, doble check-in y registro de asistencia.
8. Creación, asignación y revocación de colaboradores; prueba de acceso cruzado entre eventos; permisos de check-in.
9. Crear/listar/editar salón, foto válida/inválida y actualización de eventos relacionados.
10. Finalizar evento, configurar proveedor de correo, envío real a asistentes acreditados, reintentos y enlace de encuesta; envío doble o token vencido; métricas.
11. Tema claro/oscuro persistido, teclado/lector de pantalla, contraste y layouts en anchos móvil/tablet/desktop.
12. Paginación/exportación con muchas inscripciones, carga concurrente y rendimiento de polling.

Una prueba completa requiere una base PostgreSQL **aislada y descartable**, credenciales/datos de prueba y un servicio de correo sandbox. No se usaron datos reales ni se dispararon correos.

---

## Riesgo de seguridad

### S-01 — Next.js 14.2.35 está fuera de soporte y dentro del rango de una alerta crítica condicional

**Archivo:** `frontend/package.json` pide `^14.2.25`; instalación revisada: `next@14.2.35`; `frontend/next.config.mjs` no define configuración propia de imágenes.

La versión 14.x está fuera de soporte según la política vigente de Next.js. Además, GHSA-2464-fhr4-w9xw/CVE-2026-96889 afecta `next` desde 10.0.0 hasta 15.5.27 y Next 16 hasta 16.4.0; la corrección crítica empieza en 15.5.28 y 16.4.1. La alerta describe RCE bajo condiciones de despliegue que incluyen Linux con glibc y el camino de optimización de imágenes/SVG. La instalación 14.2.35 cae en el rango vulnerable.

**Qué sí se verificó en el repositorio:** no hay uso de `next/image`; fotos del recinto se muestran como `<img>` a la API y la carga acepta MIME declarados JPEG/PNG/WebP, no SVG. Eso reduce evidencia de uso previsto del camino, pero no prueba que la ruta interna `/_next/image` sea inaccesible o que el despliegue no satisfaga las condiciones. No se intentó explotar.

**Recomendación:** usar como objetivo de actualización **Next.js 16.4.6** (release estable actual encontrado y Active LTS) con la versión compatible de React 19 indicada por Next. No instalarlo sin migración: Next 16 requiere Node.js 20.9+, elimina la compatibilidad síncrona temporal de `params`, y vuelve Turbopack el bundler por defecto. En el código, las rutas dinámicas cliente `/e/[slug]` y `/s/[token]` reciben `params` síncrono y deberán migrarse/verificarse. El proyecto ya usa TypeScript 5.9 y no define una configuración webpack custom en `next.config.mjs`, pero la compatibilidad final solo se confirma después de actualizar dependencias y compilar/probar.

Si se necesita una actualización intermedia de menor salto, **15.5.29** incluye el parche de la RCE y correcciones de advisories moderados, pero requiere React 19 y la rama 15 solo recibe seguridad hasta el 31 de enero de 2027. Por duración de soporte, 16.4.6 es preferible para la ruta de producción. No se hizo ninguna actualización en este trabajo.

Fuentes oficiales consultadas: [alerta GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [política de soporte](https://nextjs.org/support-policy), [release 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6), [guía de migración a Next 16](https://nextjs.org/docs/app/guides/upgrading/version-16), [release 15.5.29](https://github.com/vercel/next.js/releases/tag/v15.5.29).

### S-02 — Autenticación y credenciales

- JWT guardado en `sessionStorage` en páginas administrativas/colaborador (`frontend/app/admin/forms/page.tsx`, `frontend/app/admin/halls/page.tsx`, `frontend/app/colaborador/page.tsx`). Un XSS ejecutado en el origen podría leerlo; no se encontró una política CSP en el repositorio. No se probó XSS ni la configuración HTTP del servidor.
- El código firma JWT con HMAC y consulta la cuenta/rol actual en DB en cada guard, lo cual es una protección positiva. No se encontró una biblioteca de validación JWT externa; la implementación propia merece pruebas de manipulación, expiración, algoritmo y valores de claims antes de producción.
- No se encontraron límites de frecuencia en login, registro público, encuesta, ni límites de concurrencia. El login ejecuta Scrypt. Es un riesgo de agotamiento de CPU/creación abusiva si la API se publica sin mitigaciones de borde.
- `JWT_SECRET` es imprescindible en backend. No imprimir ni reutilizar valores del `.env`; revisar que producción tenga secreto aleatorio fuerte y distinto por entorno.

### S-03 — Privilegios de ORGANIZER más amplios que edición/borrado

`AdminGuard` admite tanto `ADMIN` como `ORGANIZER`. Por eso ORGANIZER puede crear eventos, leer lista y datos personales de inscripciones, escanear/acreditar, finalizar eventos, gestionar colaboradores y usar todas las rutas de salones. `AdminOnlyGuard` limita únicamente edición/borrado de evento y configuración de mapa. `HallsController` aplica `AdminGuard` a toda la clase, por lo que ORGANIZER también puede crear/editar salones.

Si el permiso de `ORGANIZER` debe equivaler a administrador, es coherente con el código. Si el requisito es que solo el administrador gestione o vea operaciones globales, hoy no se cumple. No hay asignación por evento para ORGANIZER; a diferencia de colaboradores, puede operar en todos los eventos. Definir matriz de permisos esperada y probar 401/403 por endpoint antes de exponer datos.

### S-04 — QR/encuesta son credenciales portadoras

- `GET /api/events/:slug/registrations/:confirmationCode` devuelve nombre, apellido, ocupación, evento, fecha, sede y butaca. Poseer el QR/código permite recuperar esos datos sin login; no devuelve email ni teléfono. Tratar el QR como secreto y reducir datos del endpoint si no hacen falta.
- Los links de encuesta usan `surveyToken` aleatorio de 32 bytes y solo están habilitados para inscripción confirmada, acreditada y evento cerrado. El envío limita una respuesta por inscripción mediante índice único. El endpoint público acepta el token como credencial y el informe administrativo expone nombres junto a respuestas.

### S-05 — Swagger, rutas públicas y exposición de datos

- Swagger está publicado sin guard en `/api/docs` (`backend/src/main.ts`). Expone documentación de superficie API; revisar si debe deshabilitarse/protegerse en producción.
- Rutas públicas verificadas en controller: `GET /events`, `GET /events/:slug`, `POST /events/:slug/registrations`, `GET/POST /events/satisfaction/:token` y `GET /events/:slug/registrations/:confirmationCode`. La lista pública filtra eventos publicados con inscripción habilitada; el formulario revela datos del evento y mapa de sillas, necesarios para el registro.
- Datos de asistentes (`email`, `phone`, respuestas, edad y asistencia) se devuelven en `GET /events/admin/:eventId/registrations`, protegido por `AdminGuard`. El código selecciona esos campos explícitamente. El acceso real está limitado al rol del guard, con la amplitud ORGANIZER descrita arriba.
- CORS usa un origen (`WEB_ORIGIN`), lo cual es más restrictivo que `*`, pero producción debe configurarlo explícitamente. CORS no reemplaza autenticación/autorización.

### S-06 — Validación/archivos y persistencia

- `class-validator` no gobierna cuerpos tipados como `Record<string, unknown>`; hay validaciones manuales parciales y textos sin máximos consistentes (`F-03`). Falta prueba de payloads inesperados y tamaños.
- Carga de salón restringe permisos, MIME declarado y 5 MB; no inspecciona contenido real y sirve desde `/uploads/` (`F-05`).
- No se encontraron consultas SQL crudas o cadenas interpoladas en los servicios; Prisma se usa para las consultas revisadas. No se inspeccionó en ejecución el usuario/privilegios PostgreSQL, exposición de puerto, TLS, backups ni cifrado del volumen. `DATABASE_URL` está solo del lado servidor por diseño; su protección operativa depende del entorno.
- `.env.example:2` construye `DATABASE_URL` con el usuario `postgres`, que normalmente es la cuenta administradora del clúster. Si se copia esa configuración a un entorno expuesto, una intrusión en la API podría heredar permisos sobre todo el clúster. El código no demuestra qué rol usa la base real.
- El modelo `AuditLog` no recibe escrituras y el borrado permanente borra sus filas asociadas (`backend/src/events.service.ts`). Esto limita investigación y rendición de cuentas.

**Recomendación de base de datos:** para despliegue, usar una cuenta de servicio propia con permisos limitados a la base `tedxumsa` y rotación de credenciales. No usar la cuenta `postgres` de administración desde la API.

### S-07 — Borrado permanente y conservación

La eliminación administrativa borra registros, respuestas de satisfacción, reservas, butacas y asignaciones relacionadas en una transacción; además elimina asistentes sin otras inscripciones. Esto implementa borrado real en la base principal, no prueba borrado de logs externos, emails, backups, réplicas o archivos ya descargados. La frase “sin dejar rastro” no puede certificarse con el repositorio y no hay una política visible de retención/backup.

---

## Resumen por categoría solicitado

| Categoría | Resultado verificable |
|---|---|
| Correcto y verificado | Compila frontend/backend; se observan Prisma/PostgreSQL en el backend, hash Scrypt, JWT HMAC, guards por rol/estado y constraints de unicidad en esquema. Verificación estática, no prueba runtime. |
| Incorrecto, requiere corrección | Fuentes inconsistentes y cascada CSS conflictiva; diseño no centralizado; `?` en selector de tema; GET de salones escribe; falta DTO/rate limiting; auditoría no registra; colaborador no puede acreditar. |
| Pendiente de pruebas | Todas las acciones de navegador y flujos de base listados en “Pendiente de pruebas”; responsive, contraste, cámara, email, concurrencia y roles aún no ejecutados. |
| Riesgo de seguridad | Next 14 no soportado y en rango de advisory crítico condicional; sin límites de frecuencia; JWT en sessionStorage; permisos ORGANIZER globales; QR/encuesta como bearer tokens; Swagger público; uploads sin validación de firma; `.env.example` usa la cuenta de administración PostgreSQL; configuración de producción no comprobada. |

## Herramientas/verificaciones ejecutadas

- `npm run build` — correcto para los dos workspaces.
- `npm ls --depth=0 --workspaces` — versiones principales revisadas: Next 14.2.35, React/React DOM 18.3.1, NestJS 10.4.22 y Prisma Client 6.19.3.
- `npm audit --omit=dev` — no concluyente por fallo de red al registro de npm y escritura de caché.
- Búsqueda estática de rutas, guards, llamadas fetch, familias tipográficas, overrides de tema, consultas Prisma y usos de `AuditLog`.
- Avisos Next.js cotejados con advisories, releases y política oficiales al 25-11-2026.

---

## Fase 1: fortalecimiento de seguridad (actualización 25-11-2026)

Esta sección refleja el estado posterior a los cambios de esta fase y prevalece sobre los hallazgos anteriores que describían JWT en `sessionStorage`, Next 14.2.35, permisos globales de ORGANIZER, Swagger público en producción y ausencia de logs/rate limit.

### Correcto y verificado

- **Next.js/React:** `frontend/package.json` y `package-lock.json` fijan `next@16.4.6`, `react@19.2.0`, `react-dom@19.2.0` y tipos React 19. Next 16.4.6 está fuera del rango corregido por debajo de 16.4.1 de GHSA-2464-fhr4-w9xw. Las rutas `/e/[slug]` y `/s/[token]` obtienen parámetros con `useParams`; `frontend/proxy.ts` aplica nonce CSP y `frontend/app/layout.tsx` fuerza renderizado por solicitud. Requiere Node.js >=20.9. El build Next 16 con Turbopack terminó correctamente.
- **Sesión:** `backend/src/auth.service.ts` verifica HMAC-SHA256 en tiempo constante, `alg=HS256`, `iss`, `aud`, `sub`, `role`, `jti`, `iat` y `exp`; exige un secreto de 32 caracteres. El JWT ya no se devuelve al cliente: `backend/src/auth.controller.ts` emite cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción, limitada a `/api`. La tabla `AuthSession` guarda hash de token, expiración y revocación. Los guards consultan tanto la sesión como el estado/rol actual del usuario; logout revoca la sesión. `frontend/app/api-client.ts` envía credenciales de cookie y elimina cualquier encabezado Bearer heredado. Las páginas de panel, salones, respuestas y colaboradores ya no guardan JWT en `sessionStorage` y limpian los tokens antiguos.
- **Roles aplicados en backend:** `backend/src/admin.guard.ts`, `backend/src/admin-only.guard.ts`, `backend/src/collaborator.guard.ts`, `backend/src/events.controller.ts`, `backend/src/events.service.ts` y `backend/src/halls.controller.ts` aplican esta matriz. ADMIN opera globalmente; ORGANIZER ve eventos donde tiene relación `EventCollaborator`, puede ver respuestas/datos de asistentes, check-in, cierre y colaboradores de esos eventos, pero no crear/editar/eliminar eventos ni modificar el catálogo global de salones; COLLABORATOR conserva el acceso a sus eventos publicados y enlaces de inscripción, sin endpoints de respuestas, PII o check-in. ADMIN puede crear un ORGANIZER limitado a un evento desde el control de colaboradores. La asignación se deriva del usuario autenticado y la base de datos, no de un rol enviado sin verificar en el cuerpo.
- **Cruce entre eventos:** las operaciones con `eventId` verifican la asignación de ORGANIZER. El check-in ahora exige `eventId` en la ruta y compara ese ID con la inscripción identificada por el QR/código. `listAdmin` filtra eventos por asignación. Respuestas de encuesta y registros se sirven detrás del guard del evento.
- **Datos personales:** el pase QR público dejó de devolver ocupación; mantiene nombre, apellido y datos operativos del evento/butaca que muestra el ticket. Emails, teléfonos, edad y respuestas continúan solo en la lista administrativa protegida. Los informes de satisfacción incluyen nombres y texto de respuestas, pero solo se entregan a ADMIN o al ORGANIZER asignado. La API establece `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y `Referrer-Policy`.
- **CSRF/CORS:** las mutaciones protegidas y login/logout exigen un `Origin` igual a `WEB_ORIGIN`; un origen diferente o ausente se rechaza con 403. CORS permite solo `WEB_ORIGIN` y `credentials: true`. Los fetch del frontend usan `credentials: include`.
- **Abuso y exposición:** `backend/src/main.ts` limita login a 8 solicitudes/IP/15 min, registro a 12/IP/min y encuesta a 12/IP/min, devuelve 429 y `Retry-After`; Swagger no se monta en producción. `frontend/proxy.ts` envía CSP con nonce por solicitud, `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'` y política base/form; el modo dinámico es necesario para que Next inserte el nonce. Se permite `style-src 'unsafe-inline'` por los estilos inline dinámicos.
- **Auditoría administrativa:** `backend/src/audit.interceptor.ts` registra usuario, método, ruta, entidad y estado HTTP para mutaciones autenticadas, sin incluir cuerpos ni datos personales. Se eliminó del borrado de eventos la eliminación explícita de logs históricos; al eliminarse el evento, la FK `SetNull` conserva el historial sin asociación al evento.
- **Carga de imágenes:** `backend/src/halls.service.ts` comprueba que la firma inicial de bytes JPEG, PNG o WebP concuerde con el MIME declarado, además del límite de 5 MB. Ya no confía solo en el MIME enviado por el navegador.
- **PostgreSQL:** `prisma/schema.prisma` separa `DATABASE_URL` (runtime) y `DATABASE_MIGRATION_URL` (migraciones). `.env.example` usa `tedxumsa_app` y `tedxumsa_migrator`, sin `postgres`; `docs/postgres-cuentas-servicio.md` explica el aprovisionamiento con pgAdmin y permisos mínimos. La migración `prisma/migrations/20261125000000_add_auth_sessions/migration.sql` solo crea tabla, índices y FK; no se conectó ni se cambió información de ninguna base real.
- **Pruebas ejecutadas:** `npm run build` compila ambos workspaces; `npm test --workspace=@tedxumsa/api` pasa 3 pruebas unitarias: firma/claims y expiración JWT, 401 sin identidad, 403 por acceso cruzado de ORGANIZER y acceso ADMIN. Son pruebas unitarias con Prisma simulado, no integración HTTP/PostgreSQL.

### Incorrecto, requiere corrección

- `npm audit` reporta **27 vulnerabilidades** en el árbol actual: 14 altas, 10 moderadas, 3 bajas y 0 críticas. Incluye `@nestjs/platform-express` y dependencias (`body-parser`, `multer`), `@nestjs/swagger`, `@nestjs/cli`, `prisma`/`@prisma/config` y transitivas. `npm audit fix` sin `--force` no redujo el total. npm propone Nest 12.6.2, Nest CLI 12.0.15 y Swagger 12.1.2 para varias correcciones: son saltos mayores y no se aplicaron sin una fase de compatibilidad. Prisma 6.19.3 es la versión 6 más nueva consultada; el fix de su alerta requiere salir de esa línea. Ver salida de `npm audit --json` del 25-11-2026.
- El acceso de ORGANIZER se limita por asignación, pero la matriz no se probó mediante peticiones HTTP concurrentes a PostgreSQL. Los tests cubren solo guards con mocks; faltan pruebas de cada endpoint/rol y de acceso cruzado de registros, tickets y encuestas.
- La validación de imágenes comprueba firmas, pero no decodifica ni vuelve a codificar el archivo completo. Un archivo truncado o malformado que conserve una cabecera válida todavía podría almacenarse.

### Pendiente de pruebas

- Aplicar la migración de `AuthSession` en una base aislada y probar login, expiración, logout, cambio/desactivación de rol, cookies, `Origin`, CORS y respuestas HTTP reales 401/403. El código de sesión no funcionará hasta crear la tabla.
- Verificar en navegador que CSP no bloquee fuentes, estilos, imágenes, QR, login, respuestas y navegación; comprobar nonce, móvil y despliegue HTTPS. El build no comprueba visualmente la ejecución del proxy en producción.
- Probar límites 429 y `Retry-After`, varios workers, tráfico detrás de proxy y fallos/carga.
- Probar auditoría al crear, modificar, borrar, cerrar evento, gestionar colaboradores y acreditar; confirmar conservación de logs en PostgreSQL.
- Probar imágenes con firmas válidas/inválidas y decodificación real.
- Configurar en pgAdmin y verificar que el runtime no use `postgres`; confirmar grants CRUD y que la cuenta de migraciones solo se use en migraciones. No se inspeccionó ni modificó `.env` real. Añadir `DATABASE_MIGRATION_URL` al entorno local antes de ejecutar Prisma.
- Ejecutar pruebas funcionales restantes en una base descartable y servicio de correo de prueba. No se usaron datos reales ni se enviaron correos.

### Riesgo de seguridad

- Next 14.2.35 se sustituyó por Next 16.4.6 y el build pasó, pero `npm audit` identifica 27 avisos, 14 altos. Avisos de Nest afectan dependencias de API; muchas correcciones anunciadas requieren Nest 12 y no se aplicaron para evitar un salto mayor sin pruebas de compatibilidad. El sistema no está libre de vulnerabilidades.
- La migración de sesión no se aplicó. `.env` local no se tocó y podría seguir usando `postgres`; hasta aprovisionar/configurar `tedxumsa_app`, no se puede afirmar que runtime use privilegios mínimos.
- El rate limit usa memoria del proceso, no comparte contadores entre instancias. Detrás de proxy hay que definir `TRUST_PROXY_HOPS` correctamente. Producción multi-instancia requiere límite compartido o de borde.
- La CSP permite estilos inline por atributos; desarrollo añade `unsafe-eval`, pero producción no habilita `unsafe-inline` para scripts. Hosting HTTPS y cabeceras no fueron comprobados.
- QR y encuesta continúan siendo credenciales portadoras. El pase devuelve los campos necesarios para ingreso y el token de encuesta permite enviar una respuesta; ambos deben tratarse como secretos.
- Swagger queda deshabilitado en producción y activo en desarrollo; no se configuró autenticación aparte para habilitarlo manualmente en producción.

| Clasificación | Estado posterior a Fase 1 |
|---|---|
| Correcto y verificado | Builds de frontend/backend; Next 16.4.6 y React 19.2 fijados; sesión revocable por cookie en código; guards por rol/evento; CSP, CORS, rate limit y logs implementados; 3 tests unitarios aprobados. |
| Incorrecto, requiere corrección | `npm audit`: 27 avisos, 14 altos. Fixes principales requieren Nest 12 y Prisma fuera de v6; validación de imagen no decodifica el archivo entero. |
| Pendiente de pruebas | Migración/sesión con base aislada, endpoints 401/403, navegador/CSP, rate limit, auditoría, imágenes, correo y privilegios PostgreSQL. |
| Riesgo de seguridad | Cuenta PostgreSQL runtime no provisionada; migración de sesión sin aplicar; avisos npm altos/moderados; límite en memoria y despliegue/proxy/HTTPS no comprobados. |

**Medición adicional de runtime (después de clasificar `@nestjs/schematics` como dependencia de desarrollo):** `npm audit --omit=dev` reporta 14 vulnerabilidades instaladas para runtime: 10 altas y 4 moderadas, 0 críticas. Los paquetes indicados son `@nestjs/platform-express`, `@nestjs/swagger`, `@prisma/config`, `body-parser`, `deepmerge-ts`, `effect`, `js-yaml`, `lodash`, `multer`, `prisma`, `@nestjs/common`, `@nestjs/core`, `file-type` y `qs`. Las correcciones mayores de Nest/Prisma quedan pendientes de migración y pruebas.

## Fase 2: sistema de diseño global (actualización 25-11-2026)

Alcance: hoja compartida `frontend/app/styles.css` y control global de tema `frontend/app/theme-toggle.tsx`. Rutas incluidas en el CSS común: portada `/`, registro `/e/[slug]`, selección de butacas, ticket `/s/[token]`, administración `/admin/forms`, respuestas `/admin/forms/[eventId]/responses`, salones `/admin/halls` y colaboradores `/colaborador`.

### Correcto y verificado

- **Familias:** se eliminó la carga y uso de Manrope, DM Sans, Caveat, Georgia, Times New Roman, Bodoni Moda y Cormorant Garamond. `styles.css` importa solo Hanken Grotesk, Barlow Condensed y Space Mono. Las variables `--font-body`, `--font-display` y `--font-mono` centralizan su uso: Hanken para contenido, controles, tablas y navegación; Barlow Condensed para títulos y elementos de marca; Space Mono para códigos y etiquetas técnicas breves. Las búsquedas estáticas en `frontend/app` no encontraron las familias retiradas ni `fontFamily` inline. Se corrigieron asignaciones explícitas que hacían que el registro, ticket y panel administrativo heredaran Barlow como texto general.
- **Tokens:** `styles.css` declara familias, escalas tipográficas, pesos, rojo TEDx (`--tedx-red`), superficies, texto, borde, radios, espaciado, sombra y foco. El tema claro redefine variables semánticas para fondo, texto, superficies y bordes. El rojo institucional existente se conserva.
- **Tema:** el botón no representa más el tema con `?`; ahora usa iconos SVG accesibles y conserva el nombre de acción en `aria-label` y `title`. El control tiene foco visible, colores ligados a variables y fondo legible en ambos esquemas. La preferencia continúa persistiendo en `localStorage`.
- **Responsive estático:** la hoja tiene breakpoints entre 420 y 1050 px para registro, ticket, administración, salones, respuestas y colaborador; tablas, mapas de butacas, galerías y menús con contenido ancho tienen contenedores de desplazamiento. Se limitó el ancho global y el desbordamiento horizontal del documento.
- **Build:** `npm.cmd run build` completó `nest build` y `next build` correctamente. Next reportó las rutas dinámicas `/`, `/admin/forms`, `/admin/forms/[eventId]/responses`, `/admin/halls`, `/colaborador`, `/e/[slug]` y `/s/[token]`.

### Incorrecto, requiere corrección

- La auditoría estática del CSS encontró selectores repetidos por cascadas acumuladas: 259 claves de selector aparecen más de una vez, con 385 apariciones repetidas adicionales en 1.428 reglas analizadas. Muchas son ajustes responsivos o de módulos añadidos en distintas iteraciones. Aunque las reglas tipográficas globales se corrigieron, la hoja aún necesita una refactorización por componentes para reducir overrides y valores visuales duplicados; no se reescribió toda la cascada en esta fase para evitar alterar layouts funcionales sin una revisión visual.
- El inventario de tokens ya centraliza los fundamentos, pero numerosos fondos, bordes y espaciados históricos continúan como valores directos dentro de reglas de cada módulo. Esto limita cuánto puede cambiarse todo el sistema desde una sola variable.

### Pendiente de pruebas

- No había navegador automatizado, Playwright ni ejecutable de navegador disponible en el entorno; por ello no se tomaron capturas ni se pudo comprobar renderizado real en escritorio, tablet y móvil. La build verifica sintaxis y tipos, no contraste ni desbordamientos que solo aparecen en el navegador.
- No se comprobó visualmente el contraste WCAG en los dos temas, la carga de Google Fonts bajo CSP, modales, notificaciones, navegación, tablas, formularios largos ni puntos de quiebre en dispositivos reales. Los ajustes responsive se inspeccionaron en CSS y necesitan una pasada visual.
- La interfaz de tema se comprobó en código, pero no se ejecutó una interacción de cambio y recarga en navegador.

### Riesgo visual pendiente

- La tipografía ahora usa solo las tres familias definidas, pero Space Mono aún se usa en detalles pequeños heredados (incluidas etiquetas de mapas y códigos); hay textos de 5–8 px en algunos paneles. Debe revisarse su legibilidad y contraste con capturas a escala real.
- La página tiene varios bloques históricos de reglas CSS repetidas. La build pasó, pero estos overrides hacen más difícil predecir cambios futuros y pueden producir diferencias entre temas o breakpoints. La unificación tipográfica no equivale a una aprobación visual de todos los módulos.

| Clasificación | Estado posterior a Fase 2 |
|---|---|
| Correcto y verificado | Tres familias declaradas; referencias tipográficas antiguas eliminadas; tokens de diseño y tema añadidos; selector `?` sustituido; build de frontend y backend completada. |
| Incorrecto, requiere corrección | 259 selectores CSS repetidos; valores de color y espaciado aún duplicados en estilos de módulo. |
| Pendiente de pruebas | Capturas y revisión visual de todas las rutas en ambos temas y en escritorio/tablet/móvil; contraste, interacción del selector y carga de fuentes con CSP. |
| Riesgo visual pendiente | Etiquetas pequeñas y cascada histórica pueden afectar legibilidad y consistencia; no se pudo certificar el resultado visual sin navegador. |

### Actualización operativa posterior: migración local de sesiones

- El 25-11-2026 se configuró `DATABASE_MIGRATION_URL` en el `.env` local como referencia a `DATABASE_URL`, ya que faltaba esa variable y Prisma detenía `migrate deploy` con P1012. No se mostró ni se añadió ninguna credencial al repositorio.
- `npm.cmd exec -- prisma migrate deploy` encontró ocho migraciones y aplicó correctamente solo `20261125000000_add_auth_sessions` a `tedxumsa`, esquema `public`, en `localhost:5432`. El SQL agrega la tabla `AuthSession`, índices y una clave foránea; no modifica filas existentes.
- **Pendiente:** reiniciar la API y comprobar login, cookie, consulta de sesión y logout contra esa base.
- **Riesgo local:** al referenciar `DATABASE_URL`, la cuenta usada por la aplicación también pudo aplicar DDL. Mantén esa configuración solo para desarrollo local; producción debe usar una URL de migración con cuenta separada y una cuenta runtime con privilegios mínimos.

## FASE 3 — Correcciones funcionales (2026-11-26)

### Correcto y verificado

- **F-01 Acreditacion:** `backend/src/events.controller.ts` agrega `POST /api/events/collaborator/:eventId/check-in/:confirmationCode`, protegido por `CollaboratorGuard`. El servicio comprueba la asignacion del colaborador en backend y que el QR pertenezca al mismo evento. La actualizacion condicional de `checkedInAt IS NULL` evita dos escrituras de acreditacion; las llamadas repetidas se identifican con `alreadyCheckedIn`. Para colaboradores, la respuesta solo incluye nombre y apellido, sin correo. `frontend/app/colaborador/page.tsx` ahora lista eventos asignados, abre el escaner QR y ofrece ingreso manual del codigo.
- **F-02 GET salones:** `HallsService.list()` ahora ejecuta solo `hall.findMany`. La migracion heredada se traslado a `backend/src/migrate-legacy-halls.ts` y se puede ejecutar explicitamente con `npm run db:migrate-halls`; esta tarea no se ejecuto durante esta fase para evitar tocar datos existentes.
- **F-03 Validacion:** `backend/src/dto.ts` define DTOs para login, eventos, registro, colaboradores, salones y encuestas. Los controladores usan esos DTOs; `ValidationPipe` activa `whitelist`, `forbidNonWhitelisted` y `transform`. Se fijaron limites de texto, enteros, correo, fecha, edad, butacas, campos requeridos y propiedades inesperadas. La carga de foto tiene tope de cuerpo de 8 MB y base64 de 7 MB.
- **F-04 AuditLog:** `backend/src/audit.interceptor.ts` escribe acciones de mutacion autenticadas con actor, accion HTTP, ruta/entidad, id del evento o entidad y estado final. No registra cuerpos. La prueba unitaria confirma que un campo de contrasena del body no aparece en el log. En borrado de evento la FK guarda `eventId` nulo para preservar el log y `entityId` conserva el identificador eliminado.
- **F-05 Imagenes:** `backend/src/halls.service.ts` decodifica la imagen con Sharp, compara el formato detectado contra el MIME declarado y limita a JPEG/PNG/WebP, 5 MB y 25 MP. Se rechazan bytes no decodificables aunque declaren `image/png`.
- **F-06 Rendimiento:** `EventsService.listAdmin()` calcula conteos de inscripciones con `_count`, sin traer todos los registros de asistentes. El panel actualiza eventos cada 15 segundos solo con la pestaña visible, y carga inscripciones del evento seleccionado en paginas de 50; permite cargar mas y el CSV recorre todas las paginas. El panel de respuestas sigue reuniendo paginas de 100 para conservar la navegacion de todas las respuestas.
- **Pruebas automatizadas:** `npm test --workspace=@tedxumsa/api` ejecuta 10 pruebas, 9 pasaron y la de PostgreSQL se omitio cuando no habia URL de test. Las pruebas cubren JWT y 401/403 existentes; tambien asignacion, acceso cruzado, idempotencia de check-in, eventos cerrados, respuesta sin correo, GET salones sin escrituras, DTOs, rechazo de bytes de imagen invalidos y contenido del AuditLog. `npm run build --workspace=@tedxumsa/api` y `npm run build --workspace=@tedxumsa/web` finalizaron correctamente.

### Incorrecto, requiere correccion

- No se detecto una falla funcional nueva en los flujos unitarios cubiertos. `formFields` y `seatLayout` aceptan JSON en los DTO y su estructura se filtra/normaliza en los servicios; no existe validacion declarativa recursiva de cada objeto anidado.
- El limite de solicitudes sigue siendo en memoria por proceso; para despliegues con varias instancias se necesita un limitador compartido.

### Pendiente de pruebas

- No fue posible iniciar un clúster aislado local de PostgreSQL: `initdb` fue bloqueado por el entorno de ejecucion de Windows (fallo al crear/re-ejecutar el token restringido). El servicio PostgreSQL existente pide contrasena y no se utilizo ni se consulto con la URL de `.env`. Por tanto, las pruebas reales contra PostgreSQL, constraints, migraciones y rollback quedan pendientes. Se agrego `scripts/migrate-test-db.mjs`, que solo permite `localhost` y la base exacta `tedxumsa_phase3_test`; definir `TEDX_TEST_DATABASE_URL` y preparar esa base separada para ejecutar esta prueba. La prueba de integracion usa datos sinteticos dentro de una transaccion que termina en rollback.
- No se comprobo lectura de camara en distintos navegadores/dispositivos, ni el permiso de camara en HTTPS; el ingreso manual del codigo queda disponible como alternativa.
- No se hicieron pruebas de carga del panel ni revision visual en navegador. La vista de respuestas conserva el listado completo paginado en memoria del cliente al terminar de recorrer las paginas.
- No se ejecuto `npm audit` en esta fase porque no es uno de los hallazgos funcionales y el informe previo conserva el resultado de seguridad vigente.

### Riesgo de seguridad

- La auditoria de acciones administrativas se dispara al finalizar cada respuesta HTTP y el fallo de escritura se captura para no tumbar la solicitud. Hace falta probar la persistencia real en PostgreSQL y definir alertas/retencion del log en produccion.
- No se aplico la migracion heredada de salones ni se modificaron registros de base de datos existentes.
- La prueba de integracion de F-01 contra PostgreSQL sigue pendiente por la limitacion local descrita arriba; las pruebas ejecutadas de ese flujo son unitarias con Prisma simulado.

| Clasificacion | Estado posterior a Fase 3 |
|---|---|
| Correcto y verificado | Rutas de acreditacion por evento, DTOs y pipe estricto, GET de salones de solo lectura, decodificacion Sharp, AuditLog inspeccionado y optimizacion/paginacion del panel; builds y pruebas unitarias pasan. |
| Incorrecto, requiere correccion | Validacion recursiva de JSON anidado y rate limit compartido para multiples instancias. |
| Pendiente de pruebas | Integracion PostgreSQL aislada, flujos HTTP/roles reales, escaneo con camara y carga/experiencia visual. |
| Riesgo de seguridad | Persistencia de AuditLog y privilegios/constraints se deben confirmar en una base aislada antes de declarar la fase completa en produccion. |