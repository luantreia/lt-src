import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Send, Upload } from 'lucide-react';

const DEFAULT_LOCAL_API_BASE = 'http://localhost:3000';

const normalizeBaseUrl = (value, fallback) => (value || fallback).replace(/\/$/, '');
const toPositiveNumber = (value, fallback) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL, DEFAULT_LOCAL_API_BASE);
const KEEPALIVE_INTERVAL_MS = toPositiveNumber(import.meta.env.VITE_KEEPALIVE_INTERVAL_MS, 120000);
const WAKE_MAX_RETRY_MS = toPositiveNumber(import.meta.env.VITE_WAKE_MAX_RETRY_MS, 8000);

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const OVERLAY_BASE = normalizeBaseUrl(import.meta.env.VITE_OVERLAY_BASE_URL, API_BASE);

function App() {
  const [texto, setTexto] = useState('');
  const [visible, setVisible] = useState(true);
  const [bgVersion, setBgVersion] = useState(Date.now());
  const [uploadingBg, setUploadingBg] = useState(false);
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
        recoverSession('Reanudando sesion...');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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
        const response = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Backend unavailable');
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
          const response = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
          if (response.ok) {
            setSessionPhase('active');
            return true;
          }
        } catch {
          // Keep retrying.
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
    if (ready) await loadState({ preserveLoading: true });
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

  async function loadState({ preserveLoading = false } = {}) {
    if (!preserveLoading) setLoading(true);
    try {
      const data = await requestJson('/state', {}, false);
      setTexto(data.zocalo?.nombre || '');
      setVisible(Boolean(data.visibility?.text ?? true));
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

  async function toggle(value) {
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

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg space-y-6">

        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-400">
            OBS graphics control
          </p>
          <h1 className="text-2xl font-black uppercase tracking-[0.2em]">
            Panel de realizacion
          </h1>
          <p className="text-sm text-slate-400">
            {loading ? 'Cargando...' : status}
            <span className="ml-2 text-slate-600">&mdash; {sessionLabel}</span>
          </p>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              Zocalo al aire
            </span>
            <div
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                visible
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-slate-700/50 text-slate-500'
              }`}
            >
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
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 font-bold uppercase tracking-[0.18em] text-white transition hover:bg-sky-500"
            >
              <Send size={16} /> Enviar al aire
            </button>
          </form>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => toggle(true)}
              disabled={visible}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Eye size={15} /> Mostrar
            </button>
            <button
              type="button"
              onClick={() => toggle(false)}
              disabled={!visible}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:border-red-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <EyeOff size={15} /> Ocultar
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
            Imagen de fondo del zocalo
          </span>

          <img
            key={bgVersion}
            src={`${OVERLAY_BASE}/overlay/zocalo-bg.png?v=${bgVersion}`}
            alt="Fondo del zocalo"
            className="w-full rounded-xl border border-slate-700 object-contain bg-slate-800"
            style={{ maxHeight: '160px' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            onLoad={(e) => { e.currentTarget.style.display = ''; }}
          />

          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-800 px-4 py-4 transition hover:border-sky-500 hover:bg-slate-800/80">
            <Upload size={18} className={uploadingBg ? 'animate-pulse text-sky-400' : 'text-slate-400'} />
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
              {uploadingBg ? 'Subiendo...' : 'Subir nuevo fondo'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingBg}
              onChange={handleBgUpload}
            />
          </label>
        </div>

      </div>
    </div>
  );
}

export default App;
