import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Star, Trash2, Upload, Wand2 } from 'lucide-react';
import { normalizeImageTransform, initialImageTransform } from '../utils.js';

export function ImagesPanel({
  images,
  selectedImageId,
  imageVisible,
  imageTransform,
  setImageTransform,
  skipTransformSyncRef,
  requestJson,
  applyStateSnapshot,
  setStatus,
}) {
  const [uploading, setUploading] = useState(false);

  const selectedImage = images.find((img) => img.id === selectedImageId) || null;

  // Zoom sync con debounce
  useEffect(() => {
    if (!selectedImageId) return;
    if (skipTransformSyncRef.current) {
      skipTransformSyncRef.current = false;
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        await requestJson('/image/zoom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(imageTransform),
        });
      } catch (error) {
        setStatus(error.message);
      }
    }, 90);
    return () => window.clearTimeout(id);
  }, [selectedImageId, imageTransform]);

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      let lastData;
      for (const file of files) {
        const formData = new FormData();
        formData.append('image', file);
        lastData = await requestJson('/upload', { method: 'POST', body: formData });
      }
      if (lastData?.state) applyStateSnapshot(lastData.state);
      setStatus(`${files.length} imagen(es) cargadas`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.target.value = '';
      setUploading(false);
    }
  }

  async function selectImage(imageId) {
    try {
      const data = await requestJson('/image/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId }),
      });
      applyStateSnapshot(data.state);
      setStatus('Imagen seleccionada');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleImage(value) {
    if (value && !selectedImageId) {
      setStatus('Selecciona una imagen primero');
      return;
    }
    try {
      const data = await requestJson('/image/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: value }),
      });
      applyStateSnapshot(data.state);
      setStatus(value ? 'Imagen visible' : 'Imagen oculta');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleFavorite() {
    if (!selectedImage) return;
    try {
      const data = await requestJson(`/image/${encodeURIComponent(selectedImage.id)}/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !selectedImage.favorite }),
      });
      applyStateSnapshot(data.state);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deleteImage(imageId) {
    try {
      const data = await requestJson(`/image/${encodeURIComponent(imageId)}`, { method: 'DELETE' });
      applyStateSnapshot(data.state);
      setStatus('Imagen eliminada');
    } catch (error) {
      setStatus(error.message);
    }
  }

  function updateTransform(key, value) {
    setImageTransform((t) => normalizeImageTransform({ ...t, [key]: value }));
  }

  function resetTransform() {
    skipTransformSyncRef.current = false;
    setImageTransform(initialImageTransform);
    setStatus('Zoom reiniciado');
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Imagenes OBS</span>
        <div className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${imageVisible ? 'bg-fuchsia-500/15 text-fuchsia-400' : 'bg-slate-700/50 text-slate-500'}`}>
          {imageVisible ? 'Visible' : 'Oculta'}
        </div>
      </div>

      {/* Upload */}
      <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-800 px-4 py-4 transition hover:border-fuchsia-500">
        {uploading
          ? <Wand2 size={18} className="animate-pulse text-fuchsia-400" />
          : <Upload size={18} className="text-slate-400" />}
        <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
          {uploading ? 'Subiendo...' : 'Cargar imagen(es)'}
        </span>
        <input type="file" multiple accept="image/*" className="hidden" disabled={uploading} onChange={handleUpload} />
      </label>

      {/* Imagen seleccionada */}
      {selectedImage && (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-4">
          <img src={selectedImage.url} alt={selectedImage.label} className="w-full rounded-lg object-cover" style={{ maxHeight: '180px' }} />

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => toggleImage(true)} disabled={imageVisible}
              className="flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed">
              <Eye size={14} /> Mostrar
            </button>
            <button type="button" onClick={() => toggleImage(false)} disabled={!imageVisible}
              className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed">
              <EyeOff size={14} /> Ocultar
            </button>
            <button type="button" onClick={toggleFavorite}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold uppercase tracking-wide transition ${selectedImage.favorite ? 'bg-amber-500 text-white hover:bg-amber-400' : 'border border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              <Star size={14} />
            </button>
            <button type="button" onClick={() => deleteImage(selectedImage.id)}
              className="ml-auto flex items-center gap-2 rounded-xl border border-rose-800/60 bg-rose-900/30 px-3 py-2 text-sm font-bold uppercase tracking-wide text-rose-400 transition hover:bg-rose-900/50">
              <Trash2 size={14} />
            </button>
          </div>

          {/* Zoom y encuadre */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Zoom y encuadre</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-fuchsia-400">{imageTransform.scale.toFixed(2)}x</span>
                <button type="button" onClick={resetTransform}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-300 transition hover:bg-slate-600">
                  Reset
                </button>
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Escala</span>
              <input type="range" min="1" max="4" step="0.05" value={imageTransform.scale}
                onChange={(e) => updateTransform('scale', e.target.value)} className="w-full accent-fuchsia-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Desplazamiento X — {Math.round(imageTransform.x)} px</span>
              <input type="range" min="-960" max="960" step="4" value={imageTransform.x}
                onChange={(e) => updateTransform('x', e.target.value)} className="w-full accent-fuchsia-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Desplazamiento Y — {Math.round(imageTransform.y)} px</span>
              <input type="range" min="-540" max="540" step="4" value={imageTransform.y}
                onChange={(e) => updateTransform('y', e.target.value)} className="w-full accent-fuchsia-500" />
            </label>
          </div>
        </div>
      )}

      {/* Biblioteca */}
      {images.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Biblioteca</span>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {images.map((image) => {
              const active = image.id === selectedImageId;
              return (
                <button key={image.id} type="button" onClick={() => selectImage(image.id)}
                  className={`grid w-full grid-cols-[80px_1fr] gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-fuchsia-500 bg-fuchsia-950/40' : 'border-slate-700 bg-slate-800 hover:border-slate-600'}`}>
                  <img src={image.url} alt={image.label} className="h-[54px] w-20 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold uppercase tracking-[0.1em] text-slate-200">{image.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{new Date(image.uploadedAt).toLocaleString('es-AR')}</div>
                    <div className="mt-1 flex gap-2">
                      {image.favorite && <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400">★ Fav</span>}
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${active ? 'text-fuchsia-400' : 'text-slate-600'}`}>
                        {active ? 'Seleccionada' : `${image.width}×${image.height}`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
