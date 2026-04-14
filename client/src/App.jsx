import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layout,
  MonitorUp,
  Send,
  Star,
  Trash2,
  Upload,
  Wand2
} from 'lucide-react';

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

const initialForm = {
  nombre: 'DON MANOLO',
  partido: 'PARTIDO POR LA PAZ',
  rol: 'CANDIDATO PRESIDENCIAL'
};

const initialTitleForm = {
  kicker: 'TITULO',
  text: ''
};

const initialQuoteForm = {
  speaker: '',
  text: ''
};

const initialImageTransform = {
  scale: 1,
  x: 0,
  y: 0
};

const createInitialPresetDraft = () => ({
  backgroundImageId: '',
  elements: {
    zocalo: { enabled: true, x: 64, y: 860 },
    title: { enabled: false, x: 64, y: 96 },
    quote: { enabled: false, x: 1296, y: 760 }
  }
});

const presetLayerLabels = {
  zocalo: 'Zocalo',
  title: 'Titulo',
  quote: 'Cita'
};

const clampValue = (value, min, max, fallback) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsedValue));
};

const normalizeImageTransform = (value) => ({
  scale: clampValue(value?.scale, 1, 4, 1),
  x: clampValue(value?.x, -1920, 1920, 0),
  y: clampValue(value?.y, -1080, 1080, 0)
});

const presetDraftFromPreset = (preset) => ({
  backgroundImageId: preset?.backgroundImageId || '',
  elements: {
    zocalo: {
      enabled: Boolean(preset?.elements?.zocalo?.enabled),
      x: clampValue(preset?.elements?.zocalo?.x, 0, 1920, 64),
      y: clampValue(preset?.elements?.zocalo?.y, 0, 1080, 860)
    },
    title: {
      enabled: Boolean(preset?.elements?.title?.enabled),
      x: clampValue(preset?.elements?.title?.x, 0, 1920, 64),
      y: clampValue(preset?.elements?.title?.y, 0, 1080, 96)
    },
    quote: {
      enabled: Boolean(preset?.elements?.quote?.enabled),
      x: clampValue(preset?.elements?.quote?.x, 0, 1920, 1296),
      y: clampValue(preset?.elements?.quote?.y, 0, 1080, 760)
    }
  }
});

const toneStyles = {
  sky: 'bg-sky-50 text-sky-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-600'
};

