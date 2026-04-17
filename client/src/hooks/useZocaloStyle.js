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

export function useZocaloStyle({ requestJson, setStatus }) {
  const [zocaloStyle, setZocaloStyleState] = useState(defaultZocaloStyle);
  const syncedStyleRef = useRef(styleSignature(defaultZocaloStyle));
  const skipSyncRef = useRef(false);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return undefined;
    }

    const normalized = normalizeZocaloStyle(zocaloStyle);
    if (styleSignature(normalized) === syncedStyleRef.current) {
      return undefined;
    }

    const timerId = window.setTimeout(async () => {
      try {
        const data = await requestJson('/zocalo-style', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        });
        const nextStyle = normalizeZocaloStyle(data.state?.zocaloStyle || data.zocaloStyle || normalized);
        syncedStyleRef.current = styleSignature(nextStyle);
        skipSyncRef.current = true;
        setZocaloStyleState(nextStyle);
      } catch (error) {
        setStatus(error.message);
      }
    }, 140);

    return () => window.clearTimeout(timerId);
  }, [requestJson, setStatus, zocaloStyle]);

  function applyRemoteStyle(value) {
    const normalized = normalizeZocaloStyle(value || defaultZocaloStyle);
    syncedStyleRef.current = styleSignature(normalized);
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
    bgStyle: normalizeZocaloBgStyle(zocaloStyle.bg),
    textStyle: normalizeZocaloTextStyle(zocaloStyle.text),
    applyRemoteStyle,
    updateBgStyle,
    updateTextStyle,
    resetBgStyle,
    resetTextStyle,
  };
}