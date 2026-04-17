import React from 'react';

export function SegmentedControl({ label, options, value, onChange }) {
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