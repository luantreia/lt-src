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
  const [status, setStatus] = useState('Conectado al panel');
  const [sessionPhase, setSessionPhase] = useState('starting');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const keepaliveIntervalRef = useRef(null);
  const wakePromiseRef = useRef(null);
  const mountedRef = useRef(false);
  const sessionPhaseRef = useRef('starting');

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
      setForm(data.zocalo);
      setTitleForm(data.title || initialTitleForm);
      setQuoteForm(data.quote || initialQuoteForm);
      setVisibility(data.visibility);
      setImages(data.images || []);
      setSelectedImageId(data.selectedImage?.id || null);
      setTagDraft((data.selectedImage?.tags || []).join(', '));
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

      setForm(data.state.zocalo);
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

      setTitleForm(data.state.title);
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

      setQuoteForm(data.state.quote);
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

      setVisibility(data.state.visibility);
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

      setVisibility(data.state.visibility);
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

      setVisibility(data.state.visibility);
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

      setVisibility(data.state.visibility);
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

      setSelectedImageId(data.image.id);
      setImages((currentImages) => {
        const imageMap = new Map(currentImages.map((item) => [item.id, item]));
        imageMap.set(data.image.id, data.image);
        return Array.from(imageMap.values()).sort((left, right) => right.uploadedAt - left.uploadedAt);
      });
      setTagDraft((data.image.tags || []).join(', '));
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

      setImages(data.state.images || []);
      setSelectedImageId(data.image.id);
      setTagDraft((data.image.tags || []).join(', '));
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

      setImages(data.state.images || []);
      setSelectedImageId(data.state.selectedImage?.id || null);
      setTagDraft((data.state.selectedImage?.tags || []).join(', '));
      setVisibility(data.state.visibility);
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

  const selectedImage = images.find((image) => image.id === selectedImageId) || null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(135deg,_#f8fafc,_#e2e8f0_60%,_#cbd5e1)] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-[2rem] border border-slate-200 bg-slate-950 px-6 py-6 text-white shadow-2xl shadow-slate-900/25">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.28em] text-sky-300">
                OBS graphics control
              </p>
              <h1 className="text-3xl font-black uppercase tracking-[0.2em]">Panel de realizacion</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Usa una fuente de navegador para texto y otra para imagen. El panel mantiene estado, biblioteca de imagenes y seleccion persistente.
              </p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
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

        <main className="grid gap-6 xl:grid-cols-[1.05fr_0.8fr_1.15fr]">
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
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => saveImageMeta({ tags: tagDraft })}
                        className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 font-bold uppercase tracking-[0.18em] text-slate-800 transition hover:bg-slate-200"
                      >
                        Guardar tags
                      </button>
                      <button
                        type="button"
                        onClick={() => saveImageMeta({ favorite: !selectedImage.favorite })}
                        className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 font-bold uppercase tracking-[0.18em] transition ${selectedImage.favorite ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                      >
                        <Star size={16} /> {selectedImage.favorite ? 'Quitar favorita' : 'Marcar favorita'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleImage(true)}
                        className="flex-1 rounded-2xl bg-fuchsia-600 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-fuchsia-700"
                      >
                        Mostrar imagen
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleImage(false)}
                        className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold uppercase tracking-[0.18em] text-slate-800 transition hover:bg-slate-100"
                      >
                        Ocultar imagen
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteImage(selectedImage.id)}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100"
                      >
                        Borrar
                      </button>
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
