// Limite duro de tamano de payload por mensaje WebSocket. Aplicado por el
// plugin (@fastify/websocket lo pasa a `ws`). Defiende el event loop de
// payloads gigantes. 16 KB cubre AuraState con 10 metricas (~1 KB) y un
// transcript de turno de ~600 palabras (~4 KB) con margen 3x.
export const MAX_WS_PAYLOAD_BYTES = 16384;

// Numero de mensajes invalidos CONSECUTIVOS antes de cerrar el socket con
// close(1008, 'policy_violation'). Se resetea al primer mensaje valido.
// Un cliente legitimo se equivoca 1-2 veces durante reconexion/migracion
// de schema, no 5 seguidos.
export const MAX_CONSECUTIVE_INVALID_MESSAGES = 5;

// Cada cuanto el server envia un ping para detectar clientes muertos. El
// mismo intervalo sirve como ventana de tolerancia: si en el siguiente
// tick no llego un pong, cerramos con 1011 (ver spec §5).
export const HEARTBEAT_INTERVAL_MS = 30_000;

// TTL renovado en Redis cada vez que llega un pong. Misma magnitud que el
// TTL inicial fijado en createSession (3600s = 1h).
export const SESSION_REFRESH_TTL_SECONDS = 3600;
