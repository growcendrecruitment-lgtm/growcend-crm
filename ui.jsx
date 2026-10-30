import React, { createContext, useContext } from 'react';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
export const go = (path) => { window.location.hash = path; };

// ---------- formatting ----------
const IST = 330 * 60000;
export const toInputDate = (d) => (d ? new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10) : '');
export const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = toInputDate(d).split('-');
  return `${day}-${m}-${y}`;
};
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const todayInput = () => toInputDate(new Date());

// ---------- nested object helpers ----------
export const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export const setPath = (o, p, v) => {
  const keys = p.split('.');
  const copy = { ...o };
  let cur = copy;
  keys.slice(0, -1).forEach((k) => { cur[k] = { ...(cur[k] || {}) }; cur = cur[k]; });
  cur[keys[keys.length - 1]] = v;
  return copy;
};

// ---------- components ----------
const inputCls = 'w-full border border-slate-300 rounded-md px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500';

export function Field({ label, required, error, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-slate-600 mb-1">
        {label}{required && <span className="text-rose-600"> *</span>}
      </span>
      {children}
      {error ? <span className="block text-[11px] text-rose-600 mt-0.5">{error}</span>
        : hint ? <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span> : null}
    </label>
  );
}
export const Input = ({ className = '', ...p }) => <input {...p} className={`${inputCls} ${className}`} />;
export const TextArea = ({ className = '', ...p }) => <textarea rows={3} {...p} className={`${inputCls} ${className}`} />;
export function Select({ options, placeholder = '— Select —', className = '', ...p }) {
  return (
    <select {...p} className={`${inputCls} ${className}`}>
      <option value="">{placeholder}</option>
      {options.map((o) => typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Section({ title, children, right }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-bold text-sm text-blue-900">{title}</h3>{right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
export const Grid = ({ children, cols = 3 }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 4 ? 'lg:grid-cols-4' : cols === 2 ? '' : 'lg:grid-cols-3'} gap-3`}>{children}</div>
);

export function Btn({ variant = 'primary', className = '', ...p }) {
  const v = {
    primary: 'bg-blue-900 hover:bg-blue-800 text-white',
    green: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    red: 'bg-rose-600 hover:bg-rose-700 text-white',
    light: 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
  }[variant];
  return <button {...p} className={`${v} text-xs font-semibold px-3 py-2 rounded-md disabled:opacity-50 inline-flex items-center gap-1.5 justify-center ${className}`} />;
}

const STATUS_COLOR = {
  'New Lead': 'bg-sky-100 text-sky-800', Interested: 'bg-blue-100 text-blue-800', 'Not Interested': 'bg-slate-200 text-slate-600',
  'Visa Approved': 'bg-emerald-100 text-emerald-800', Deployed: 'bg-emerald-600 text-white', 'Visa Rejected': 'bg-rose-100 text-rose-800',
  Rejected: 'bg-rose-100 text-rose-800', 'Refund / Cancelled': 'bg-rose-100 text-rose-800', 'Advance Payment Received': 'bg-amber-100 text-amber-800'
};
export const StatusBadge = ({ status }) => (
  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLOR[status] || 'bg-indigo-50 text-indigo-800'}`}>{status}</span>
);

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex justify-between items-center">
          <h3 className="font-bold text-sm">{title}</h3>
          <button onClick={onClose} className="text-slate-500 text-lg leading-none">✕</button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export const Empty = ({ children }) => <div className="p-8 text-center text-sm text-slate-400">{children}</div>;
