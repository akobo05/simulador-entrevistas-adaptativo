# Self-view de camara desacoplado de MediaPipe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que el self-view (recuadro con la imagen de la camara) aparezca apenas se obtiene el stream, independiente de que MediaPipe inicialice; si el analisis falla, degradar a un estado "camara on, sin metricas" en vez de apagar la camara.

**Architecture:** Reordenar `startCamera()` en `useAuraPipeline.ts`: exponer `videoStream` y `cameraStatus='on'` inmediatamente despues de `getUserMedia` (tras el guard `cancelled`), y mover toda la inicializacion de MediaPipe (worker.initialize + video offscreen + play + frame-loop) a un unico `try/catch` que, ante cualquier fallo, NO apaga la camara: termina el worker y pone `cameraStatus='on_no_metrics'`. Se agrega ese valor al enum `CameraStatus` y `InterviewPage` muestra un aviso suave. Validado por una investigacion + revision de Gemini (ver `grupal/camara-preview-investigacion/`).

**Tech Stack:** React 19 + Vite 6 + TypeScript strict + @mediapipe/tasks-vision (Web Worker via Comlink) + vitest + happy-dom.

**Convenciones:** identificadores/codigo en ingles; comentarios y commits en espanol sin acentos ("Se corrige X"); NO Conventional Commits; sin marcas de IA. `noUncheckedIndexedAccess` activo.

**Diseno cerrado (Gemini-revisado):** enum `'on_no_metrics'` (NO un boolean aparte); un solo `try` envolviendo init+play+frame-loop; `worker.terminate()` en el catch (evitar worker zombie); `video.playsInline = true` en el video offscreen (iOS). Vendorizar el modelo `.task` local queda como issue de seguimiento, FUERA de este fix.

---

### Task 1: Desacoplar el preview y degradar el analisis (hook + UI + tests)

Es un cambio cohesivo: el nuevo valor del enum fluye del hook a `InterviewPage`, asi que va en una sola task para no dejar un typecheck intermedio roto.

**Files:**
- Modify: `apps/web/src/hooks/useAuraPipeline.ts`
- Modify: `apps/web/src/hooks/useAuraPipeline.test.ts`
- Modify: `apps/web/src/pages/InterviewPage.tsx`
- Modify: `apps/web/src/pages/InterviewPage.test.tsx`

Comandos: `pnpm --filter @warachikuy/web test -- <patron>`, `pnpm --filter @warachikuy/web typecheck`, `pnpm --filter @warachikuy/web lint`.

- [ ] **Step 1: Actualizar el test del hook (rojo)**

En `apps/web/src/hooks/useAuraPipeline.test.ts`, REEMPLAZAR el test actual `it('si el worker no inicializa -> failed y se libera la camara', ...)` (que hoy espera `'failed'` + `stopTrack` llamado) por este, y AGREGAR el de fallo de `play()`:

```ts
it('si el worker no inicializa -> on_no_metrics, mantiene el preview y no detiene la camara', async () => {
  mockGetUserMedia(() => Promise.resolve(fakeStream()));
  workerApi.initialize.mockRejectedValueOnce(new Error('model_load_failed'));
  const { result } = renderHook(() => useAuraPipeline('s1', true, vi.fn()));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.cameraStatus).toBe('on_no_metrics');
  expect(result.current.videoStream).not.toBeNull();
  expect(stopTrack).not.toHaveBeenCalled();
});

it('si el video de analisis no reproduce -> on_no_metrics, mantiene el preview', async () => {
  mockGetUserMedia(() => Promise.resolve(fakeStream()));
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'video') {
      return {
        videoWidth: 2,
        videoHeight: 2,
        muted: false,
        playsInline: false,
        srcObject: null,
        play: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
      } as unknown as HTMLVideoElement;
    }
    return realCreate(tag);
  });
  const { result } = renderHook(() => useAuraPipeline('s1', true, vi.fn()));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.cameraStatus).toBe('on_no_metrics');
  expect(result.current.videoStream).not.toBeNull();
  expect(stopTrack).not.toHaveBeenCalled();
});
```

