# Respuesta cruda de Claude Web — Prompt 05 (Casos de uso)

Fecha de ejecución: 2026-04-29.
Modelo: Claude (familia 4.X, web).

---

NOTA del equipo: Claude generó los CU referenciando un backlog de RF/RNF
distinto al consolidado en `secciones/03-requerimientos.tex` (la
respuesta usa RF-46, RF-60, etc., proponiendo implícitamente un backlog
ampliado). El informe LaTeX final mantiene como autoritativa la
numeración de la sección 03 (RF-01..RF-24, RNF-01..RNF-15). Las
referencias de Claude se conservan aquí como evidencia de la respuesta
cruda y como insumo para una iteración futura del backlog.

---

## CU-01: Realizar entrevista individual

- Actor primario: Estudiante candidato.
- Actores secundarios: LLM (entrevistador y coach), MediaPipe en cliente,
  STT/TTS, PostgreSQL + S3.
- Objetivo: Completar una sesión simulada con feedback multimodal
  continuo y obtener un plan de mejora personalizado.
- Precondiciones: Usuario autenticado; CV cargado; consentimiento
  biométrico granular vigente; mic y cámara verificados.
- Postcondiciones: Sesión registrada con transcripción y métricas; plan
  de mejora generado y disponible para descarga.

Flujo principal:
1. Selecciona industria, rol y nivel; persistencia en sesión.
2. Captura audio del micrófono y verifica blobs válidos.
3. Extrae landmarks faciales y corporales en cliente sin enviar
   fotogramas crudos.
4. LLM genera primera pregunta contextualizada al CV; TTS la sintetiza
   dentro del umbral conversacional.
5. Estudiante responde; aura actualiza fluidez y tono; cuenta
   muletillas y pérdidas de contacto visual prolongadas.
6. LLM ajusta dificultad de la siguiente pregunta según desempeño previo.
7. Repite ciclo hasta cumplir tiempo o número configurado.
8. Genera plan de mejora en PDF y persiste en bucket S3.
9. Antes del feedback completo, advierte sobre naturaleza artificial
   del evaluador y posibles sesgos.

Flujos alternativos:
- 5a. Inactividad o bloqueo prolongado: despliega asistente lateral
  con sugerencias.
- 5b. Desconexión o falla de periférico: pausa automática y notifica.
- 1a. Sin consentimiento biométrico: no inicia pipeline multimodal y
  ofrece variante restringida sin cámara, manteniendo el resto.

## CU-02: Configurar perfil y preferencias de accesibilidad

- Actor primario: Estudiante (incluye S3-S6).
- Objetivo: Personalizar accesibilidad e idioma de modo persistente
  entre sesiones y dispositivos.
- Precondiciones: Usuario autenticado.
- Postcondiciones: Preferencias persistidas y aplicadas en flujos
  posteriores; sincronización efectiva entre dispositivos.

Flujo principal:
1. Acceso a configuración del perfil.
2. Activa, si lo requiere, modo de alta visibilidad y soporte para
   lector de pantalla (WCAG 2.2 AA).
3. Activa subtítulos descriptivos y señales visuales para tono y ritmo.
4. Activa control total por comandos de voz.
5. Selecciona idioma de la interfaz.
6. Sistema persiste y aplica desde el siguiente flujo.
7. Sincroniza entre dispositivos.

Flujos alternativos:
- 2a. Si la auditoría detecta incumplimiento del umbral, bloquea el
  guardado e indica el criterio incumplido.
- 4a. Si el navegador no concede permisos al reconocedor de voz,
  deshabilita la opción y notifica.

## CU-03: Realizar mock interview entre pares

- Actor primario: Estudiante (rol candidato).
- Actores secundarios: Estudiante (rol observador), señalización WebRTC,
  MediaPipe en cliente, LLM moderador.
- Objetivo: Entrevista colaborativa P2P con feedback cruzado.
- Precondiciones: Ambos autenticados; consentimiento biométrico
  vigente cuando se compartan métricas; emparejamiento confirmado.

Flujo principal:
1. Confirman emparejamiento y rol inicial.
2. Establece WebRTC y abre canal de datos.
3. Cada par confirma alcance del consentimiento sobre datos biométricos.
4. Captura audio y landmarks del candidato; verifica que la carga útil
   al backend no contiene fotogramas originales.
