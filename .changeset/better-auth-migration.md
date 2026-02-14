---
"payload-agents-portal": patch
---

feat: migrate authentication from next-auth to better-auth

- Replace next-auth (authjs) with better-auth + payload-auth plugin
- Add better-auth client with username and genericOAuth plugins
- Keycloak OAuth integration via better-auth genericOAuth provider
- Refactor Keycloak hooks into dedicated module (role mapping, tenant sync)
- Custom logout endpoint with Keycloak id_token_hint support
- New database migration for better-auth schema (accounts, sessions, verifications)
- Update .env.example with better-auth configuration variables
