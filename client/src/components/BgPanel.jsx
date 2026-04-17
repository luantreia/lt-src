import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { OVERLAY_BASE } from '../utils.js';

export function BgPanel({ requestJson, setStatus }) {
  const [bgVersion, setBgVersion] = useState(Date.now());
  const [uploading, setUploading] = useState(false);

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

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Imagen de fondo del zocalo</span>

      <img
        key={bgVersion}
        src={`${OVERLAY_BASE}/overlay/zocalo-bg.png?v=${bgVersion}`}
        alt="Fondo del zocalo"
        className="w-full rounded-xl border border-slate-700 object-contain bg-slate-800"
        style={{ maxHeight: '140px' }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        onLoad={(e) => { e.currentTarget.style.display = ''; }}
      />

      <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-800 px-4 py-4 transition hover:border-sky-500">
        <Upload size={18} className={uploading ? 'animate-pulse text-sky-400' : 'text-slate-400'} />
        <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
          {uploading ? 'Subiendo...' : 'Subir nuevo fondo'}
        </span>
        <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleUpload} />
      </label>
    </div>
  );
}