5. Observador recibe métricas autorizadas y emite comentarios
   estructurados.
6. Aura del candidato se actualiza con la latencia exigida.
7. Al cierre, los pares pueden invertir roles y reiniciar dentro del
   mismo emparejamiento.

Flujos alternativos:
- 3a. Sin consentimiento sobre métricas biométricas: la sesión continúa
  sin compartirlas con el observador y se señala visiblemente.
- 4a. Desconexión o falla de periférico: pausa y notifica a ambos
  extremos.

## CU-04: Consultar historial y plan de mejora

Flujo principal: acceso al historial → lista de sesiones con métricas
agregadas y estado del plan → selección de sesión → advertencia sobre
naturaleza artificial → presentación de transcripción, métricas e
hitos → solicitud de descarga → entrega del PDF desde S3 sobre canal
cifrado, con cifrado en reposo en origen.

Flujos alternativos:
- 3a. Sesión fuera de retención: indica borrado automático según
  política.
- 7a. Falla del bucket: reintenta y, ante falla persistente, registra
  traza correlacionada.

## CU-05: Gestionar gamificación

Flujo principal: completa entrevista → motor de scoring calcula puntos
desde métricas → evalúa criterios y asigna insignias automáticamente
→ actualiza contadores en perfil → re-clasifica al usuario en su liga
semanal → consulta del panel por el usuario → persiste estado del
ranking para la semana en curso.

Flujos alternativos:
- 3a. Anulación posterior de la sesión: revierte puntos e insignias.
- 5a. Sin actividad semanal: mantiene en su liga sin penalización por
  inactividad puntual.

## CU-06: Gestionar consentimiento, datos y privacidad

Flujo principal: acceso a privacidad → muestra estado actual → modifica
y guarda → persiste y aplica desde la siguiente sesión → si solicita
supresión total, requiere confirmación explícita por irreversibilidad
→ elimina registros en PostgreSQL y archivos en S3 sobre canal
cifrado, manteniendo cifrado en reposo durante el proceso → registra
traza correlacionada para auditoría.

Flujos alternativos:
- 5a. Si participó como observador, anonimiza identidad en lugar de
  eliminar comentarios técnicos asociados.
- 7a. Falla parcial: reintenta y, ante persistencia, notifica al
  oficial de protección de datos.

## CU-07: Administrar la plataforma

Flujo principal: login admin → valida rol → consulta usuarios, reportes
de errores y métricas de disponibilidad mensual → modifica
configuraciones globales → correlaciona traza del cambio con identificador
del admin → resuelve incidente y notifica cierre → actualiza
indicadores derivados (incluido costo medio de API por sesión).

Flujos alternativos:
- 2a. Acceso indebido a la ruta de gestión: redirige y registra como
  evento de seguridad.
- 4a. Configuración con costo proyectado por encima del umbral: requiere
  confirmación adicional.

## CU-08: Generar reportes institucionales

Flujo principal: acceso al módulo → selección de periodo, unidad y
agregación → valida exclusión de identificación personal y nivel
mínimo de agregación seguro → motor de agregación produce métricas
desde repositorio anonimizado → entrega y registra traza
correlacionada → descarga en formato consultable → almacena con
cifrado en reposo en bucket institucional.

Flujos alternativos:
- 3a. Riesgo de reidentificación por desagregación insuficiente:
  rechaza el parámetro y propone nivel seguro.
- 4a. Periodo fuera de la ventana de retención: entrega reporte parcial
  y lo señala explícitamente.

---

## Notas finales de Claude

Tres RNF (compatibilidad con navegadores, cobertura mínima de pruebas,
consumo de memoria y CPU en cliente) se documentan como restricciones
globales del sistema, no como derivados de un caso de uso específico.

Faltaría RF para cubrir explícitamente el **emparejamiento de pares**
previo al CU-03 (creación o ingreso a sala de mock con búsqueda por
industria, rol y nivel). El RF que cubre WebRTC opera sobre la
conexión, no sobre el matchmaking. Recomendación: incorporar este RF
en la siguiente iteración del backlog.

Faltaría RF para cubrir la **persistencia explícita de preferencias
de accesibilidad** con sincronización entre dispositivos. El CU-02 se
apoya en un RF general de sincronización, pero conviene desambiguar
este alcance en la siguiente iteración.
