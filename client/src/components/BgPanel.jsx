import React, { useState } from 'react';
import { RotateCcw, Settings, Upload } from 'lucide-react';
import {
  API_BASE,
  OVERLAY_BASE,
  OVERLAY_WS_BASE,
} from '../utils.js';
import { RangeField } from './controls/RangeField.jsx';
import { SegmentedControl } from './controls/SegmentedControl.jsx';

const bgAlignXOptions = [
  { value: 'left', label: 'Izq' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Der' },
];

export function BgPanel({ texto, bgStyle, updateBgStyle, resetBgStyle, requestJson, setStatus }) {
  const [bgVersion, setBgVersion] = useState(Date.now());
  const [uploading, setUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
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
      setUploading(false);
    }
  }

  const overlayPreviewUrl = `${OVERLAY_BASE}/overlay/text.html?apiBase=${encodeURIComponent(API_BASE)}&wsBase=${encodeURIComponent(OVERLAY_WS_BASE)}&previewVersion=${bgVersion}`;

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
            <iframe
              key={overlayPreviewUrl}
              title="Preview del overlay real"
              src={overlayPreviewUrl}
              className="h-[1080px] w-[1920px] border-0 bg-transparent"
            />
          </div>
          {!texto.trim() && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-slate-700 bg-slate-950/85 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              El preview real queda vacio hasta que envies texto al zocalo
            </div>
          )}
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
              onClick={resetBgStyle}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Fondo</span>
              <SegmentedControl label="Anclaje horizontal" options={bgAlignXOptions} value={bgStyle.bgAlignX} onChange={(value) => updateBgStyle({ bgAlignX: value })} />
              <RangeField label="Offset horizontal" min={-960} max={960} value={bgStyle.bgLeft} onChange={(value) => updateBgStyle({ bgLeft: value })} />
              <RangeField label="Margen inferior" min={0} max={1080} value={bgStyle.bgBottom} onChange={(value) => updateBgStyle({ bgBottom: value })} />
              <RangeField label="Ancho del fondo" min={200} max={1920} value={bgStyle.bgWidth} onChange={(value) => updateBgStyle({ bgWidth: value })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
