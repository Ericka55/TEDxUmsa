# Cuentas de servicio PostgreSQL para TEDxUMSA

La API debe usar `tedxumsa_app`, una cuenta limitada a la base `tedxumsa`. Prisma usa `DATABASE_URL` para consultas de runtime y `DATABASE_MIGRATION_URL` solo al aplicar migraciones. En el entorno local, el 25-11-2026 se aplicó la migración pendiente de `AuthSession`; para resolver la variable faltante, `DATABASE_MIGRATION_URL` quedó referenciada a `DATABASE_URL`. Esa referencia compartida es solo una solución local: en producción usa una cuenta separada para migraciones y una cuenta runtime con privilegios mínimos.

## Crear las cuentas con pgAdmin

1. Conecta pgAdmin con una cuenta administradora del servidor.
2. En **Login/Group Roles**, crea el login `tedxumsa_app`, define una contraseña propia y habilita **Can login?**. No le des atributos Superuser, Create role ni Create databases.
3. Crea `tedxumsa_migrator` como login separado. Restringe su acceso a la base `tedxumsa`; úsalo solo para migraciones y no lo configures como usuario de la API en producción.
4. En las propiedades de la base `tedxumsa`, configura `tedxumsa_app` con permiso de conexión y uso del esquema `public`. En **Privileges** de cada tabla y secuencia de `public`, concede al runtime `SELECT`, `INSERT`, `UPDATE`, `DELETE` y `USAGE/SELECT/UPDATE` de secuencia según corresponda. Evita `TRUNCATE`, `REFERENCES`, `TRIGGER`, `CREATE` y privilegios de administración.
5. La cuenta de migración necesita permiso de crear/alterar objetos del esquema. Mantén su contraseña separada y úsala solo durante migraciones. Los objetos futuros también deben otorgar al runtime sus privilegios de CRUD; confirma los permisos por defecto tras cada migración.
6. Copia los valores a `DATABASE_URL` y `DATABASE_MIGRATION_URL` en el `.env` local, mantén ambos fuera del repositorio y reinicia la API.

El archivo `.env.example` contiene nombres y marcadores, no credenciales funcionales. No pegues aquí contraseñas reales. Si pgAdmin solo tiene el usuario `postgres`, esa es una cuenta administrativa de conexión; no es la cuenta del usuario `admin@tedxumsa.org` de la tabla de aplicación.

La migración `20261125000000_add_auth_sessions` solo agrega la tabla para sesiones revocables y sus índices/relación. No borra ni actualiza filas preexistentes.
