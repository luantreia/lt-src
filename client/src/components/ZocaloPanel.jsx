import React, { useState } from 'react';
import { Eye, EyeOff, Send, Settings } from 'lucide-react';
import { ZOCALO_FONT_OPTIONS } from '../utils.js';
import { RangeField } from './controls/RangeField.jsx';
import { SegmentedControl } from './controls/SegmentedControl.jsx';

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

function StatusBadge({ tone = 'neutral', children }) {
  const toneClass = {
    neutral: 'border-slate-700 bg-slate-800 text-slate-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  }[tone] || 'border-slate-700 bg-slate-800 text-slate-300';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${toneClass}`}>
      {children}
    </span>
  );
}

export function ZocaloPanel({ texto, setTexto, onAirTexto, textDraftDirty, textStyleDirty, styleSyncing, visible, setVisible, textStyle, updateTextStyle, resetTextStyle, markTextAsOnAir, requestJson, setStatus }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await requestJson('/zocalo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: texto, partido: '', rol: '' }),
      });
      markTextAsOnAir(texto);
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

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Zocalo al aire</span>
        <div className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${visible ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/50 text-slate-500'}`}>
          {visible ? 'Visible' : 'Oculto'}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={textDraftDirty ? 'warning' : 'success'}>
          {textDraftDirty ? 'Borrador local' : 'Texto al aire'}
        </StatusBadge>
        <StatusBadge tone={styleSyncing ? 'info' : textStyleDirty ? 'warning' : 'success'}>
          {styleSyncing ? 'Sincronizando ajustes' : textStyleDirty ? 'Ajustes locales' : 'Ajustes sincronizados'}
        </StatusBadge>
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
          <Send size={16} /> {textDraftDirty ? 'Enviar cambios al aire' : 'Reenviar al aire'}
        </button>
      </form>

      <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Al aire ahora</span>
          {textDraftDirty && <StatusBadge tone="warning">Todavia no enviado</StatusBadge>}
        </div>
        <p className="mt-2 min-h-6 whitespace-pre-wrap break-words text-slate-200">
          {onAirTexto || <span className="text-slate-500">Sin texto al aire</span>}
        </p>
      </div>

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

      <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Configuracion de texto</span>
          <div className="flex items-center gap-2">
            {settingsOpen && (
              <button
                type="button"
                onClick={resetTextStyle}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setSettingsOpen((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${settingsOpen ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-white'}`}
            >
              <Settings size={14} /> Ajustes
            </button>
          </div>
        </div>

        {settingsOpen && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Ubicacion</span>
                <SegmentedControl label="Anclaje horizontal" options={alignXOptions} value={textStyle.textAnchorX} onChange={(value) => updateTextStyle({ textAnchorX: value })} />
                <SegmentedControl label="Anclaje vertical" options={alignYOptions} value={textStyle.textAnchorY} onChange={(value) => updateTextStyle({ textAnchorY: value })} />
                <RangeField label="Offset horizontal" min={-1200} max={1200} value={textStyle.textOffsetX} onChange={(value) => updateTextStyle({ textOffsetX: value })} />
                <RangeField label="Offset vertical" min={-500} max={500} value={textStyle.textOffsetY} onChange={(value) => updateTextStyle({ textOffsetY: value })} />
                <RangeField label="Ancho del bloque" min={120} max={1800} value={textStyle.textWidth} onChange={(value) => updateTextStyle({ textWidth: value })} />
              </div>

              <div className="space-y-4">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Contenido</span>
                <SegmentedControl label="Alineacion horizontal" options={alignXOptions} value={textStyle.textAlignX} onChange={(value) => updateTextStyle({ textAlignX: value })} />
                <SegmentedControl label="Alineacion vertical" options={alignYOptions} value={textStyle.textAlignY} onChange={(value) => updateTextStyle({ textAlignY: value })} />
                <RangeField label="Tamano de fuente" min={12} max={180} value={textStyle.fontSize} onChange={(value) => updateTextStyle({ fontSize: value })} />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Peso de fuente</span>
                <select
                  value={textStyle.fontWeight}
                  onChange={(event) => updateTextStyle({ fontWeight: event.target.value })}
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
                  value={textStyle.fontFamily}
                  onChange={(event) => updateTextStyle({ fontFamily: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-sky-500"
                >
                  {ZOCALO_FONT_OPTIONS.map((fontFamily) => (
                    <option key={fontFamily} value={fontFamily}>{fontFamily}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Mayusculas automaticas</div>
                <div className="text-xs text-slate-400">Convierte el texto del overlay a uppercase en tiempo real</div>
              </div>
              <button
                type="button"
                onClick={() => updateTextStyle({ textUppercase: !textStyle.textUppercase })}
                className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${textStyle.textUppercase ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
              >
                {textStyle.textUppercase ? 'On' : 'Off'}
              </button>
            </label>

            <div className="grid gap-4 md:grid-cols-[120px_1fr] md:items-end">
              <label className="block space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Color</span>
                <input
                  type="color"
                  value={textStyle.textColor}
                  onChange={(event) => updateTextStyle({ textColor: event.target.value })}
                  className="h-12 w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-1"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Hex</span>
                <input
                  type="text"
                  value={textStyle.textColor}
                  onChange={(event) => updateTextStyle({ textColor: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-sky-500"
                  placeholder="#FFFFFF"
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
