-- LiteLLM DB mode uses a separate database from Payload.
-- This file is run by the idempotent litellm-db-init compose service, so fresh
-- and existing dev volumes are covered the same way.

SELECT 'CREATE DATABASE "litellm_db"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'litellm_db')\gexec
