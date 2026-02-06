#!/bin/sh
# Definir la ruta absoluta donde debe ejecutarse el script

# No necesitamos crear el archivo .env, ya lo creamos en el Dockerfile
# y establecimos los permisos correctos

# Iterar sobre todas las variables de entorno y guardarlas en el archivo .env
echo "Guardando variables de entorno en .env..."
: > /app/apps/server/.env # Limpiar el archivo .env
for var in $(printenv)
do
  # Formato esperado: VAR_NAME=value
  # Filtrar la variable para evitar que algunas variables sensibles de Docker se guarden.
  if echo "$var" | grep -q -v '^PWD=\|^SHLVL=\|^_=.\|^OLDPWD=\|^HOME=\|^HOSTNAME=\|^PATH=\|^TERM='; then
    echo "$var" >> /app/apps/server/.env
  fi
done
# Instalamos dependencias si no existen
echo "Verificando dependencias..."
if [ ! -d "/app/node_modules/react" ]; then
  echo "Instalando dependencias con pnpm..."
  cd /app
  # No necesitamos ejecutar corepack enable pnpm
  # ya lo hicimos en el Dockerfile como root
  
  # Usamos --frozen-lockfile para asegurar consistencia con lo definido en el lockfile
  # Instalamos todas las dependencias, incluyendo las de desarrollo para el build
  pnpm i --frozen-lockfile
  echo "Dependencias instaladas correctamente."
else
  echo "Dependencias ya instaladas, omitiendo instalación."
fi

# Verificar si las variables de conexión a la base de datos están definidas
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL no está definida. No se puede continuar."
  exit 1
fi

echo "Esperando que la base de datos esté disponible..."
# Extraer host y puerto de DATABASE_URL (asumiendo formato postgresql://username:password@host:port/database)
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\).*/\1/p')
if [ -z "$DB_HOST" ]; then
  # Si no hay @ en la URL, intentar otro patrón (postgresql://host:port)
  DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*\/\/\([^:]*\).*/\1/p')
fi

DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

# Si no se puede extraer el puerto, usar el puerto por defecto de PostgreSQL
if [ -z "$DB_PORT" ]; then
  DB_PORT=5432
fi

echo "Intentando conectar a PostgreSQL en $DB_HOST:$DB_PORT..."


# Ejecutar el build
cd /app
echo "Ejecutando build del proyecto..."
pnpm next build --experimental-build-mode generate

# Ejecutar el comando proporcionado
exec "$@"