Nota: el test de exito existente (`expect(...cameraStatus).toBe('on')`) y los demas (`'off'`, `'denied'`) NO cambian. El de exito sigue valido porque en el camino feliz el estado final es `'on'`.

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm --filter @warachikuy/web test -- useAuraPipeline`
Expected: FAIL (hoy esos casos dan `'failed'` y `stopTrack` SI se llama).

- [ ] **Step 3: Implementar el hook**

En `apps/web/src/hooks/useAuraPipeline.ts`:

1. Extender el tipo del enum:
```ts
export type CameraStatus = 'off' | 'starting' | 'on' | 'on_no_metrics' | 'denied' | 'failed';
```
(La interfaz `AuraPipeline` NO cambia: ya expone `videoStream`. No se agrega ningun boolean.)

2. Reemplazar el cuerpo de `startCamera()` por esta version reordenada. MANTENER identico el loop de `getUserMedia` con reintentos (incluida la funcion `delay` ya existente) y el cuerpo interno del frame-loop; solo cambia el ORDEN y el envoltorio try/catch:

```ts
    async function startCamera(): Promise<void> {
      setCameraStatus('starting');
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
          });
          break;
        } catch (err) {
          const isNotAllowed = (err as DOMException)?.name === 'NotAllowedError';
          if (cancelled) return;
          if (isNotAllowed) {
            setCameraStatus('denied');
            return;
          }
          if (attempt < maxRetries) {
            await delay(1000 * (attempt + 1));
            if (cancelled) return;
            continue;
          }
          setCameraStatus('failed');
          return;
        }
      }
      const cam = stream!;
      if (cancelled) {
        cam.getTracks().forEach((t) => t.stop());
        return;
      }

      // Preview YA: el self-view aparece apenas la camara entrega frames, sin
      // esperar a MediaPipe. "Ver mi camara" no depende de "MediaPipe pudo medir
      // contacto visual": responsabilidades separadas que deben fallar por separado.
      setCameraStatus('on');
      setVideoStream(cam);

      // Si la camara muere a mitad de sesion (se desenchufa, el SO revoca el
      // permiso) hay que cortar el loop y avisar.
      cam.getTracks().forEach((track) =>
        track.addEventListener('ended', () => {
          if (cancelled) return;
          if (frameTimer) clearInterval(frameTimer);
          eyeMetricsRef.current = [];
          setCameraStatus('failed');
          setVideoStream(null);
        }),
      );

      // Analisis (MediaPipe) como paso SEPARADO. Si algo falla (carga del WASM,
      // descarga del modelo, GPU/CPU, o el play del video de analisis), se degrada
      // a 'on_no_metrics': la camara sigue encendida y visible, sin eye_contact.
      try {
        worker = createMetricsWorker();
        await worker.api.initialize();
        if (cancelled) return;

        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true; // iOS Safari: sin esto play() puede rechazar
        video.srcObject = cam;
        await video.play();
        if (cancelled) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        frameTimer = setInterval(() => {
          if (!ctx || !worker || video.videoWidth === 0) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // Copia simple del buffer (sin Comlink.transfer): a 4 Hz y resolucion de
          // webcam el costo es bajo y evita invalidar el ImageData
          worker.api
            .processFrame(img.data.buffer as ArrayBuffer, img.width, img.height)
            .then((metrics) => {
              if (!cancelled) eyeMetricsRef.current = metrics;
            })
            .catch(() => {
              // Frame perdido: se reintenta en el proximo tick
            });
        }, FRAME_INTERVAL_MS);
      } catch (err) {
        // Degradacion: el analisis no arranco, pero la camara sigue viva. Se
        // termina el worker para no dejarlo zombie ocupando memoria.
        worker?.terminate();
        worker = null;
        if (!cancelled) setCameraStatus('on_no_metrics');
        console.warn('[aura] MediaPipe no inicializo; la camara sigue activa', err);
      }
    }
