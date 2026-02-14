---
"payload-agents-portal": patch
---

feat: reemplazar katex-field por nuevo editor LaTeX con vista previa PDF

- Nuevo módulo `latex-field` con arquitectura modular (componentes + hooks)
- Editor CodeMirror con resaltado de sintaxis LaTeX (stex)
- Vista previa PDF en tiempo real usando react-pdf
- Barra de asistente IA para modificar LaTeX con instrucciones en lenguaje natural
- Panel divisor redimensionable entre editor y vista previa
- Log de compilación desplegable
- Auto-sync opcional para compilación automática al escribir