function ControlCard({ title, children, icon: Icon, tone = 'blue' }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)] backdrop-blur">
      <div className="mb-5 flex items-center gap-3">
        <div className={`rounded-2xl p-3 ${toneStyles[tone] || toneStyles.sky}`}>
          <Icon size={22} />
        </div>
        <div>
          <h2 className="text-lg font-black uppercase tracking-[0.18em] text-slate-900">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function App() {
  const [form, setForm] = useState(initialForm);
  const [titleForm, setTitleForm] = useState(initialTitleForm);
  const [quoteForm, setQuoteForm] = useState(initialQuoteForm);
  const [visibility, setVisibility] = useState({ text: true, image: false, zocalo: true, title: false, quote: false });
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [selectedImageTransform, setSelectedImageTransform] = useState(initialImageTransform);
  const [presets, setPresets] = useState([]);
  const [activeTextPreset, setActiveTextPreset] = useState(null);
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [presetName, setPresetName] = useState('');
  const [presetDraft, setPresetDraft] = useState(createInitialPresetDraft);
  const [status, setStatus] = useState('Conectado al panel');
  const [sessionPhase, setSessionPhase] = useState('starting');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const keepaliveIntervalRef = useRef(null);
  const wakePromiseRef = useRef(null);
  const mountedRef = useRef(false);
  const sessionPhaseRef = useRef('starting');
  const skipImageTransformSyncRef = useRef(true);
  const canvasRef = useRef(null);
  const layerElRefs = useRef({});
  const canvasDragRef = useRef(null);

  const overlayTextUrl = `${OVERLAY_BASE}/overlay/text.html`;
  const overlayImageUrl = `${OVERLAY_BASE}/overlay/image.html`;
  const sessionLabel = {
    starting: 'Iniciando',
    waking: 'Despertando backend',
    active: 'Sesion activa',
    reconnecting: 'Reconectando'
  }[sessionPhase] || 'Iniciando';

  useEffect(() => {
    mountedRef.current = true;
    startSession();

    return () => {
      mountedRef.current = false;
      stopKeepalive();
    };
  }, []);

  useEffect(() => {
    sessionPhaseRef.current = sessionPhase;
  }, [sessionPhase]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && sessionPhaseRef.current !== 'active') {
        recoverSession('Reanudando sesion con el backend...');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === '1') {
        toggleText(true);
      }

      if (event.key === '2') {
        toggleText(false);
      }

      if (event.key === '3') {
        toggleImage(true);
      }

      if (event.key === '4') {
        toggleImage(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedImageId]);

  useEffect(() => {
    if (!selectedImageId) {
      return;
    }

    if (skipImageTransformSyncRef.current) {
      skipImageTransformSyncRef.current = false;
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await requestJson('/image/zoom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedImageTransform)
        });

        applyStateSnapshot(data.state, { syncTextDrafts: false });
      } catch (error) {
        setStatus(error.message);
      }
    }, 90);

    return () => window.clearTimeout(timeoutId);
  }, [selectedImageId, selectedImageTransform]);

  function applyServerImageTransform(transform) {
    skipImageTransformSyncRef.current = true;
    setSelectedImageTransform(normalizeImageTransform(transform || initialImageTransform));
  }

  function applyStateSnapshot(snapshot, { syncTextDrafts = true } = {}) {
    if (!snapshot) {
      return;
    }

    if (syncTextDrafts) {
      setForm(snapshot.zocalo || initialForm);
      setTitleForm(snapshot.title || initialTitleForm);
      setQuoteForm(snapshot.quote || initialQuoteForm);
    }

    setVisibility(snapshot.visibility || { text: true, image: false, zocalo: true, title: false, quote: false });
    setImages(snapshot.images || []);
    setSelectedImageId(snapshot.selectedImage?.id || null);
    setTagDraft((snapshot.selectedImage?.tags || []).join(', '));
    setPresets(snapshot.presets || []);
    setActiveTextPreset(snapshot.activeTextPreset || null);
    applyServerImageTransform(snapshot.selectedImageTransform || initialImageTransform);
  }

  function resetPresetEditor() {
    setEditingPresetId(null);
    setPresetName('');
    setPresetDraft(createInitialPresetDraft());
  }

  function buildPresetPayload() {
    return {
      name: presetName,
      backgroundImageId: presetDraft.backgroundImageId || null,
      elements: {
        zocalo: {
          ...presetDraft.elements.zocalo,
          content: form
        },
        title: {
          ...presetDraft.elements.title,
          content: titleForm
        },
        quote: {
          ...presetDraft.elements.quote,
          content: quoteForm
        }
      }
    };
  }

  function loadPresetIntoEditor(preset) {
    setEditingPresetId(preset.id);
    setPresetName(preset.name || '');
    setPresetDraft(presetDraftFromPreset(preset));
    setForm(preset.elements?.zocalo?.content || initialForm);
    setTitleForm(preset.elements?.title?.content || initialTitleForm);
    setQuoteForm(preset.elements?.quote?.content || initialQuoteForm);
    setStatus(`Preset cargado: ${preset.name}`);
  }

  function stopKeepalive() {
    if (keepaliveIntervalRef.current) {
      window.clearInterval(keepaliveIntervalRef.current);
      keepaliveIntervalRef.current = null;
    }
  }

  function startKeepalive() {
    stopKeepalive();

    keepaliveIntervalRef.current = window.setInterval(async () => {
      if (document.hidden || sessionPhaseRef.current !== 'active') {
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/health`, { cache: 'no-store' });

        if (!response.ok) {
          throw new Error('Backend unavailable');
        }
      } catch (error) {
        await recoverSession('Conexion perdida. Reintentando despertar backend...');
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  async function ensureBackendAwake(reason = 'Despertando backend...') {
    if (wakePromiseRef.current) {
      return wakePromiseRef.current;
    }

    wakePromiseRef.current = (async () => {
      let attempt = 0;

      setSessionPhase('waking');

      while (mountedRef.current) {
        attempt += 1;
        setStatus(attempt === 1 ? reason : `${reason} Intento ${attempt}.`);

        try {
          const response = await fetch(`${API_BASE}/health`, { cache: 'no-store' });

          if (response.ok) {
            setSessionPhase('active');
            return true;
          }
        } catch (error) {
          // Keep retrying until the backend wakes up or the component unmounts.
        }

        await sleep(Math.min(1000 * attempt, WAKE_MAX_RETRY_MS));
      }

      return false;
    })().finally(() => {
      wakePromiseRef.current = null;
    });

    return wakePromiseRef.current;
  }

  async function recoverSession(reason) {
    setSessionPhase('reconnecting');
    const ready = await ensureBackendAwake(reason);

    if (ready) {
      await loadState({ preserveLoading: true });
    }

    return ready;
  }

  async function startSession() {
    setLoading(true);
    const ready = await ensureBackendAwake();

    if (!ready) {
      setLoading(false);
      return;
    }

    await loadState();
  }

  async function requestJson(path, options = {}, allowWakeRetry = true) {
    let response;

    try {
      response = await fetch(`${API_BASE}${path}`, options);
    } catch (error) {
      if (allowWakeRetry) {
        const ready = await recoverSession('No se pudo conectar con el backend. Reintentando...');

        if (ready) {
          return requestJson(path, options, false);
        }
      }

      throw new Error('No se pudo conectar con el backend');
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(data.error || 'Request failed');
    }

    return response.json();
  }

  async function loadState({ preserveLoading = false } = {}) {
    if (!preserveLoading) {
      setLoading(true);
    }

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
      if (!preserveLoading) {
        setLoading(false);
      }
    }
  }

  async function saveText(event) {
    event.preventDefault();

    try {
      const data = await requestJson('/zocalo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      applyStateSnapshot(data.state);
      setStatus('Texto actualizado');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveTitle(event) {
    event.preventDefault();

    try {
      const data = await requestJson('/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(titleForm)
      });

      applyStateSnapshot(data.state);
      setStatus('Titulo actualizado');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveQuote(event) {
    event.preventDefault();

    try {
      const data = await requestJson('/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteForm)
      });

      applyStateSnapshot(data.state);
      setStatus('Frase actualizada');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleText(visible) {
    try {
      const data = await requestJson('/text/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible })
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });
      setStatus(visible ? 'Fuente de texto visible' : 'Fuente de texto oculta');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleTextLayer(layer, visible) {
    try {
      const data = await requestJson('/text-layer-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layer, visible })
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });
      setStatus(`${layer} ${visible ? 'visible' : 'oculto'}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleImage(visible) {
    if (visible && !selectedImageId) {
      setStatus('Subi o selecciona una imagen primero');
      return;
    }

    try {
      const data = await requestJson('/image/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible })
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });
      setStatus(visible ? 'Fuente de imagen visible' : 'Fuente de imagen oculta');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function hideEverything() {
    try {
      const data = await requestJson('/scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: 'hidden' })
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });
      setStatus('Todas las fuentes ocultas');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function selectImage(imageId) {
    try {
      const data = await requestJson('/image/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId })
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });
      setStatus(`Imagen seleccionada: ${data.image.label}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveImageMeta({ favorite, tags }) {
    if (!selectedImageId) {
      return;
    }

    try {
      const payload = {};

      if (typeof favorite === 'boolean') {
        payload.favorite = favorite;
      }

      if (tags) {
        payload.tags = tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }

      const data = await requestJson(`/image/${encodeURIComponent(selectedImageId)}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });
      setStatus('Metadata de imagen actualizada');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deleteImage(imageId) {
    try {
      const data = await requestJson(`/image/${encodeURIComponent(imageId)}`, {
        method: 'DELETE'
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });
      setStatus('Imagen eliminada');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) {
      return;
    }

    setUploading(true);

    try {
      let lastUploadedImage = null;

      for (const file of files) {
        const formData = new FormData();
        formData.append('image', file);

        const data = await requestJson('/upload', {
          method: 'POST',
          body: formData
        });

        lastUploadedImage = data.image;
      }

      await loadState();

      if (lastUploadedImage) {
        setSelectedImageId(lastUploadedImage.id);
        setStatus(`${files.length} imagen(es) cargadas`);
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.target.value = '';
      setUploading(false);
    }
  }

  async function savePreset() {
    const payload = buildPresetPayload();

    if (!payload.name.trim()) {
      setStatus('Escribi un nombre para el preset');
      return;
    }

    try {
      const data = await requestJson(editingPresetId ? `/presets/${encodeURIComponent(editingPresetId)}` : '/presets', {
        method: editingPresetId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      applyStateSnapshot(data.state);
      setEditingPresetId(data.preset.id);
      setPresetName(data.preset.name);
      setPresetDraft(presetDraftFromPreset(data.preset));
      setStatus(editingPresetId ? 'Preset actualizado' : 'Preset guardado');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function activatePreset() {
    if (!editingPresetId) {
      setStatus('Carga un preset antes de activarlo');
      return;
    }

    try {
      const data = await requestJson(`/presets/${encodeURIComponent(editingPresetId)}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPresetPayload())
      });

      applyStateSnapshot(data.state);
      setStatus('Preset activado al aire');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function clearActivePreset() {
    try {
      const data = await requestJson('/presets/clear-active', {
        method: 'POST'
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });
      setStatus('Preset activo desactivado');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deletePreset(presetId) {
    try {
      const data = await requestJson(`/presets/${encodeURIComponent(presetId)}`, {
        method: 'DELETE'
      });

      applyStateSnapshot(data.state, { syncTextDrafts: false });

      if (editingPresetId === presetId) {
        resetPresetEditor();
      }

      setStatus('Preset borrado');
    } catch (error) {
      setStatus(error.message);
    }
  }

  function updatePresetLayer(layer, key, value) {
    setPresetDraft((currentDraft) => ({
      ...currentDraft,
      elements: {
        ...currentDraft.elements,
        [layer]: {
          ...currentDraft.elements[layer],
          [key]: key === 'enabled'
            ? Boolean(value)
            : clampValue(value, 0, key === 'x' ? 1920 : 1080, currentDraft.elements[layer][key])
        }
      }
    }));
  }

  function updateImageTransform(key, value) {
    setSelectedImageTransform((currentTransform) => normalizeImageTransform({
      ...currentTransform,
      [key]: value
    }));
  }

  function resetImageTransform() {
    setSelectedImageTransform(initialImageTransform);
    setStatus('Encuadre reiniciado');
  }

  function getEventClientPos(event) {
    if (event.touches && event.touches.length > 0) {
      return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
    }

    if (event.changedTouches && event.changedTouches.length > 0) {
      return { clientX: event.changedTouches[0].clientX, clientY: event.changedTouches[0].clientY };
    }

    return { clientX: event.clientX, clientY: event.clientY };
  }

  function handleCanvasDragStart(event, layer) {
    event.preventDefault();
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const { clientX, clientY } = getEventClientPos(event);

    canvasDragRef.current = {
      layer,
      scaleX: 1920 / rect.width,
      scaleY: 1080 / rect.height,
      startClientX: clientX,
      startClientY: clientY,
      startX: presetDraft.elements[layer].x,
      startY: presetDraft.elements[layer].y,
      currentX: presetDraft.elements[layer].x,
      currentY: presetDraft.elements[layer].y
    };
  }

  function handleCanvasDragMove(event) {
    const drag = canvasDragRef.current;

    if (!drag) {
      return;
    }

    const { clientX, clientY } = getEventClientPos(event);
    const newX = Math.round(Math.min(1920, Math.max(0, drag.startX + (clientX - drag.startClientX) * drag.scaleX)));
    const newY = Math.round(Math.min(1080, Math.max(0, drag.startY + (clientY - drag.startClientY) * drag.scaleY)));
    drag.currentX = newX;
    drag.currentY = newY;

    const el = layerElRefs.current[drag.layer];

    if (el) {
      el.style.left = `${(newX / 1920) * 100}%`;
      el.style.top = `${(newY / 1080) * 100}%`;
    }
  }

  function handleCanvasDragEnd() {
    const drag = canvasDragRef.current;

    if (!drag) {
      return;
    }

    canvasDragRef.current = null;
    updatePresetLayer(drag.layer, 'x', drag.currentX);
    updatePresetLayer(drag.layer, 'y', drag.currentY);
  }

  const selectedImage = images.find((image) => image.id === selectedImageId) || null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(135deg,_#f8fafc,_#e2e8f0_60%,_#cbd5e1)] px-3 py-4 sm:px-4 sm:py-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 sm:mb-8 rounded-[2rem] border border-slate-200 bg-slate-950 px-4 py-4 sm:px-6 sm:py-6 text-white shadow-2xl shadow-slate-900/25">
          <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.28em] text-sky-300">
                OBS graphics control
              </p>
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-[0.2em]">Panel de realizacion</h1>
              <p className="mt-1 hidden sm:block max-w-2xl text-sm text-slate-300">
                Usa una fuente de navegador para texto y otra para imagen. El panel mantiene estado, biblioteca de imagenes y seleccion persistente.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Texto OBS</div>
                <div className="mt-1 font-semibold">{visibility.text ? 'Visible' : 'Oculto'}</div>
              </div>
              <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/10 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-fuchsia-300">Imagen OBS</div>
                <div className="mt-1 font-semibold">{visibility.image ? 'Visible' : 'Oculta'}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white/80 px-5 py-4 shadow-lg shadow-slate-900/5">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Estado</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{loading ? 'Cargando panel...' : status}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{sessionLabel}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/80 px-5 py-4 shadow-lg shadow-slate-900/5">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Atajos</p>
            <p className="mt-2 text-sm font-medium text-slate-700">1 mostrar texto, 2 ocultar texto, 3 mostrar imagen, 4 ocultar imagen</p>
          </div>
        </div>

        <main className="grid gap-4 sm:gap-6 xl:grid-cols-[1.05fr_0.8fr_1.15fr]">
          <ControlCard title="Texto" icon={Layout} tone="sky">
            <div className="space-y-5">
              <form onSubmit={saveText} className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Zocalo principal</p>
                    <p className="mt-1 text-sm text-slate-600">Nombre, partido y rol del participante.</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(visibility.zocalo)}
                      onChange={(event) => toggleTextLayer('zocalo', event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    Mostrar
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Nombre</span>
                  <input
                    value={form.nombre}
                    onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    placeholder="Nombre al aire"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Partido o etiqueta</span>
                  <input
                    value={form.partido}
                    onChange={(event) => setForm({ ...form, partido: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    placeholder="Banda secundaria"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Rol</span>
                  <input
                    value={form.rol}
                    onChange={(event) => setForm({ ...form, rol: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    placeholder="Cargo o descripcion"
                  />
                </label>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-sky-700"
                >
                  <Send size={16} /> Guardar zocalo
                </button>
              </form>

              <form onSubmit={saveTitle} className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Titulo</p>
                    <p className="mt-1 text-sm text-slate-600">Lower third editorial para anunciar bloques o temas.</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(visibility.title)}
                      onChange={(event) => toggleTextLayer('title', event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    Mostrar
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Kicker</span>
                  <input
                    value={titleForm.kicker}
                    onChange={(event) => setTitleForm({ ...titleForm, kicker: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    placeholder="TITULO"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Titulo principal</span>
                  <input
                    value={titleForm.text}
                    onChange={(event) => setTitleForm({ ...titleForm, text: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    placeholder="Ejemplo: Debate presidencial"
                  />
                </label>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-black"
                >
                  <Send size={16} /> Guardar titulo
                </button>
              </form>

              <form onSubmit={saveQuote} className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Frase destacada</p>
                    <p className="mt-1 text-sm text-slate-600">Cita o textual dicha por un participante.</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(visibility.quote)}
                      onChange={(event) => toggleTextLayer('quote', event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    Mostrar
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Quien lo dijo</span>
                  <input
                    value={quoteForm.speaker}
                    onChange={(event) => setQuoteForm({ ...quoteForm, speaker: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    placeholder="Nombre del participante"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Frase</span>
                  <textarea
                    value={quoteForm.text}
                    onChange={(event) => setQuoteForm({ ...quoteForm, text: event.target.value })}
                    className="min-h-[108px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    placeholder="Escribe aqui una frase destacada"
                  />
                </label>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-900 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-sky-950"
                >
                  <Send size={16} /> Guardar frase
                </button>
              </form>

              <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Presets de texto</p>
                    <p className="mt-1 text-sm text-slate-600">Guarda layout, contenido y PNG de fondo para reutilizar composiciones al aire.</p>
                  </div>
                  {activeTextPreset ? (
                    <div className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                      Activo: {activeTextPreset.name}
                    </div>
                  ) : null}
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Nombre del preset</span>
                  <input
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                    placeholder="Ejemplo: Apertura debate"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">PNG de fondo</span>
                  <select
                    value={presetDraft.backgroundImageId}
                    onChange={(event) => setPresetDraft((currentDraft) => ({ ...currentDraft, backgroundImageId: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                  >
                    <option value="">Sin fondo decorativo</option>
                    {images.map((image) => (
                      <option key={image.id} value={image.id}>{image.label}</option>
                    ))}
                  </select>
                </label>

                <div
                  ref={canvasRef}
                  className="relative w-full select-none overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 touch-none"
                  style={{ aspectRatio: '16/9' }}
                  onMouseMove={handleCanvasDragMove}
                  onMouseUp={handleCanvasDragEnd}
                  onMouseLeave={handleCanvasDragEnd}
                  onTouchMove={handleCanvasDragMove}
                  onTouchEnd={handleCanvasDragEnd}
                  onTouchCancel={handleCanvasDragEnd}
                >
                  <div className="pointer-events-none absolute bottom-2 right-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                    Preview 1920 × 1080 — arrastra los elementos
                  </div>
                  {Object.entries(presetDraft.elements).map(([layer, layerConfig]) => {
                    if (!layerConfig.enabled) {
                      return null;
                    }

                    const displayText = layer === 'zocalo'
                      ? (form.nombre || presetLayerLabels[layer])
                      : layer === 'title'
                      ? (titleForm.kicker || titleForm.text || presetLayerLabels[layer])
                      : (quoteForm.speaker || quoteForm.text || presetLayerLabels[layer]);

                    const colorClass = layer === 'zocalo'
                      ? 'bg-sky-500'
                      : layer === 'title'
                      ? 'bg-slate-600'
                      : 'bg-fuchsia-500';

                    return (
                      <div
                        key={layer}
                        ref={(el) => { layerElRefs.current[layer] = el; }}
                        className="absolute cursor-grab active:cursor-grabbing"
                        style={{ left: `${(layerConfig.x / 1920) * 100}%`, top: `${(layerConfig.y / 1080) * 100}%` }}
                        onMouseDown={(event) => handleCanvasDragStart(event, layer)}
                        onTouchStart={(event) => handleCanvasDragStart(event, layer)}
                      >
                        <div className={`${colorClass} pointer-events-none max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white shadow-lg`}>
                          {presetLayerLabels[layer]}: {displayText}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  {Object.entries(presetDraft.elements).map(([layer, layerConfig]) => (
                    <div key={layer} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{presetLayerLabels[layer]}</p>
                        <label className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-700">
                          <input
                            type="checkbox"
                            checked={Boolean(layerConfig.enabled)}
                            onChange={(event) => updatePresetLayer(layer, 'enabled', event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          Incluir
                        </label>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">X</span>
                          <input
                            type="number"
                            min="0"
                            max="1920"
                            value={layerConfig.x}
                            onChange={(event) => updatePresetLayer(layer, 'x', event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Y</span>
                          <input
                            type="number"
                            min="0"
                            max="1080"
                            value={layerConfig.y}
                            onChange={(event) => updatePresetLayer(layer, 'y', event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={savePreset}
                    className="rounded-2xl bg-sky-600 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-sky-700"
                  >
                    {editingPresetId ? 'Actualizar preset' : 'Guardar preset'}
                  </button>
                  <button
                    type="button"
                    onClick={activatePreset}
                    className="rounded-2xl bg-slate-900 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-black"
                  >
                    Activar preset cargado
                  </button>
                  <button
                    type="button"
                    onClick={resetPresetEditor}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold uppercase tracking-[0.18em] text-slate-800 transition hover:bg-slate-100"
                  >
                    Limpiar editor
                  </button>
                  <button
                    type="button"
                    onClick={clearActivePreset}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-bold uppercase tracking-[0.18em] text-amber-700 transition hover:bg-amber-100"
                  >
                    Desactivar preset
                  </button>
                </div>

                <div className="space-y-3">
                  {presets.length > 0 ? presets.map((preset) => {
                    const presetIsActive = activeTextPreset?.presetId === preset.id;
                    const presetBackground = images.find((image) => image.id === preset.backgroundImageId);

                    return (
                      <div key={preset.id} className={`rounded-2xl border p-4 ${presetIsActive ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold uppercase tracking-[0.14em] text-slate-900">{preset.name}</div>
                            <div className="mt-1 text-xs font-medium text-slate-500">
                              {presetBackground ? `Fondo: ${presetBackground.label}` : 'Sin fondo PNG'}
                            </div>
                          </div>
                          {presetIsActive ? (
                            <div className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">Activo</div>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => loadPresetIntoEditor(preset)}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-black"
                          >
                            Cargar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              loadPresetIntoEditor(preset);
                              window.setTimeout(() => {
                                setEditingPresetId(preset.id);
                              }, 0);
                            }}
                            className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-800 transition hover:bg-slate-200"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePreset(preset.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100"
                          >
                            <Trash2 size={12} /> Borrar
                          </button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                      Todavia no hay presets guardados.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => toggleText(!visibility.text)}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 font-bold uppercase tracking-[0.18em] text-slate-800 transition hover:bg-slate-200"
                >
                  {visibility.text ? <EyeOff size={16} /> : <Eye size={16} />}
                  {visibility.text ? 'Ocultar fuente texto' : 'Mostrar fuente texto'}
                </button>
              </div>
            </div>
          </ControlCard>

          <ControlCard title="Fuentes OBS" icon={MonitorUp} tone="emerald">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Fuente 1</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">Texto / lower third</p>
                <p className="mt-1 break-all text-sm text-slate-600">{overlayTextUrl}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Fuente 2</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">Imagen full screen</p>
                <p className="mt-1 break-all text-sm text-slate-600">{overlayImageUrl}</p>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => toggleText(true)}
                  className="rounded-2xl bg-emerald-500 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-emerald-600"
                >
                  Mostrar fuente texto
                </button>
                <button
                  type="button"
                  onClick={() => toggleImage(true)}
                  className="rounded-2xl bg-fuchsia-600 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-fuchsia-700"
                >
                  Mostrar fuente imagen
                </button>
                <button
                  type="button"
                  onClick={hideEverything}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100"
                >
                  Ocultar todo
                </button>
              </div>
            </div>
          </ControlCard>

          <ControlCard title="Imagenes" icon={ImageIcon} tone="fuchsia">
            <div className="space-y-5">
              <label className="flex cursor-pointer items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center transition hover:border-fuchsia-400 hover:bg-white">
                <div className="rounded-2xl bg-fuchsia-100 p-3 text-fuchsia-600">
                  {uploading ? <Wand2 className="animate-pulse" size={22} /> : <Upload size={22} />}
                </div>
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                    {uploading ? 'Subiendo imagenes...' : 'Cargar una o varias imagenes'}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">PNG, JPG o WEBP. La ultima subida queda seleccionada.</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-600">Salida normalizada: 1920x1080 PNG</div>
                </div>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Imagen seleccionada</p>
                {selectedImage ? (
                  <div className="mt-3 space-y-3">
                    <img src={selectedImage.url} alt={selectedImage.label} className="h-44 w-full rounded-2xl object-cover" />
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Salida OBS: {selectedImage.width}x{selectedImage.height} {selectedImage.format}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedImage.tags || []).map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
                          {tag}
                        </span>
                      ))}
                      {selectedImage.favorite ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                          Favorita
                        </span>
                      ) : null}
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tags</span>
                      <input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-fuchsia-400"
                        placeholder="debate, apertura, placa"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => toggleImage(true)}
                        className="col-span-1 rounded-2xl bg-fuchsia-600 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-fuchsia-700"
                      >
                        Mostrar
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleImage(false)}
                        className="col-span-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold uppercase tracking-[0.18em] text-slate-800 transition hover:bg-slate-100"
                      >
                        Ocultar
                      </button>
                      <button
                        type="button"
                        onClick={() => saveImageMeta({ favorite: !selectedImage.favorite })}
                        className={`col-span-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-bold uppercase tracking-[0.18em] transition ${selectedImage.favorite ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                      >
                        <Star size={16} /> {selectedImage.favorite ? 'Quitar' : 'Fav'}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveImageMeta({ tags: tagDraft })}
                        className="col-span-1 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 font-bold uppercase tracking-[0.18em] text-slate-800 transition hover:bg-slate-200"
                      >
                        Guardar tags
                      </button>
                      <button
                        type="button"
                        onClick={resetImageTransform}
                        className="col-span-1 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 font-bold uppercase tracking-[0.18em] text-sky-700 transition hover:bg-sky-100"
                      >
                        Reset zoom
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteImage(selectedImage.id)}
                        className="col-span-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100"
                      >
                        <Trash2 size={14} /> Borrar
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Zoom y encuadre</p>
                          <p className="mt-1 text-sm text-slate-600">Ajusta escala y desplazamiento en tiempo real para la imagen activa.</p>
                        </div>
                        <div className="rounded-full bg-fuchsia-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-700">
                          {selectedImageTransform.scale.toFixed(2)}x
                        </div>
                      </div>
                      <div className="mt-4 space-y-4">
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Escala</span>
                          <input
                            type="range"
                            min="1"
                            max="4"
                            step="0.05"
                            value={selectedImageTransform.scale}
                            onChange={(event) => updateImageTransform('scale', event.target.value)}
                            className="w-full"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Desplazamiento X</span>
                          <input
                            type="range"
                            min="-960"
                            max="960"
                            step="4"
                            value={selectedImageTransform.x}
                            onChange={(event) => updateImageTransform('x', event.target.value)}
                            className="w-full"
                          />
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{Math.round(selectedImageTransform.x)} px</div>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Desplazamiento Y</span>
                          <input
                            type="range"
                            min="-540"
                            max="540"
                            step="4"
                            value={selectedImageTransform.y}
                            onChange={(event) => updateImageTransform('y', event.target.value)}
                            className="w-full"
                          />
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{Math.round(selectedImageTransform.y)} px</div>
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Todavia no hay imagenes cargadas.</p>
                )}
              </div>

              <div className="max-h-[26rem] space-y-3 overflow-auto pr-1">
                {images.map((image) => {
                  const active = image.id === selectedImageId;

                  return (
                    <div
                      key={image.id}
                      className={`grid w-full grid-cols-[92px_1fr] gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-fuchsia-500 bg-fuchsia-50 shadow-lg shadow-fuchsia-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <img src={image.url} alt={image.label} className="h-20 w-[92px] rounded-xl object-cover" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold uppercase tracking-[0.12em] text-slate-900">{image.label}</div>
                        <div className="mt-2 text-xs font-medium text-slate-500">
                          {new Date(image.uploadedAt).toLocaleString('es-AR')}
                        </div>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          {image.width}x{image.height} {image.format}
                        </div>
                          {(image.tags || []).length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {image.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        <div className={`mt-3 inline-flex rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${active ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {active ? 'Seleccionada' : 'Disponible'}
                        </div>
                          {image.favorite ? (
                            <div className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
                              Favorita
                            </div>
                          ) : null}
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => selectImage(image.id)}
                            className={`rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition ${active ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-700' : 'bg-slate-900 text-white hover:bg-black'}`}
                          >
                            {active ? 'Activa' : 'Seleccionar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteImage(image.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100"
                          >
                            <Trash2 size={12} /> Borrar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ControlCard>
        </main>
      </div>
    </div>
  );
}

export default App;
