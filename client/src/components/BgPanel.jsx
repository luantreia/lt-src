import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Settings, Upload } from 'lucide-react';
import {
  defaultZocaloStyle,
  normalizeZocaloStyle,
  OVERLAY_BASE,
  ZOCALO_FONT_OPTIONS,
} from '../utils.js';

const alignXOptions = [
  { value: 'left', label: 'Izq' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Der' },
];

const alignYOptions = [
  { value: 'top', label: 'Arriba' },
  { value: 'center', label: 'Centro' },
  { value: 'bottom', label: 'Abajo' },
];

const fontWeightOptions = [400, 500, 600, 700, 800, 900];

const styleSignature = (value) => JSON.stringify(normalizeZocaloStyle(value));

function RangeField({ label, min, max, step = 1, value, onChange }) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-right text-xs text-white outline-none transition focus:border-sky-500"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full accent-sky-500"
      />
    </label>
  );
}

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${active ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BgPanel({ texto, zocaloStyle, setZocaloStyle, requestJson, setStatus }) {
  const [bgVersion, setBgVersion] = useState(Date.now());
  const [uploading, setUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(true);
  const [draftStyle, setDraftStyle] = useState(() => normalizeZocaloStyle(zocaloStyle));
  const syncedStyleRef = useRef(styleSignature(zocaloStyle));

  useEffect(() => {
    const normalized = normalizeZocaloStyle(zocaloStyle);
    syncedStyleRef.current = styleSignature(normalized);
    setDraftStyle(normalized);
  }, [zocaloStyle]);

  useEffect(() => {
    const normalized = normalizeZocaloStyle(draftStyle);
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
        setZocaloStyle(normalizeZocaloStyle(data.state?.zocaloStyle || data.zocaloStyle || normalized));
      } catch (error) {
        setStatus(error.message);
      }
    }, 140);

    return () => window.clearTimeout(timerId);
  }, [draftStyle, requestJson, setStatus, setZocaloStyle]);

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      await requestJson('/zocalo-bg', { method: 'POST', body: formData });
      setBgVersion(Date.now());
      setPreviewLoaded(true);
      setStatus('Fondo del zocalo actualizado');
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.target.value = '';
      setUploading(false);
    }
  }

  function updateStyle(key, value) {
    setDraftStyle((current) => normalizeZocaloStyle({ ...current, [key]: value }));
  }

  function resetStyle() {
    setDraftStyle(defaultZocaloStyle);
    setStatus('Ajustes del zocalo reiniciados');
  }

  const previewText = texto.trim() || 'VISTA PREVIA DEL ZOCALO';
  const verticalAlign = {
    top: 'flex-start',
    center: 'center',
    bottom: 'flex-end',
  }[draftStyle.textAlignY];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Imagen de fondo del zocalo</span>
        <button
          type="button"
          onClick={() => setSettingsOpen((current) => !current)}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${settingsOpen ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'}`}
        >
          <Settings size={14} /> Ajustes
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
        <div className="relative h-64 overflow-hidden">
          <div className="absolute left-0 top-0 h-[1080px] w-[1920px] origin-top-left scale-[0.17] bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_72%)]">
            <div
              className="absolute"
              style={{
                left: `${draftStyle.bgLeft}px`,
                bottom: `${draftStyle.bgBottom}px`,
                width: `${draftStyle.bgWidth}px`,
              }}
            >
              <div className="relative">
                <img
                  key={bgVersion}
                  src={`${OVERLAY_BASE}/overlay/zocalo-bg.png?v=${bgVersion}`}
                  alt="Fondo del zocalo"
                  className="block w-full"
                  onError={() => setPreviewLoaded(false)}
                  onLoad={() => setPreviewLoaded(true)}
                />
                {!previewLoaded && (
                  <div className="absolute inset-0 flex min-h-40 items-center justify-center border border-dashed border-slate-500 bg-slate-800/90 text-center text-3xl font-bold uppercase tracking-[0.18em] text-slate-400">
                    Sin PNG base
                  </div>
                )}
                <div
                  className="absolute inset-0 overflow-hidden text-white"
                  style={{
                    paddingLeft: `${draftStyle.textInsetLeft}px`,
                    paddingRight: `${draftStyle.textInsetRight}px`,
                    paddingTop: `${draftStyle.textInsetTop}px`,
                    paddingBottom: `${draftStyle.textInsetBottom}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: verticalAlign,
                    textAlign: draftStyle.textAlignX,
                    fontSize: `${draftStyle.fontSize}px`,
                    fontFamily: draftStyle.fontFamily,
                    fontWeight: draftStyle.fontWeight,
                    lineHeight: 1.1,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    textShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
                  }}
                >
                  <div>{previewText}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-800 px-4 py-4 transition hover:border-sky-500">
        <Upload size={18} className={uploading ? 'animate-pulse text-sky-400' : 'text-slate-400'} />
        <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
          {uploading ? 'Subiendo...' : 'Subir nuevo fondo'}
        </span>
        <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleUpload} />
      </label>

      {settingsOpen && (
        <div className="space-y-5 rounded-xl border border-slate-700 bg-slate-800/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Configuracion fina del zocalo</span>
            <button
              type="button"
              onClick={resetStyle}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Fondo</span>
              <RangeField label="Margen izquierdo" min={0} max={1920} value={draftStyle.bgLeft} onChange={(value) => updateStyle('bgLeft', value)} />
              <RangeField label="Margen inferior" min={0} max={1080} value={draftStyle.bgBottom} onChange={(value) => updateStyle('bgBottom', value)} />
              <RangeField label="Ancho del fondo" min={200} max={1920} value={draftStyle.bgWidth} onChange={(value) => updateStyle('bgWidth', value)} />
            </div>

            <div className="space-y-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Texto</span>
              <RangeField label="Margen interno izquierdo" min={0} max={1200} value={draftStyle.textInsetLeft} onChange={(value) => updateStyle('textInsetLeft', value)} />
              <RangeField label="Margen interno derecho" min={0} max={1200} value={draftStyle.textInsetRight} onChange={(value) => updateStyle('textInsetRight', value)} />
              <RangeField label="Margen interno superior" min={0} max={600} value={draftStyle.textInsetTop} onChange={(value) => updateStyle('textInsetTop', value)} />
              <RangeField label="Margen interno inferior" min={0} max={600} value={draftStyle.textInsetBottom} onChange={(value) => updateStyle('textInsetBottom', value)} />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <SegmentedControl label="Alineacion horizontal" options={alignXOptions} value={draftStyle.textAlignX} onChange={(value) => updateStyle('textAlignX', value)} />
            <SegmentedControl label="Alineacion vertical" options={alignYOptions} value={draftStyle.textAlignY} onChange={(value) => updateStyle('textAlignY', value)} />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <RangeField label="Tamano de fuente" min={12} max={180} value={draftStyle.fontSize} onChange={(value) => updateStyle('fontSize', value)} />

            <label className="block space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Peso de fuente</span>
              <select
                value={draftStyle.fontWeight}
                onChange={(event) => updateStyle('fontWeight', event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-sky-500"
              >
                {fontWeightOptions.map((weight) => (
                  <option key={weight} value={weight}>{weight}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Fuente</span>
            <select
              value={draftStyle.fontFamily}
              onChange={(event) => updateStyle('fontFamily', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-sky-500"
            >
              {ZOCALO_FONT_OPTIONS.map((fontFamily) => (
                <option key={fontFamily} value={fontFamily}>{fontFamily}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
