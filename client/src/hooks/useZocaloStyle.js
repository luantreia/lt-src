import { useEffect, useRef, useState } from 'react';
import {
  defaultZocaloBgStyle,
  defaultZocaloStyle,
  defaultZocaloTextStyle,
  normalizeZocaloBgStyle,
  normalizeZocaloStyle,
  normalizeZocaloTextStyle,
} from '../utils.js';

const styleSignature = (value) => JSON.stringify(normalizeZocaloStyle(value));
const bgSignature = (value) => JSON.stringify(normalizeZocaloBgStyle(value));
const textSignature = (value) => JSON.stringify(normalizeZocaloTextStyle(value));

export function useZocaloStyle({ requestJson, setStatus }) {
  const [zocaloStyle, setZocaloStyleState] = useState(defaultZocaloStyle);
  const [syncedStyle, setSyncedStyle] = useState(defaultZocaloStyle);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncedStyleRef = useRef(styleSignature(defaultZocaloStyle));
  const skipSyncRef = useRef(false);

  const normalizedStyle = normalizeZocaloStyle(zocaloStyle);
  const bgDirty = bgSignature(normalizedStyle.bg) !== bgSignature(syncedStyle.bg);
  const textDirty = textSignature(normalizedStyle.text) !== textSignature(syncedStyle.text);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return undefined;
    }

    const normalized = normalizedStyle;
    if (styleSignature(normalized) === syncedStyleRef.current) {
      return undefined;
    }

    const timerId = window.setTimeout(async () => {
      setIsSyncing(true);
      try {
        const data = await requestJson('/zocalo-style', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        });
        const nextStyle = normalizeZocaloStyle(data.state?.zocaloStyle || data.zocaloStyle || normalized);
        syncedStyleRef.current = styleSignature(nextStyle);
        setSyncedStyle(nextStyle);
        skipSyncRef.current = true;
        setZocaloStyleState(nextStyle);
      } catch (error) {
        setStatus(error.message);
      } finally {
        setIsSyncing(false);
      }
    }, 140);

    return () => window.clearTimeout(timerId);
  }, [normalizedStyle, requestJson, setStatus]);

  function applyRemoteStyle(value) {
    const normalized = normalizeZocaloStyle(value || defaultZocaloStyle);
    syncedStyleRef.current = styleSignature(normalized);
    setSyncedStyle(normalized);
    skipSyncRef.current = true;
    setZocaloStyleState(normalized);
  }

  function updateBgStyle(patch) {
    setZocaloStyleState((current) => normalizeZocaloStyle({
      ...current,
      bg: { ...current.bg, ...patch },
    }));
  }

  function updateTextStyle(patch) {
    setZocaloStyleState((current) => normalizeZocaloStyle({
      ...current,
      text: { ...current.text, ...patch },
    }));
  }

  function resetBgStyle() {
    updateBgStyle(defaultZocaloBgStyle);
    setStatus('Ajustes del fondo reiniciados');
  }

  function resetTextStyle() {
    updateTextStyle(defaultZocaloTextStyle);
    setStatus('Ajustes del texto reiniciados');
  }

  return {
    zocaloStyle,
    bgStyle: normalizedStyle.bg,
    textStyle: normalizedStyle.text,
    bgDirty,
    textDirty,
    isSyncing,
    applyRemoteStyle,
    updateBgStyle,
    updateTextStyle,
    resetBgStyle,
    resetTextStyle,
  };
}