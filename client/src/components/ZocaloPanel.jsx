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

export function ZocaloPanel({ texto, setTexto, visible, setVisible, textStyle, updateTextStyle, resetTextStyle, requestJson, setStatus }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

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
                <RangeField label="Margen interno izquierdo" min={0} max={1200} value={textStyle.textInsetLeft} onChange={(value) => updateTextStyle({ textInsetLeft: value })} />
                <RangeField label="Margen interno derecho" min={0} max={1200} value={textStyle.textInsetRight} onChange={(value) => updateTextStyle({ textInsetRight: value })} />
                <RangeField label="Margen interno superior" min={0} max={600} value={textStyle.textInsetTop} onChange={(value) => updateTextStyle({ textInsetTop: value })} />
                <RangeField label="Margen interno inferior" min={0} max={600} value={textStyle.textInsetBottom} onChange={(value) => updateTextStyle({ textInsetBottom: value })} />
              </div>

              <div className="space-y-4">
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
