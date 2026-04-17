import React, { useRef, useState } from 'react';
import { useSession } from './hooks/useSession.js';
import { initialImageTransform, normalizeImageTransform } from './utils.js';
import { ZocaloPanel } from './components/ZocaloPanel.jsx';
import { BgPanel } from './components/BgPanel.jsx';
import { ImagesPanel } from './components/ImagesPanel.jsx';

function App() {
  const [texto, setTexto] = useState('');
  const [visible, setVisible] = useState(true);
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [imageVisible, setImageVisible] = useState(false);
  const [imageTransform, setImageTransform] = useState(initialImageTransform);
  const skipTransformSyncRef = useRef(true);

  function applyStateSnapshot(data) {
    if (!data) return;
    setTexto(data.zocalo?.nombre || '');
    setVisible(Boolean(data.visibility?.text ?? true));
    setImages(data.images || []);
    setSelectedImageId(data.selectedImage?.id || null);
    setImageVisible(Boolean(data.visibility?.image ?? false));
    skipTransformSyncRef.current = true;
    setImageTransform(normalizeImageTransform(data.selectedImageTransform || initialImageTransform));
  }

  const { requestJson, status, setStatus, loading, sessionLabel } = useSession({
    onStateSnapshot: applyStateSnapshot,
  });

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl space-y-6">

        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-400">OBS graphics control</p>
          <h1 className="text-2xl font-black uppercase tracking-[0.2em]">Panel de realizacion</h1>
          <p className="text-sm text-slate-400">
            {loading ? 'Cargando...' : status}
            <span className="ml-2 text-slate-600">&mdash; {sessionLabel}</span>
          </p>
        </header>

        <ZocaloPanel
          texto={texto}
          setTexto={setTexto}
          visible={visible}
          setVisible={setVisible}
          requestJson={requestJson}
          setStatus={setStatus}
        />

        <BgPanel
          requestJson={requestJson}
          setStatus={setStatus}
        />

        <ImagesPanel
          images={images}
          selectedImageId={selectedImageId}
          imageVisible={imageVisible}
          imageTransform={imageTransform}
          setImageTransform={setImageTransform}
          skipTransformSyncRef={skipTransformSyncRef}
          requestJson={requestJson}
          applyStateSnapshot={applyStateSnapshot}
          setStatus={setStatus}
        />

      </div>
    </div>
  );
}

export default App;
