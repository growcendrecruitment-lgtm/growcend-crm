import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, PhoneCall, MessageCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { api } from './api';
import { Section, Field, Select, TextArea, Input, Btn, StatusBadge, Empty, fmtDate, fmtDateTime, inr, go, useApp, toInputDate } from './ui';
import CandidateForm from './CandidateForm';
import Documents from './Documents';
import Payments from './Payments';
import { STATUSES, CALL_OUTCOMES, REQUIRED_DOCS } from './constants.js';

const TABS = [
  ['profile', 'Profile'], ['process', 'Visa / Job Process'], ['followups', 'Follow-ups & History'],
  ['documents', 'Documents'], ['payments', 'Payments & Bills']
];

export default function CandidateDetail({ id, tab = 'profile' }) {
  const { user, notify, startCall } = useApp();
  const [lead, setLead] = useState(null);
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [l, d] = await Promise.all([api(`/leads/${id}`), api(`/leads/${id}/documents`)]);
      setLead(l); setDocs(d);
    } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <Empty>{error}</Empty>;
  if (!lead) return <Empty>Loading…</Empty>;

  const due = (lead.packageAmount || 0) - (lead.paidAmount || 0);
  const alerts = [];
  if (!lead.address?.pincode) alerts.push('Pincode missing — please update address');
  if (lead.passport?.expiryDate && new Date(lead.passport.expiryDate) < new Date(Date.now() + 180 * 86400000))
    alerts.push(`Passport expires on ${fmtDate(lead.passport.expiryDate)} (less than 6 months)`);
  const haveTypes = new Set(docs.map((d) => d.type));
  const missing = REQUIRED_DOCS.filter((t) => !haveTypes.has(t));
  if (missing.length) alerts.push(`Documents pending: ${missing.join(', ')}`);

  const del = async () => {
    if (!window.confirm(`Delete ${lead.name} (${lead.leadId}) permanently? All documents will also be deleted.`)) return;
    try { await api(`/leads/${lead._id}`, { method: 'DELETE' }); notify('Candidate deleted'); go('/candidates'); }
    catch (e) { notify(e.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => window.history.back()} className="text-xs text-blue-900 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>

      <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900">{lead.name}</h2>
            <span className="font-mono text-xs bg-blue-50 text-blue-900 px-2 py-0.5 rounded">{lead.leadId}</span>
            <StatusBadge status={lead.status} />
          </div>
          <p className="text-sm text-slate-600 mt-1">
            📞 {lead.phone} {lead.address?.city && <>· 📍 {lead.address.city}{lead.address.pincode && ` – ${lead.address.pincode}`}</>}
            {lead.passport?.number && <> · 🛂 {lead.passport.number}</>}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{lead.serviceType}{lead.country && ` → ${lead.country}`}{lead.job && ` · ${lead.job}`}
            {lead.assignedTo?.name && ` · Counsellor: ${lead.assignedTo.name}`}</p>
        </div>
        <div className="flex items-start gap-4">
          <div className="text-right text-xs">
            <div className="text-slate-500">Package <b className="text-slate-800">{inr(lead.packageAmount)}</b></div>
            <div className="text-slate-500">Paid <b className="text-emerald-700">{inr(lead.paidAmount)}</b></div>
            <div className="text-slate-500">Due <b className={due > 0 ? 'text-rose-700' : 'text-slate-800'}>{inr(Math.max(0, due))}</b></div>
          </div>
          <div className="flex flex-col gap-1">
            <a href={`tel:+91${lead.phone}`} onClick={() => startCall(lead.phone)} className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><PhoneCall className="w-3.5 h-3.5" /> Call</a>
            <a href={`https://wa.me/91${lead.whatsapp || lead.phone}`} target="_blank" rel="noreferrer" className="bg-green-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
            {user.role === 'super_admin' && <button onClick={del} className="text-rose-600 text-xs flex items-center gap-1 px-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 space-y-1">
          {alerts.map((a) => <div key={a} className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {a}</div>)}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => go(`/candidate/${id}/${k}`)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${tab === k ? 'border-blue-900 text-blue-900 font-semibold' : 'border-transparent text-slate-500'}`}>
            {label}{k === 'documents' && ` (${docs.length})`}
          </button>
        ))}
      </div>

      {tab === 'profile' && <CandidateForm key={`p-${lead.updatedAt}`} mode="edit" group="profile" initial={lead} onSaved={setLead} />}
      {tab === 'process' && <CandidateForm key={`v-${lead.updatedAt}`} mode="edit" group="process" initial={lead} onSaved={setLead} />}
      {tab === 'followups' && <Followups lead={lead} onSaved={setLead} />}
      {tab === 'documents' && <Documents lead={lead} docs={docs} reload={load} />}
      {tab === 'payments' && <Payments lead={lead} reload={load} />}
    </div>
  );
}

function Followups({ lead, onSaved }) {
  const { notify } = useApp();
  const [f, setF] = useState({ outcome: '', note: '', nextDate: '', status: lead.status });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.note && !f.outcome) return notify('Choose call outcome or write a note', 'error');
    setSaving(true);
    try { onSaved(await api(`/leads/${lead._id}/followups`, { method: 'POST', body: f })); setF({ outcome: '', note: '', nextDate: '', status: f.status }); notify('Follow-up saved'); }
    catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const list = [...(lead.followups || [])].reverse();
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Section title="Add Call / Follow-up">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Call Outcome"><Select options={CALL_OUTCOMES} value={f.outcome} onChange={set('outcome')} /></Field>
          <Field label="Note / Discussion"><TextArea value={f.note} onChange={set('note')} placeholder="What did candidate say?" /></Field>
          <Field label="Next Follow-up Date" hint="Leave empty if no follow-up needed"><Input type="date" min={toInputDate(new Date())} value={f.nextDate} onChange={set('nextDate')} /></Field>
          <Field label="Update Status"><Select options={STATUSES} value={f.status} onChange={set('status')} /></Field>
          <Btn type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save Follow-up'}</Btn>
        </form>
      </Section>
      <div className="lg:col-span-2">
        <Section title={`History (${list.length})`}>
          {list.length === 0 && <Empty>No history yet</Empty>}
          <ol className="space-y-3">
            {list.map((x) => (
              <li key={x._id} className={`border-l-4 pl-3 ${x.system ? 'border-slate-300' : 'border-blue-700'}`}>
                <div className="text-[11px] text-slate-500">{fmtDateTime(x.at)} · {x.byName}</div>
                {x.outcome && <div className="text-xs font-semibold text-blue-900">{x.outcome}</div>}
                {x.note && <div className={`text-sm ${x.system ? 'text-slate-500' : 'text-slate-800'}`}>{x.note}</div>}
                {x.nextDate && <div className="text-xs text-amber-700">Next follow-up: {fmtDate(x.nextDate)}</div>}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
