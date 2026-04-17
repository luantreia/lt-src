import React from 'react';
import { Eye, EyeOff, Send } from 'lucide-react';

export function ZocaloPanel({ texto, setTexto, visible, setVisible, requestJson, setStatus }) {
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
    </div>
  );
}