```

No tocar el `snapshotTimer` ni el `return () => { ... }` (cleanup): ya paran tracks y hacen `setVideoStream(null)`.

- [ ] **Step 4: Correr el test del hook (verde)**

Run: `pnpm --filter @warachikuy/web test -- useAuraPipeline`
Expected: PASS (los 2 casos nuevos + los preexistentes).

- [ ] **Step 5: Banner en InterviewPage**

En `apps/web/src/pages/InterviewPage.tsx`, en el bloque del aviso de camara (hoy lineas ~258-268), agregar el caso `'on_no_metrics'`:

```tsx
          {(pipeline.cameraStatus === 'denied' ||
            pipeline.cameraStatus === 'failed' ||
            pipeline.cameraStatus === 'on_no_metrics' ||
            (pipeline.cameraStatus === 'off' && !grants.camera)) && (
            <p className="ip-camera-note" data-testid="ip-camera-note" role="alert">
              {pipeline.cameraStatus === 'denied'
                ? 'Cámara no disponible: revisa los permisos en la configuración de tu navegador.'
                : pipeline.cameraStatus === 'failed'
                  ? 'Error al iniciar la cámara. Puedes intentar recargar la página.'
                  : pipeline.cameraStatus === 'on_no_metrics'
                    ? 'Cámara activa, pero el análisis de contacto visual no está disponible.'
                    : 'Cámara desactivada: el contacto visual queda sin datos.'}
            </p>
          )}
```

El recuadro `ip-selfview` se sigue mostrando porque `videoStream` no es null (no se toca esa parte).

- [ ] **Step 6: Test de InterviewPage para el estado degradado**

En `apps/web/src/pages/InterviewPage.test.tsx`, agregar un test que verifique que con `cameraStatus: 'on_no_metrics'` y un `videoStream` presente se renderizan TANTO el self-view como el aviso. Usar el helper `fakePipeline` existente. Para el `videoStream`, un stub basta:

```ts
it('en on_no_metrics muestra el self-view y el aviso de analisis no disponible', () => {
  const fakeStream = { getTracks: () => [] } as unknown as MediaStream;
  pipelineReturn = fakePipeline({ cameraStatus: 'on_no_metrics', videoStream: fakeStream });
  renderInterview();
  expect(screen.getByTestId('ip-selfview')).toBeInTheDocument();
  expect(screen.getByTestId('ip-camera-note')).toHaveTextContent(
    'análisis de contacto visual no está disponible',
  );
});
```

Nota: adapta los nombres (`renderInterview`, `screen`, `pipelineReturn`) a como ya estan en el archivo. Si el render del self-view requiere que el `useEffect` asigne `srcObject`, el stub con `getTracks` alcanza; lo que se valida es que el `<video data-testid="ip-selfview">` se monta (condicionado a `videoStream` truthy).

- [ ] **Step 7: Verificacion del paquete web**

Run: `pnpm --filter @warachikuy/web typecheck && pnpm --filter @warachikuy/web lint && pnpm --filter @warachikuy/web test`
Expected: typecheck y lint limpios; toda la suite de `apps/web` en verde.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/hooks/useAuraPipeline.ts apps/web/src/hooks/useAuraPipeline.test.ts apps/web/src/pages/InterviewPage.tsx apps/web/src/pages/InterviewPage.test.tsx
git commit -m "Se desacopla el self-view de la camara de la inicializacion de MediaPipe"
```

---

### Cierre

- [ ] **Revisar contra el objetivo:** el self-view aparece apenas hay stream (no espera a MediaPipe); si MediaPipe falla, la camara sigue encendida y visible con un aviso, en vez de apagarse. `eye_contact` queda "sin datos" en ese caso (contrato del aura). El test que antes esperaba `'failed'` ahora valida `'on_no_metrics'` + preview vivo + camara no detenida.
