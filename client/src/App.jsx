import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Send, Upload, Star, Trash2, Wand2 } from 'lucide-react';

const DEFAULT_LOCAL_API_BASE = 'http://localhost:3000';

const normalizeBaseUrl = (value, fallback) => (value || fallback).replace(/\/$/, '');
const toPositiveNumber = (value, fallback) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL, DEFAULT_LOCAL_API_BASE);
const OVERLAY_BASE = normalizeBaseUrl(import.meta.env.VITE_OVERLAY_BASE_URL, API_BASE);
const KEEPALIVE_INTERVAL_MS = toPositiveNumber(import.meta.env.VITE_KEEPALIVE_INTERVAL_MS, 120000);
const WAKE_MAX_RETRY_MS = toPositiveNumber(import.meta.env.VITE_WAKE_MAX_RETRY_MS, 8000);

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const normalizeImageTransform = (value) => ({
  scale: clampNumber(value?.scale, 1, 4, 1),
  x: clampNumber(value?.x, -1920, 1920, 0),
  y: clampNumber(value?.y, -1080, 1080, 0),
});

const initialImageTransform = { scale: 1, x: 0, y: 0 };

function App() {
  // Zócalo
  const [texto, setTexto] = useState('');
  const [visible, setVisible] = useState(true);

  // Fondo del zócalo
  const [bgVersion, setBgVersion] = useState(Date.now());
  const [uploadingBg, setUploadingBg] = useState(false);

  // Imágenes OBS
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [imageVisible, setImageVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageTransform, setImageTransform] = useState(initialImageTransform);
  const skipTransformSyncRef = useRef(true);

  // Estado general
  const [status, setStatus] = useState('Conectando...');
  const [sessionPhase, setSessionPhase] = useState('starting');
  const [loading, setLoading] = useState(true);
  const keepaliveIntervalRef = useRef(null);
  const wakePromiseRef = useRef(null);
  const mountedRef = useRef(false);
  const sessionPhaseRef = useRef('starting');

  const sessionLabel = {
    starting: 'Iniciando',
    waking: 'Despertando backend',
    active: 'Sesion activa',
    reconnecting: 'Reconectando',
  }[sessionPhase] || 'Iniciando';

  const selectedImage = images.find((img) => img.id === selectedImageId) || null;

  // ── Sesión y keepalive ────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    startSession();
    return () => {
      mountedRef.current = false;
      stopKeepalive();
    };
  }, []);

  useEffect(() => { sessionPhaseRef.current = sessionPhase; }, [sessionPhase]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && sessionPhaseRef.current !== 'active') {
        recoverSession('Reanudando sesion...');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Sync de zoom con debounce
  useEffect(() => {
    if (!selectedImageId) return;
    if (skipTransformSyncRef.current) {
      skipTransformSyncRef.current = false;
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        await requestJson('/image/zoom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(imageTransform),
        });
      } catch (error) {
        setStatus(error.message);
      }
    }, 90);
    return () => window.clearTimeout(id);
  }, [selectedImageId, imageTransform]);

  function stopKeepalive() {
    if (keepaliveIntervalRef.current) {
      window.clearInterval(keepaliveIntervalRef.current);
      keepaliveIntervalRef.current = null;
    }
  }

  function startKeepalive() {
    stopKeepalive();
    keepaliveIntervalRef.current = window.setInterval(async () => {
      if (document.hidden || sessionPhaseRef.current !== 'active') return;
      try {
        const r = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
        if (!r.ok) throw new Error('Backend unavailable');
      } catch {
        await recoverSession('Conexion perdida. Reintentando...');
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  async function ensureBackendAwake(reason = 'Despertando backend...') {
    if (wakePromiseRef.current) return wakePromiseRef.current;
    wakePromiseRef.current = (async () => {
      let attempt = 0;
      setSessionPhase('waking');
      while (mountedRef.current) {
        attempt += 1;
        setStatus(attempt === 1 ? reason : `${reason} Intento ${attempt}.`);
        try {
          const r = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
          if (r.ok) { setSessionPhase('active'); return true; }
        } catch { /* retry */ }
        await sleep(Math.min(1000 * attempt, WAKE_MAX_RETRY_MS));
      }
      return false;
    })().finally(() => { wakePromiseRef.current = null; });
    return wakePromiseRef.current;
  }

  async function recoverSession(reason) {
    setSessionPhase('reconnecting');
    const ready = await ensureBackendAwake(reason);
    if (ready) await loadState({ preserveLoading: true });
    return ready;
  }

  async function startSession() {
    setLoading(true);
    const ready = await ensureBackendAwake();
    if (!ready) { setLoading(false); return; }
    await loadState();
  }

  async function requestJson(path, options = {}, allowWakeRetry = true) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, options);
    } catch {
      if (allowWakeRetry) {
        const ready = await recoverSession('No se pudo conectar. Reintentando...');
        if (ready) return requestJson(path, options, false);
      }
      throw new Error('No se pudo conectar con el backend');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(data.error || 'Request failed');
    }
    return response.json();
  }

  function applyStateSnapshot(data) {
    if (!data) return;
    setTexto(data.zocalo?.nombre || '');
    setVisible(Boolean(data.visibility?.text ?? true));
    setImages(data.images || []);
    setSelectedImageId(data.selectedImage?.id || null);
    setImageVisible(Boolean(data.visibility?.image ?? false));
    skipTransformSyncRef.current = true;
    setImageTransform(normalizeImageTransform(data.selectedImageTransform || initialImageTransform));
  }

  async function loadState({ preserveLoading = false } = {}) {
    if (!preserveLoading) setLoading(true);
    try {
      const data = await requestJson('/state', {}, false);
      applyStateSnapshot(data);
      setSessionPhase('active');
      setStatus('Estado sincronizado');
      startKeepalive();
    } catch (error) {
      setSessionPhase('reconnecting');
      setStatus(error.message);
    } finally {
      if (!preserveLoading) setLoading(false);
    }
  }

  // ── Zócalo ────────────────────────────────────────────────────────────────

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await requestJson('/zocalo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: texto, partido: '', rol: '' }),
      });
      setStatus('Texto enviado al aire');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleBgUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      await requestJson('/zocalo-bg', { method: 'POST', body: formData });
      setBgVersion(Date.now());
      setStatus('Fondo del zocalo actualizado');
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.target.value = '';
      setUploadingBg(false);
    }
  }

  async function toggleText(value) {
    try {
      await requestJson('/text/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: value }),
      });
      setVisible(value);
      setStatus(value ? 'Zocalo visible' : 'Zocalo oculto');
    } catch (error) {
      setStatus(error.message);
    }
  }

  // ── Imágenes ────────────────────────────────────────────────────────────

  async function handleImageUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('image', file);
        await requestJson('/upload', { method: 'POST', body: formData });
      }
      await loadState({ preserveLoading: true });
      setStatus(`${files.length} imagen(es) cargadas`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.target.value = '';
      setUploading(false);
    }
  }

  async function selectImage(imageId) {
    try {
      const data = await requestJson('/image/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId }),
      });
      applyStateSnapshot(data.state);
      setStatus('Imagen seleccionada');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleImage(value) {
    if (value && !selectedImageId) {
      setStatus('Selecciona una imagen primero');
      return;
    }
    try {
      const data = await requestJson('/image/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: value }),
      });
      applyStateSnapshot(data.state);
      setStatus(value ? 'Imagen visible' : 'Imagen oculta');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleFavorite() {
    if (!selectedImage) return;
    try {
      const data = await requestJson(`/image/${encodeURIComponent(selectedImage.id)}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !selectedImage.favorite }),
      });
      applyStateSnapshot(data.state);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deleteImage(imageId) {
    try {
      const data = await requestJson(`/image/${encodeURIComponent(imageId)}`, { method: 'DELETE' });
      applyStateSnapshot(data.state);
      setStatus('Imagen eliminada');
    } catch (error) {
      setStatus(error.message);
    }
  }

  function updateTransform(key, value) {
    setImageTransform((t) => normalizeImageTransform({ ...t, [key]: value }));
  }

  async function resetTransform() {
    skipTransformSyncRef.current = false;
    setImageTransform(initialImageTransform);
    setStatus('Zoom reiniciado');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-400">OBS graphics control</p>
          <h1 className="text-2xl font-black uppercase tracking-[0.2em]">Panel de realizacion</h1>
          <p className="text-sm text-slate-400">
            {loading ? 'Cargando...' : status}
            <span className="ml-2 text-slate-600">&mdash; {sessionLabel}</span>
          </p>
        </header>

        {/* ── Zócalo ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Zocalo al aire</span>
            <div className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${visible ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/50 text-slate-500'}`}>
              {visible ? 'Visible' : 'Oculto'}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-sky-500 resize-none"
              placeholder="Texto al aire..."
            />
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-sky-500">
              <Send size={16} /> Enviar al aire
            </button>
          </form>

          <div className="flex gap-3">
            <button type="button" onClick={() => toggleText(true)} disabled={visible}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">
              <Eye size={15} /> Mostrar
            </button>
            <button type="button" onClick={() => toggleText(false)} disabled={!visible}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:border-red-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed">
              <EyeOff size={15} /> Ocultar
            </button>
          </div>
        </div>

        {/* ── Fondo del zócalo ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Imagen de fondo del zocalo</span>

          <img
            key={bgVersion}
            src={`${OVERLAY_BASE}/overlay/zocalo-bg.png?v=${bgVersion}`}
            alt="Fondo del zocalo"
            className="w-full rounded-xl border border-slate-700 object-contain bg-slate-800"
            style={{ maxHeight: '140px' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            onLoad={(e) => { e.currentTarget.style.display = ''; }}
          />

          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-800 px-4 py-4 transition hover:border-sky-500">
            <Upload size={18} className={uploadingBg ? 'animate-pulse text-sky-400' : 'text-slate-400'} />
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
              {uploadingBg ? 'Subiendo...' : 'Subir nuevo fondo'}
            </span>
            <input type="file" accept="image/*" className="hidden" disabled={uploadingBg} onChange={handleBgUpload} />
          </label>
        </div>

        {/* ── Imágenes OBS ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Imagenes OBS</span>
            <div className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${imageVisible ? 'bg-fuchsia-500/15 text-fuchsia-400' : 'bg-slate-700/50 text-slate-500'}`}>
              {imageVisible ? 'Visible' : 'Oculta'}
            </div>
          </div>

          {/* Upload */}
          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-800 px-4 py-4 transition hover:border-fuchsia-500">
            {uploading ? <Wand2 size={18} className="animate-pulse text-fuchsia-400" /> : <Upload size={18} className="text-slate-400" />}
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
              {uploading ? 'Subiendo...' : 'Cargar imagen(es)'}
            </span>
            <input type="file" multiple accept="image/*" className="hidden" disabled={uploading} onChange={handleImageUpload} />
          </label>

          {/* Imagen seleccionada */}
          {selectedImage && (
            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-4">
              <img src={selectedImage.url} alt={selectedImage.label} className="w-full rounded-lg object-cover" style={{ maxHeight: '180px' }} />

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => toggleImage(true)} disabled={imageVisible}
                  className="flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Eye size={14} /> Mostrar
                </button>
                <button type="button" onClick={() => toggleImage(false)} disabled={!imageVisible}
                  className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed">
                  <EyeOff size={14} /> Ocultar
                </button>
                <button type="button" onClick={toggleFavorite}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold uppercase tracking-wide transition ${selectedImage.favorite ? 'bg-amber-500 text-white hover:bg-amber-400' : 'border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                  <Star size={14} />
                </button>
                <button type="button" onClick={() => deleteImage(selectedImage.id)}
                  className="ml-auto flex items-center gap-2 rounded-xl border border-rose-800/60 bg-rose-900/30 px-3 py-2 text-sm font-bold uppercase tracking-wide text-rose-400 transition hover:bg-rose-900/50">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Zoom y encuadre */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Zoom y encuadre</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-fuchsia-400">{imageTransform.scale.toFixed(2)}x</span>
                    <button type="button" onClick={resetTransform}
                      className="rounded-lg border border-slate-600 bg-slate-700 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-300 transition hover:bg-slate-600">
                      Reset
                    </button>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Escala</span>
                  <input type="range" min="1" max="4" step="0.05" value={imageTransform.scale}
                    onChange={(e) => updateTransform('scale', e.target.value)} className="w-full accent-fuchsia-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Desplazamiento X — {Math.round(imageTransform.x)} px</span>
                  <input type="range" min="-960" max="960" step="4" value={imageTransform.x}
                    onChange={(e) => updateTransform('x', e.target.value)} className="w-full accent-fuchsia-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Desplazamiento Y — {Math.round(imageTransform.y)} px</span>
                  <input type="range" min="-540" max="540" step="4" value={imageTransform.y}
                    onChange={(e) => updateTransform('y', e.target.value)} className="w-full accent-fuchsia-500" />
                </label>
              </div>
            </div>
          )}

          {/* Biblioteca */}
          {images.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Biblioteca</span>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {images.map((image) => {
                  const active = image.id === selectedImageId;
                  return (
                    <button key={image.id} type="button" onClick={() => selectImage(image.id)}
                      className={`grid w-full grid-cols-[80px_1fr] gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-fuchsia-500 bg-fuchsia-950/40' : 'border-slate-700 bg-slate-800 hover:border-slate-600'}`}>
                      <img src={image.url} alt={image.label} className="h-[54px] w-20 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold uppercase tracking-[0.1em] text-slate-200">{image.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{new Date(image.uploadedAt).toLocaleString('es-AR')}</div>
                        <div className="mt-1 flex gap-2">
                          {image.favorite && <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400">★ Fav</span>}
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${active ? 'text-fuchsia-400' : 'text-slate-600'}`}>
                            {active ? 'Seleccionada' : `${image.width}×${image.height}`}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default App;
