import React, { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, PhoneCall, Plus, Download, MessageCircle } from 'lucide-react';
import { api, downloadFile } from './api';
import { Select, Btn, StatusBadge, Empty, fmtDate, inr, go, useApp, toInputDate } from './ui';
import { STATUSES, SERVICE_TYPES, CAN_CREATE } from './constants.js';

export default function CandidateList({ title, statusFilter, due, refreshKey = 0, compact }) {
  const { user, notify, startCall } = useApp();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [service, setService] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setQuery(search); setPage(1); }, 400); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page, limit: compact ? 20 : 50 });
    if (query) p.set('q', query);
    if (status || statusFilter) p.set('status', status || statusFilter);
    if (service) p.set('serviceType', service);
    if (due) p.set('due', due);
    setLoading(true);
    try { const d = await api(`/leads?${p}`); setItems(d.items); setMeta({ total: d.total, pages: d.pages }); }
    catch (e) { notify(e.message, 'error'); }
    finally { setLoading(false); }
  }, [page, query, status, service, statusFilter, due, compact, notify]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const changeStatus = async (l, s) => {
    try { await api(`/leads/${l._id}`, { method: 'PATCH', body: { status: s } }); setItems((xs) => xs.map((x) => (x._id === l._id ? { ...x, status: s } : x))); }
    catch (e) { notify(e.message, 'error'); }
  };

  const today = toInputDate(new Date());

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="p-3 border-b flex flex-wrap items-center gap-2">
        {title && <h3 className="font-bold text-sm text-blue-900 mr-2">{title}</h3>}
        <div className="flex items-center gap-1 border rounded-md px-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / mobile / ID / pincode / passport"
            className="flex-1 text-sm p-1.5 focus:outline-none" />
        </div>
        {!statusFilter && <Select options={STATUSES} placeholder="All Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-auto" />}
        {!compact && <Select options={SERVICE_TYPES} placeholder="All Services" value={service} onChange={(e) => { setService(e.target.value); setPage(1); }} className="!w-auto" />}
        <span className="text-xs text-slate-500">{meta.total} records</span>
        <button onClick={load} title="Refresh" className="text-slate-500 hover:text-blue-900 p-1"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        {user.role === 'super_admin' && !compact && (
          <Btn variant="light" onClick={() => downloadFile('/leads/export.csv', 'growcend-candidates.csv').catch((e) => notify(e.message, 'error'))}>
            <Download className="w-4 h-4" /> Excel
          </Btn>
        )}
        {CAN_CREATE.includes(user.role) && !compact && <Btn onClick={() => go('/new')}><Plus className="w-4 h-4" /> New Candidate</Btn>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left text-xs">
            <tr>
              <th className="p-2">ID</th><th className="p-2">Name</th><th className="p-2">Mobile</th>
              <th className="p-2">City / Pincode</th><th className="p-2">Service / Country</th>
              <th className="p-2">Status</th><th className="p-2">Follow-up</th><th className="p-2">Due</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={9}><Empty>{loading ? 'Loading…' : 'No candidates found'}</Empty></td></tr>}
            {items.map((l) => {
              const dueAmt = (l.packageAmount || 0) - (l.paidAmount || 0);
              const fu = l.nextFollowUp ? toInputDate(l.nextFollowUp) : '';
              return (
                <tr key={l._id} className="border-t hover:bg-blue-50/40">
                  <td className="p-2 font-mono text-xs text-blue-900 cursor-pointer" onClick={() => go(`/candidate/${l._id}`)}>{l.leadId}</td>
                  <td className="p-2 font-semibold cursor-pointer hover:underline" onClick={() => go(`/candidate/${l._id}`)}>{l.name}</td>
                  <td className="p-2 whitespace-nowrap">{l.phone}</td>
                  <td className="p-2 text-xs">{[l.address?.city, l.address?.pincode].filter(Boolean).join(' – ') || <span className="text-rose-600">No pincode</span>}</td>
                  <td className="p-2 text-xs">{l.serviceType}<div className="text-slate-500">{[l.country, l.job].filter(Boolean).join(' · ')}</div></td>
                  <td className="p-2">
                    <select value={l.status} onChange={(e) => changeStatus(l, e.target.value)} className="border rounded p-1 text-xs max-w-[150px]">
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className={`p-2 text-xs whitespace-nowrap ${fu && fu < today ? 'text-rose-600 font-semibold' : fu === today ? 'text-amber-700 font-semibold' : ''}`}>{fu ? fmtDate(l.nextFollowUp) : '—'}</td>
                  <td className={`p-2 text-xs whitespace-nowrap ${dueAmt > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{dueAmt > 0 ? inr(dueAmt) : '—'}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <a href={`tel:+91${l.phone}`} onClick={() => startCall(l.phone)} title="Call" className="bg-emerald-600 text-white p-1.5 rounded"><PhoneCall className="w-3.5 h-3.5" /></a>
                      <a href={`https://wa.me/91${l.phone}`} target="_blank" rel="noreferrer" title="WhatsApp" className="bg-green-500 text-white p-1.5 rounded"><MessageCircle className="w-3.5 h-3.5" /></a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t flex items-center justify-end gap-2 text-xs">
        <Btn variant="light" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Btn>
        <span>Page {page} / {meta.pages}</span>
        <Btn variant="light" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next →</Btn>
      </div>
    </div>
  );
}
