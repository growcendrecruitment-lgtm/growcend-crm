import React, { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, Plus, Download, PhoneCall, MessageCircle, Save } from 'lucide-react';
import { api, downloadFile } from './api';
import { Section, Field, Input, Select, TextArea, Btn, Grid, Modal, Empty, fmtDate, fmtDateTime, useApp, toInputDate } from './ui';
import { AGENT_TYPES, AGENT_STATUS, AGENT_MANAGE, normalizePhone, isAnyPhone, isEmail } from './constants.js';

const EMPTY = {
  agentName: '', companyName: '', contactPerson: '', phone: '', whatsapp: '', email: '', country: 'India', city: '', address: '',
  agentType: '', manpower: '', jobCategories: '', expectedRate: '', notes: '', followUpDate: '', status: 'New Lead'
};
const waLink = (p) => `https://wa.me/${String(p).length === 10 ? '91' + p : p}`;

// ================= B2B Agent Register =================
export default function Agents() {
  const { user, notify } = useApp();
  const manager = AGENT_MANAGE.includes(user.role);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [by, setBy] = useState('');
  const [staff, setStaff] = useState([]);
  const [open, setOpen] = useState(null); // 'new' or agent id
  const [loading, setLoading] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 400); return () => clearTimeout(t); }, [search]);
  useEffect(() => { if (manager) api('/users/basic').then((u) => setStaff(u.filter((x) => x.role !== 'super_admin'))).catch(() => {}); }, [manager]);

  const params = useCallback((extra = {}) => {
    const p = new URLSearchParams({ page, limit: 50, ...extra });
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    if (by) p.set('createdBy', by);
    return p;
  }, [page, q, status, by]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api(`/agents?${params()}`); setItems(d.items); setMeta({ total: d.total, pages: d.pages }); }
    catch (e) { notify(e.message, 'error'); } finally { setLoading(false); }
  }, [params, notify]);
  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    const p = params(); p.delete('page'); p.delete('limit');
    const who = by ? staff.find((s) => s.id === by)?.name : manager ? 'all' : user.name;
    downloadFile(`/agents/export.csv?${p}`, `b2b-agent-leads-${(who || 'all').replace(/\s+/g, '_')}.csv`).catch((e) => notify(e.message, 'error'));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h2 className="text-xl font-bold">B2B Agent Register</h2>
          <p className="text-xs text-slate-500">
            {manager ? 'All agent / manpower company leads from every Telecaller. New leads are auto-assigned to B2B Counsellor (Bittu).'
              : 'Agent / manpower company / recruitment agency enquiries — NOT candidates. Every entry goes automatically to Bittu (B2B).'}
          </p>
        </div>
        <Btn onClick={() => setOpen('new')}><Plus className="w-4 h-4" /> New Agent Lead</Btn>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-3 border-b flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border rounded-md px-2 flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agent / company / mobile / city / AG-ID" className="flex-1 text-sm p-1.5 focus:outline-none" />
          </div>
          <Select options={AGENT_STATUS} placeholder="All Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-auto" />
          {manager && <Select options={staff.map((s) => ({ value: s.id, label: `Entered by: ${s.name}` }))} placeholder="Entered by: Everyone" value={by} onChange={(e) => { setBy(e.target.value); setPage(1); }} className="!w-auto" />}
          <span className="text-xs text-slate-500">{meta.total} agents</span>
          <button onClick={load} title="Refresh" className="text-slate-500 hover:text-blue-900 p-1"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Btn variant="light" onClick={exportCsv} title="Excel of the list shown (choose 'Entered by' for one telecaller)"><Download className="w-4 h-4" /> Excel</Btn>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left text-xs"><tr>
              <th className="p-2">ID</th><th className="p-2">Agent / Company</th><th className="p-2">Mobile</th><th className="p-2">Country / City</th>
              <th className="p-2">Manpower / Jobs</th><th className="p-2">Status</th><th className="p-2">Follow-up</th><th className="p-2">Entered by</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={9}><Empty>{loading ? 'Loading…' : 'No agent leads yet'}</Empty></td></tr>}
              {items.map((a) => (
                <tr key={a._id} className="border-t hover:bg-blue-50/40 cursor-pointer" onClick={() => setOpen(a._id)}>
                  <td className="p-2 font-mono text-xs text-blue-900">{a.agentId}{manager && !a.seenByB2B && <span className="ml-1 bg-rose-600 text-white text-[9px] rounded px-1">NEW</span>}</td>
                  <td className="p-2"><b>{a.agentName}</b><div className="text-xs text-slate-500">{[a.companyName, a.agentType].filter(Boolean).join(' · ')}</div></td>
                  <td className="p-2 whitespace-nowrap text-xs">{a.phone}</td>
                  <td className="p-2 text-xs">{[a.country, a.city].filter(Boolean).join(' / ')}</td>
                  <td className="p-2 text-xs">{a.manpower}<div className="text-slate-500">{a.jobCategories}</div></td>
                  <td className="p-2 text-xs">{a.status}{!a.active && <div className="text-rose-600">Inactive</div>}</td>
                  <td className="p-2 text-xs whitespace-nowrap">{a.followUpDate ? fmtDate(a.followUpDate) : '—'}</td>
                  <td className="p-2 text-xs text-slate-500">{a.createdByName}<div>{fmtDate(a.createdAt)}</div></td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <a href={`tel:${a.phone.length === 10 ? '+91' : '+'}${a.phone}`} title="Call" className="bg-emerald-600 text-white p-1.5 rounded"><PhoneCall className="w-3.5 h-3.5" /></a>
                      <a href={waLink(a.whatsapp || a.phone)} target="_blank" rel="noreferrer" title="WhatsApp" className="bg-green-500 text-white p-1.5 rounded"><MessageCircle className="w-3.5 h-3.5" /></a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t flex items-center justify-end gap-2 text-xs">
          <Btn variant="light" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Btn>
          <span>Page {page} / {meta.pages}</span>
          <Btn variant="light" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next →</Btn>
        </div>
      </div>

      {open && <AgentModal id={open === 'new' ? null : open} onClose={() => setOpen(null)} onSaved={() => load()} />}
    </div>
  );
}

function AgentModal({ id, onClose, onSaved }) {
  const { user, notify } = useApp();
  const [a, setA] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');

  useEffect(() => {
    if (!id) return;
    api(`/agents/${id}`).then((x) => { setA(x); setF({ ...EMPTY, ...x, followUpDate: toInputDate(x.followUpDate) }); onSaved(); })
      .catch((e) => { notify(e.message, 'error'); onClose(); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canEdit = !id || a?._canEdit;
  const set = (k, clean) => (e) => { const v = clean ? clean(e.target.value) : e.target.value; setF((p) => ({ ...p, [k]: v })); setErr((p) => ({ ...p, [k]: undefined })); };
  const tel = (v) => v.replace(/[^\d+\s]/g, '').slice(0, 18);

  const save = async (e) => {
    e.preventDefault();
    const x = {};
    if (!f.agentName.trim()) x.agentName = 'Required';
    if (!isAnyPhone(normalizePhone(f.phone))) x.phone = 'Enter valid mobile (10 digit, or with country code)';
    if (f.whatsapp && !isAnyPhone(normalizePhone(f.whatsapp))) x.whatsapp = 'Not valid';
    if (f.email && !isEmail(f.email)) x.email = 'Not valid';
    setErr(x);
    if (Object.keys(x).length) return notify('Please correct the fields marked in red', 'error');
    const body = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, f[k]]));
    if (a) body.active = f.active;
    setSaving(true);
    try {
      const r = id ? await api(`/agents/${id}`, { method: 'PATCH', body }) : await api('/agents', { method: 'POST', body });
      notify(id ? 'Agent updated' : `Agent lead saved — ${r.agentId} (sent to B2B)`);
      onSaved();
      if (id) { setA(r); } else onClose();
    } catch (e2) { notify(e2.message, 'error'); } finally { setSaving(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return notify('Write the discussion note', 'error');
    try {
      const r = await api(`/agents/${id}/notes`, { method: 'POST', body: { note, ...(nextDate ? { followUpDate: nextDate } : {}) } });
      setA(r); setF((p) => ({ ...p, followUpDate: toInputDate(r.followUpDate) })); setNote(''); setNextDate(''); notify('Note saved'); onSaved();
    } catch (e) { notify(e.message, 'error'); }
  };

  const del = async () => {
    if (!window.confirm(`Delete agent ${a.agentName} (${a.agentId}) permanently?`)) return;
    try { await api(`/agents/${id}`, { method: 'DELETE' }); notify('Agent deleted'); onSaved(); onClose(); } catch (e) { notify(e.message, 'error'); }
  };

  if (id && !a) return <Modal title="Loading…" onClose={onClose}><Empty>Loading…</Empty></Modal>;

  return (
    <Modal wide title={a ? `${a.agentId} — ${a.agentName}` : 'New B2B Agent Lead'} onClose={onClose}>
      <form onSubmit={save} noValidate className="space-y-4">
        {a && <p className="text-xs text-slate-500">Entered by <b>{a.createdByName}</b> on {fmtDate(a.createdAt)} · Assigned to <b>{a.assignedTo?.name || 'B2B Counsellor (no B2B login yet)'}</b></p>}
        <fieldset disabled={!canEdit} className="space-y-4 min-w-0">
          <Grid>
            <Field label="Agent Name" required error={err.agentName}><Input value={f.agentName} onChange={set('agentName')} /></Field>
            <Field label="Company Name"><Input value={f.companyName} onChange={set('companyName')} /></Field>
            <Field label="Contact Person"><Input value={f.contactPerson} onChange={set('contactPerson')} /></Field>
            <Field label="Mobile Number" required error={err.phone} hint="Foreign number: with country code, e.g. 971501234567"><Input type="tel" inputMode="tel" value={f.phone} onChange={set('phone', tel)} /></Field>
            <Field label="WhatsApp Number" error={err.whatsapp}><Input type="tel" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp', tel)} /></Field>
            <Field label="Email" error={err.email}><Input type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Country"><Input value={f.country} onChange={set('country')} /></Field>
            <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
            <Field label="Agent Type"><Select options={AGENT_TYPES} value={f.agentType} onChange={set('agentType')} /></Field>
            <Field label="Address" className="sm:col-span-2 lg:col-span-3"><Input value={f.address} onChange={set('address')} /></Field>
            <Field label="Available Manpower" hint="e.g. 50 welders, 20 drivers"><Input value={f.manpower} onChange={set('manpower')} /></Field>
            <Field label="Interested Job Categories"><Input value={f.jobCategories} onChange={set('jobCategories')} /></Field>
            <Field label="Expected Rate"><Input value={f.expectedRate} onChange={set('expectedRate')} placeholder="e.g. ₹40,000 per candidate" /></Field>
            <Field label="Follow-up Date"><Input type="date" value={f.followUpDate} onChange={set('followUpDate')} /></Field>
            <Field label="Lead Status"><Select options={AGENT_STATUS} value={f.status} onChange={set('status')} placeholder="— Status —" /></Field>
            {a && <label className="flex items-center gap-2 text-sm mt-5"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))} /> Active agent</label>}
            <Field label="Telecaller Notes" className="sm:col-span-2 lg:col-span-3"><TextArea value={f.notes} onChange={set('notes')} placeholder="What did the agent say? Rate, manpower, countries…" /></Field>
          </Grid>
        </fieldset>
        <div className="flex justify-between items-center">
          {user.role === 'super_admin' && a ? <button type="button" onClick={del} className="text-xs text-rose-700 underline">Delete agent</button> : <span />}
          {canEdit ? <Btn type="submit" disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : id ? 'Save Changes' : 'Save Agent Lead'}</Btn>
            : <span className="text-xs text-slate-500">View only</span>}
        </div>
      </form>

      {a && (
        <div className="mt-5">
          <Section title={`Communication History (${a.history?.length || 0})`}>
            {canEdit && (
              <div className="grid sm:grid-cols-4 gap-2 mb-4 items-end">
                <Field label="Discussion / Call note" className="sm:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Shared Mauritius accountant demand, rate quoted ₹35,000" /></Field>
                <Field label="Next follow-up"><Input type="date" min={toInputDate(new Date())} value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></Field>
                <Btn type="button" onClick={addNote}>Add Note</Btn>
              </div>
            )}
            <ol className="space-y-2">
              {[...(a.history || [])].reverse().map((h) => (
                <li key={h._id} className={`border-l-4 pl-3 ${h.system ? 'border-slate-300' : 'border-blue-700'}`}>
                  <div className="text-[11px] text-slate-500">{fmtDateTime(h.at)} · {h.byName}</div>
                  <div className={`text-sm ${h.system ? 'text-slate-500' : ''}`}>{h.note}</div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      )}
    </Modal>
  );
}
