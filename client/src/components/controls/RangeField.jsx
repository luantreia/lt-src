import React from 'react';

export function RangeField({ label, min, max, step = 1, value, onChange }) {
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