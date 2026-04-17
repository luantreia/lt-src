import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Send } from 'lucide-react';
import { normalizeZocaloStyle, ZOCALO_FONT_OPTIONS } from '../utils.js';

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

export function ZocaloPanel({ texto, setTexto, visible, setVisible, zocaloStyle, setZocaloStyle, requestJson, setStatus }) {
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
          body: JSON.stringify({
            textInsetLeft: normalized.textInsetLeft,
            textInsetRight: normalized.textInsetRight,
            textInsetTop: normalized.textInsetTop,
            textInsetBottom: normalized.textInsetBottom,
            textAlignX: normalized.textAlignX,
            textAlignY: normalized.textAlignY,
            fontSize: normalized.fontSize,
            fontFamily: normalized.fontFamily,
            fontWeight: normalized.fontWeight,
            textColor: normalized.textColor,
          }),
        });
        setZocaloStyle(normalizeZocaloStyle(data.state?.zocaloStyle || data.zocaloStyle || normalized));
      } catch (error) {
        setStatus(error.message);
      }
    }, 140);

    return () => window.clearTimeout(timerId);
  }, [draftStyle, requestJson, setStatus, setZocaloStyle]);

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

  function updateStyle(key, value) {
    setDraftStyle((current) => normalizeZocaloStyle({ ...current, [key]: value }));
  }

  return (
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
        <button type="button" onClick={() => toggle(true)} disabled={visible}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">
          <Eye size={15} /> Mostrar
        </button>
        <button type="button" onClick={() => toggle(false)} disabled={!visible}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:border-red-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed">
          <EyeOff size={15} /> Ocultar
        </button>
      </div>

      <div className="space-y-5 rounded-xl border border-slate-700 bg-slate-800/70 p-4">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Texto del zocalo</span>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <RangeField label="Margen interno izquierdo" min={0} max={1200} value={draftStyle.textInsetLeft} onChange={(value) => updateStyle('textInsetLeft', value)} />
            <RangeField label="Margen interno derecho" min={0} max={1200} value={draftStyle.textInsetRight} onChange={(value) => updateStyle('textInsetRight', value)} />
            <RangeField label="Margen interno superior" min={0} max={600} value={draftStyle.textInsetTop} onChange={(value) => updateStyle('textInsetTop', value)} />
            <RangeField label="Margen interno inferior" min={0} max={600} value={draftStyle.textInsetBottom} onChange={(value) => updateStyle('textInsetBottom', value)} />
          </div>

          <div className="space-y-4">
            <SegmentedControl label="Alineacion horizontal" options={alignXOptions} value={draftStyle.textAlignX} onChange={(value) => updateStyle('textAlignX', value)} />
            <SegmentedControl label="Alineacion vertical" options={alignYOptions} value={draftStyle.textAlignY} onChange={(value) => updateStyle('textAlignY', value)} />
            <RangeField label="Tamano de fuente" min={12} max={180} value={draftStyle.fontSize} onChange={(value) => updateStyle('fontSize', value)} />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
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

        <div className="grid gap-4 md:grid-cols-[120px_1fr] md:items-end">
          <label className="block space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Color</span>
            <input
              type="color"
              value={draftStyle.textColor}
              onChange={(event) => updateStyle('textColor', event.target.value)}
              className="h-12 w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-1"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Hex</span>
            <input
              type="text"
              value={draftStyle.textColor}
              onChange={(event) => updateStyle('textColor', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-sky-500"
              placeholder="#FFFFFF"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
