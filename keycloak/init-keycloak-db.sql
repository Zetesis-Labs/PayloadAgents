-- Script de inicialización para crear la base de datos de Keycloak
-- Este script se ejecuta automáticamente cuando PostgreSQL inicia por primera vez

-- Crear usuario keycloak si no existe
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'keycloak') THEN
      
      CREATE ROLE keycloak LOGIN PASSWORD 'keycloak';
   END IF;
END
$do$;

-- Crear base de datos keycloak-db si no existe
SELECT 'CREATE DATABASE "keycloak-db" OWNER keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak-db')\gexec

-- Otorgar permisos al usuario keycloak
GRANT ALL PRIVILEGES ON DATABASE "keycloak-db" TO keycloak; 