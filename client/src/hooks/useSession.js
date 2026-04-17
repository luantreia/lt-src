import { useEffect, useRef, useState } from 'react';
import { API_BASE, KEEPALIVE_INTERVAL_MS, WAKE_MAX_RETRY_MS, sleep } from '../utils.js';

export function useSession({ onStateSnapshot }) {
  const [status, setStatus] = useState('Conectando...');
  const [sessionPhase, setSessionPhase] = useState('starting');
  const [loading, setLoading] = useState(true);
  const keepaliveIntervalRef = useRef(null);
  const wakePromiseRef = useRef(null);
  const mountedRef = useRef(false);
  const sessionPhaseRef = useRef('starting');
  const onStateSnapshotRef = useRef(onStateSnapshot);

  // Keep the callback ref up to date without adding it as an effect dep
  useEffect(() => { onStateSnapshotRef.current = onStateSnapshot; });

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

  useEffect(() => {
    mountedRef.current = true;
    startSession();
    return () => {
      mountedRef.current = false;
      stopKeepalive();
    };
  }, []);

  const sessionLabel = {
    starting: 'Iniciando',
    waking: 'Despertando backend',
    active: 'Sesion activa',
    reconnecting: 'Reconectando',
  }[sessionPhase] || 'Iniciando';

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

  async function loadState({ preserveLoading = false } = {}) {
    if (!preserveLoading) setLoading(true);
    try {
      const data = await requestJson('/state', {}, false);
      onStateSnapshotRef.current(data);
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

  return { requestJson, status, setStatus, loading, sessionLabel };
}
