# payload-agents-portal

## 1.9.10

### Patch Changes

- [#47](https://github.com/Zetesis-Labs/PayloadAgents/pull/47) [`62c8720`](https://github.com/Zetesis-Labs/PayloadAgents/commit/62c87207de7bed350860dd09f673f047e192585f) Thanks [@Fiser12](https://github.com/Fiser12)! - feat: migrate authentication from next-auth to better-auth

  - Replace next-auth (authjs) with better-auth + payload-auth plugin
  - Add better-auth client with username and genericOAuth plugins
  - Keycloak OAuth integration via better-auth genericOAuth provider
  - Refactor Keycloak hooks into dedicated module (role mapping, tenant sync)
  - Custom logout endpoint with Keycloak id_token_hint support
  - New database migration for better-auth schema (accounts, sessions, verifications)
  - Update .env.example with better-auth configuration variables

- [#48](https://github.com/Zetesis-Labs/PayloadAgents/pull/48) [`ddff955`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ddff955f155108e5ebafb052640d5f8c4f5a33a3) Thanks [@Fiser12](https://github.com/Fiser12)! - updated payload-stripe-inventory improving typing

- [#50](https://github.com/Zetesis-Labs/PayloadAgents/pull/50) [`b7cd827`](https://github.com/Zetesis-Labs/PayloadAgents/commit/b7cd8271330a8e454f444fd6a8154749eb5a9366) Thanks [@Fiser12](https://github.com/Fiser12)! - feat: add LaTeX formula editor with PDF compilation and AI assistance

  - New Formulas (Paper) collection with CodeMirror-based LaTeX editor
  - Server-side PDF compilation via pdflatex with iframe preview
  - AI-powered LaTeX editing via OpenAI integration
  - Dockerfile updated with texlive packages for LaTeX support
  - Draggable editor/preview panel divider

- [#51](https://github.com/Zetesis-Labs/PayloadAgents/pull/51) [`765f7c6`](https://github.com/Zetesis-Labs/PayloadAgents/commit/765f7c6aebed4f7bcfe6771b6ecb509fb9cf7a62) Thanks [@Fiser12](https://github.com/Fiser12)! - chore: add Graphite CI optimization to GitHub workflows

  - Added Graphite CI action to all workflows for optimized CI runs
  - Updated devcontainer with Graphite VSCode extension
  - Added Claude Code permissions for TypeScript checking and web search

- [#52](https://github.com/Zetesis-Labs/PayloadAgents/pull/52) [`637320e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/637320e1f0546405053e98225133e7730dcd4e12) Thanks [@Fiser12](https://github.com/Fiser12)! - feat: reemplazar katex-field por nuevo editor LaTeX con vista previa PDF

  - Nuevo módulo `latex-field` con arquitectura modular (componentes + hooks)
  - Editor CodeMirror con resaltado de sintaxis LaTeX (stex)
  - Vista previa PDF en tiempo real usando react-pdf
  - Barra de asistente IA para modificar LaTeX con instrucciones en lenguaje natural
  - Panel divisor redimensionable entre editor y vista previa
  - Log de compilación desplegable
  - Auto-sync opcional para compilación automática al escribir

## 1.9.9

### Patch Changes

- [`ea4e5ac`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ea4e5ac131a283f409cb381258b5c9a9d02158d4) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: typing issues in the payload-lexical-blocks-builder

- [`ea4e5ac`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ea4e5ac131a283f409cb381258b5c9a9d02158d4) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: typing issues in the payload-stripe-inventory

- Updated dependencies [[`ea4e5ac`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ea4e5ac131a283f409cb381258b5c9a9d02158d4), [`ea4e5ac`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ea4e5ac131a283f409cb381258b5c9a9d02158d4)]:
  - @nexo-labs/chat-agent@1.9.9
  - @nexo-labs/payload-indexer@1.9.9
  - @nexo-labs/payload-taxonomies@1.9.9
  - @nexo-labs/payload-typesense@1.9.9

## 1.9.8

### Patch Changes

- [`9ad7055`](https://github.com/Zetesis-Labs/PayloadAgents/commit/9ad705518ef077629e0fd579f75fc4b38bc6583f) Thanks [@Fiser12](https://github.com/Fiser12)! - chore: trigger new version

- Updated dependencies [[`9ad7055`](https://github.com/Zetesis-Labs/PayloadAgents/commit/9ad705518ef077629e0fd579f75fc4b38bc6583f)]:
  - @nexo-labs/chat-agent@1.9.8
  - @nexo-labs/payload-indexer@1.9.8
  - @nexo-labs/payload-taxonomies@1.9.8
  - @nexo-labs/payload-typesense@1.9.8

## 1.9.7

### Patch Changes

- [`b0d58ac`](https://github.com/Zetesis-Labs/PayloadAgents/commit/b0d58ac0f3ac086f2f65263322ee037649b8e3ec) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: issue autodeploying new version of mcp

- [`b0d58ac`](https://github.com/Zetesis-Labs/PayloadAgents/commit/b0d58ac0f3ac086f2f65263322ee037649b8e3ec) Thanks [@Fiser12](https://github.com/Fiser12)! - added mcp server to request stuffs to typesense

- Updated dependencies [[`b0d58ac`](https://github.com/Zetesis-Labs/PayloadAgents/commit/b0d58ac0f3ac086f2f65263322ee037649b8e3ec), [`b0d58ac`](https://github.com/Zetesis-Labs/PayloadAgents/commit/b0d58ac0f3ac086f2f65263322ee037649b8e3ec)]:
  - @nexo-labs/chat-agent@1.9.7
  - @nexo-labs/payload-indexer@1.9.7
  - @nexo-labs/payload-taxonomies@1.9.7
  - @nexo-labs/payload-typesense@1.9.7

## 1.9.6

### Patch Changes

- [`ee155bc`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee155bca67bd84b787a97265f587b06acad16694) Thanks [@Fiser12](https://github.com/Fiser12)! - fix again issues auto-deploying docker

- Updated dependencies [[`ee155bc`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee155bca67bd84b787a97265f587b06acad16694)]:
  - @nexo-labs/chat-agent@1.9.6
  - @nexo-labs/payload-indexer@1.9.6
  - @nexo-labs/payload-taxonomies@1.9.6
  - @nexo-labs/payload-typesense@1.9.6

## 1.9.5

### Patch Changes

- [`a14bb8a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/a14bb8a47681f78560f9d64d910e2024f72e8fb7) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: issue deploying docker

- Updated dependencies [[`a14bb8a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/a14bb8a47681f78560f9d64d910e2024f72e8fb7)]:
  - @nexo-labs/chat-agent@1.9.5
  - @nexo-labs/payload-indexer@1.9.5
  - @nexo-labs/payload-taxonomies@1.9.5
  - @nexo-labs/payload-typesense@1.9.5

## 1.9.4

### Patch Changes

- [`decfb88`](https://github.com/Zetesis-Labs/PayloadAgents/commit/decfb884b2bbf6e9fd49c410abe3b8623c0a758c) Thanks [@Fiser12](https://github.com/Fiser12)! - fix issue at autodeploy of docker image

- Updated dependencies [[`decfb88`](https://github.com/Zetesis-Labs/PayloadAgents/commit/decfb884b2bbf6e9fd49c410abe3b8623c0a758c)]:
  - @nexo-labs/chat-agent@1.9.4
  - @nexo-labs/payload-indexer@1.9.4
  - @nexo-labs/payload-taxonomies@1.9.4
  - @nexo-labs/payload-typesense@1.9.4

## 1.9.3

### Patch Changes

- [`552ff89`](https://github.com/Zetesis-Labs/PayloadAgents/commit/552ff892609989984e8a22e4a1b69bcc9c241b4a) Thanks [@Fiser12](https://github.com/Fiser12)! - Updated deploy workflow

- Updated dependencies [[`552ff89`](https://github.com/Zetesis-Labs/PayloadAgents/commit/552ff892609989984e8a22e4a1b69bcc9c241b4a)]:
  - @nexo-labs/chat-agent@1.9.3
  - @nexo-labs/payload-indexer@1.9.3
  - @nexo-labs/payload-taxonomies@1.9.3
  - @nexo-labs/payload-typesense@1.9.3

## 1.9.2

### Patch Changes

- Align server version with package and Docker releases.
- Updated dependencies [2106b0e]
  - @nexo-labs/payload-typesense@1.9.2
  - @nexo-labs/chat-agent@1.9.2
  - @nexo-labs/payload-indexer@1.9.2
  - @nexo-labs/payload-taxonomies@1.9.2
