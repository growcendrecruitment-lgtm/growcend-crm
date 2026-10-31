import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, RefreshCw, Download, Upload, FileText, Save, ArrowLeft, Send, Trash2 } from 'lucide-react';
import { api, apiBlob, downloadFile } from './api';
import { Section, Field, Input, Select, TextArea, Btn, Grid, Empty, fmtDate, fmtDateTime, inr, go, useApp, toInputDate } from './ui';
import {
  DEMAND_MANAGE, DEMAND_ASSIGNABLE, DEMAND_SOURCES, DEMAND_STATUS, DEMAND_FILE_TYPES, INTERVIEW_STATUS, SELECTION_STATUS,
  COMMISSION_KEYS, commissionValue, commissionTotal, ROLE_INFO
} from './constants.js';

const STATUS_CLS = { Open: 'bg-emerald-100 text-emerald-800', 'On Hold': 'bg-amber-100 text-amber-800', Closed: 'bg-slate-200 text-slate-600', Completed: 'bg-blue-100 text-blue-800' };
const SEL_CLS = { Selected: 'text-emerald-700 font-semibold', Rejected: 'text-rose-700', Withdrawn: 'text-slate-400 line-through', Shortlisted: 'text-blue-800' };
const Badge = ({ s }) => <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLS[s] || 'bg-slate-100'}`}>{s}</span>;

// ================= List =================
export default function Demands() {
  const { user, notify } = useApp();
  const manager = DEMAND_MANAGE.includes(user.role);
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Open');
  useEffect(() => { const t = setTimeout(() => setQ(search), 400); return () => clearTimeout(t); }, [search]);
  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    api(`/demands?${p}`).then(setItems).catch((e) => notify(e.message, 'error'));
  }, [q, status, notify]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h2 className="text-xl font-bold">{manager ? 'Job Demands' : 'My Assigned Demands'}</h2>
          <p className="text-xs text-slate-500">{manager ? 'Create demand → assign to Counsellors / Bittu → track submissions & selections.' : 'Only demands HR assigned to you. Open a demand → Submit your candidates.'}</p>
        </div>
        {manager && <Btn onClick={() => go('/demand/new')}><Plus className="w-4 h-4" /> New Demand</Btn>}
      </div>
      <div className="bg-white border rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1 border rounded-md px-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search DM-ID / country / job / employer" className="flex-1 text-sm p-1.5 focus:outline-none" />
        </div>
        <Select options={DEMAND_STATUS} placeholder="All Status" value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto" />
        <span className="text-xs text-slate-500">{items?.length ?? '…'} demands</span>
        <button onClick={load} className="p-1 text-slate-500"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {items && items.length === 0 && <Empty>{manager ? 'No demands yet — click “New Demand”.' : 'No demand assigned to you yet.'}</Empty>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {items?.map((d) => (
          <button key={d._id} onClick={() => go(`/demand/${d._id}`)} className="bg-white border rounded-xl p-4 text-left hover:border-blue-400 shadow-sm space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="font-mono text-[11px] text-blue-900">{d.demandId}</p>
                <h3 className="font-bold text-slate-900">{d.country} — {d.jobTitle}</h3>
                <p className="text-xs text-slate-500">{d.employerName || '—'}{d.salary && ` · ${d.salary}`}</p>
              </div>
              <Badge s={d.status} />
            </div>
            <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
              {[['Vacancy', d.vacancies], [manager ? 'Submitted' : 'My Subm.', d.counts.submitted], ['Selected', d.counts.selected], ['Remaining', d.counts.remaining]].map(([k, v]) => (
                <div key={k} className="bg-slate-50 rounded p-1"><div className="text-slate-500">{k}</div><div className="font-bold text-sm">{v}</div></div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              {d.closingDate && <>Closing {fmtDate(d.closingDate)} · </>}
              {manager ? `Assigned: ${d.assignments?.map((a) => a.userName).join(', ') || 'nobody yet'}`
                : d.myAssignment && `My rate: ${d.myAssignment.rate || '—'} · Target: ${d.myAssignment.target || '—'}`}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= Create / Edit form =================
const EMPTY = {
  country: '', jobTitle: '', vacancies: '', employerName: '', source: 'Direct Employer', status: 'Open', receivedDate: toInputDate(new Date()), closingDate: '',
  recruitmentCompany: '', agentName: '', contactPerson: '', employerEmail: '', employerWhatsapp: '',
  salary: '', accommodation: '', food: '', workingHours: '', overtime: '', experience: '', ageRequirement: '', qualification: '', contractDuration: '', requiredDocuments: '',
  rateFromEmployer: '', rateAgreed: '', paymentConditions: '', expectedRevenue: '', additionalCosts: '', notes: '',
  commission: Object.fromEntries(COMMISSION_KEYS.map(([k]) => [k, { type: 'fixed', value: '' }]))
};

export function DemandForm({ initial, onSaved }) {
  const { notify } = useApp();
  const [f, setF] = useState(() => {
    if (!initial) return EMPTY;
    const v = { ...EMPTY, ...initial, receivedDate: toInputDate(initial.receivedDate), closingDate: toInputDate(initial.closingDate) };
    v.commission = Object.fromEntries(COMMISSION_KEYS.map(([k]) => [k, { type: initial.commission?.[k]?.type || 'fixed', value: initial.commission?.[k]?.value ?? '' }]));
    return v;
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setC = (k, part) => (e) => setF((p) => ({ ...p, commission: { ...p.commission, [k]: { ...p.commission[k], [part]: e.target.value } } }));
  const total = commissionTotal(f.commission, f.rateAgreed);
  const profit = (Number(f.expectedRevenue) || 0) - (Number(f.additionalCosts) || 0) - total * (Number(f.vacancies) || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.country.trim() || !f.jobTitle.trim()) return notify('Country and Job Designation are required', 'error');
    const body = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, f[k]]));
    setSaving(true);
    try {
      const d = initial ? await api(`/demands/${initial._id}`, { method: 'PATCH', body }) : await api('/demands', { method: 'POST', body });
      notify(initial ? 'Demand updated' : `Demand ${d.demandId} created — now assign it to counsellors`);
      onSaved(d);
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const I = (k, label, props = {}) => <Field label={label} required={props.req}><Input value={f[k]} onChange={set(k)} {...props} /></Field>;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Section title="1. Demand">
        <Grid>
          {I('country', 'Country', { req: true, placeholder: 'e.g. Mauritius' })}
          {I('jobTitle', 'Job Designation', { req: true, placeholder: 'e.g. Accountant' })}
          {I('vacancies', 'Total Vacancies', { type: 'number', min: 0 })}
          {I('employerName', 'Employer Name')}
          <Field label="Source of Demand"><Select options={DEMAND_SOURCES} value={f.source} onChange={set('source')} /></Field>
          <Field label="Status"><Select options={DEMAND_STATUS} value={f.status} onChange={set('status')} /></Field>
          {I('receivedDate', 'Demand Received Date', { type: 'date' })}
          {I('closingDate', 'Demand Closing Date', { type: 'date' })}
        </Grid>
      </Section>
      <Section title="2. Employer / Agency Contact (HR only)">
        <Grid>
          {I('recruitmentCompany', 'Foreign Recruitment Company')}
          {I('agentName', 'Agent Name')}
          {I('contactPerson', 'Contact Person')}
          {I('employerEmail', 'Employer Email', { type: 'email' })}
          {I('employerWhatsapp', 'Employer WhatsApp', { type: 'tel', placeholder: 'with country code' })}
        </Grid>
      </Section>
      <Section title="3. Job Details (counsellors see this)">
        <Grid>
          {I('salary', 'Salary', { placeholder: 'e.g. MUR 25,000 / month' })}
          {I('accommodation', 'Accommodation', { placeholder: 'Free / Provided / Not provided' })}
          {I('food', 'Food')}
          {I('workingHours', 'Working Hours', { placeholder: 'e.g. 8 hrs, 6 days' })}
          {I('overtime', 'Overtime')}
          {I('experience', 'Experience Required')}
          {I('ageRequirement', 'Age Requirement', { placeholder: 'e.g. 21–40' })}
          {I('qualification', 'Qualification')}
          {I('contractDuration', 'Contract Duration', { placeholder: 'e.g. 2 years' })}
          <Field label="Required Documents" className="sm:col-span-2 lg:col-span-3"><TextArea value={f.requiredDocuments} onChange={set('requiredDocuments')} placeholder="Passport, CV, experience certificate…" /></Field>
        </Grid>
      </Section>
      <Section title="4. Rate & Payment (HR / Director only)">
        <Grid>
          {I('rateFromEmployer', 'Rate Received From Employer (₹ per candidate)', { type: 'number', min: 0 })}
          {I('rateAgreed', 'Rate Agreed With Employer (₹ per candidate)', { type: 'number', min: 0 })}
          {I('expectedRevenue', 'Total Expected Revenue (₹)', { type: 'number', min: 0 })}
          {I('additionalCosts', 'Additional Costs (₹)', { type: 'number', min: 0 })}
          <Field label="Payment Conditions / Milestones / Expected Dates" className="sm:col-span-2"><TextArea rows={2} value={f.paymentConditions} onChange={set('paymentConditions')} /></Field>
        </Grid>
      </Section>
      <Section title="5. Commission per selected candidate (HR / Director only)">
        <div className="space-y-2">
          {COMMISSION_KEYS.map(([k, label]) => (
            <div key={k} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-12 sm:col-span-4 text-sm">{label}</span>
              <select value={f.commission[k].type} onChange={setC(k, 'type')} className="col-span-5 sm:col-span-3 border rounded-md p-2 text-sm">
                <option value="fixed">Fixed ₹</option><option value="percent">% of agreed rate</option>
              </select>
              <Input className="col-span-4 sm:col-span-3" type="number" min="0" value={f.commission[k].value} onChange={setC(k, 'value')} />
              <span className="col-span-3 sm:col-span-2 text-xs text-right text-slate-600">{inr(commissionValue(f.commission[k], f.rateAgreed))}</span>
            </div>
          ))}
          <div className="flex flex-wrap justify-end gap-6 border-t pt-2 text-sm">
            <span>Total Commission / candidate: <b>{inr(total)}</b></span>
            <span>Expected Profit: <b className={profit < 0 ? 'text-rose-700' : 'text-emerald-700'}>{inr(profit)}</b></span>
          </div>
          <p className="text-[11px] text-slate-400">Expected Profit = Expected Revenue − Additional Costs − (Total Commission × Vacancies)</p>
        </div>
      </Section>
      <Section title="Notes"><TextArea value={f.notes} onChange={set('notes')} /></Section>
      <div className="sticky bottom-0 bg-slate-100/95 py-3 flex justify-end gap-2 border-t">
        <Btn type="button" variant="light" onClick={() => window.history.back()}>Cancel</Btn>
        <Btn type="submit" disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Demand'}</Btn>
      </div>
    </form>
  );
}

export function NewDemand() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">New Job Demand</h2>
      <DemandForm onSaved={(d) => go(`/demand/${d._id}/assign`)} />
    </div>
  );
}

// ================= Detail =================
export function DemandDetail({ id, tab = 'overview' }) {
  const { user, notify } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api(`/demands/${id}`).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (err) return <Empty>{err}</Empty>;
  if (!d) return <Empty>Loading…</Empty>;
  const manager = !!d._manage;
  const tabs = [['overview', 'Overview'], ['submissions', `Candidates (${d.counts.submitted})`], ...(manager ? [['assign', `Assign (${d.assignments.length})`], ['edit', 'Edit'], ['history', 'History']] : [])];
  const c = d.counts;

  return (
    <div className="space-y-4">
      <button onClick={() => go('/demands')} className="text-xs text-blue-900 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> All demands</button>
      <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <div className="flex items-center gap-2"><span className="font-mono text-xs bg-blue-50 text-blue-900 px-2 py-0.5 rounded">{d.demandId}</span><Badge s={d.status} /></div>
            <h2 className="text-xl font-bold mt-1">{d.country} — {d.jobTitle}</h2>
            <p className="text-sm text-slate-600">{d.employerName}{d.source && ` · Source: ${d.source}`}{d.closingDate && ` · Closing ${fmtDate(d.closingDate)}`}</p>
          </div>
          {!manager && d.myAssignment && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
              <div>My approved rate: <b>{d.myAssignment.rate || '—'}</b></div>
              <div>My target: <b>{d.myAssignment.target || '—'}</b> · My commission: <b>{inr(d.myAssignment.commission)}</b></div>
              {d.myAssignment.note && <div className="text-slate-500">{d.myAssignment.note}</div>}
            </div>
          )}
          {manager && <div className="text-xs text-right"><div>Agreed rate: <b>{inr(d.rateAgreed)}</b> / candidate</div><div>Commission: <b>{inr(d.commissionTotal)}</b> · Expected profit: <b>{inr(d.expectedProfit)}</b></div></div>}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2 text-center">
          {[['Vacancies', d.vacancies], ['Submitted', c.submitted], ['Passports', c.passports], ['Interviews', c.interviews], ['Shortlisted', c.shortlisted],
            ['Selected', c.selected], ['Rejected', c.rejected], ['Pending', c.pending], ['CV Emailed', c.sentToEmployer], ['Remaining', c.remaining]].map(([k, v]) => (
            <div key={k} className="bg-slate-50 rounded-lg p-2"><div className="text-[10px] text-slate-500">{k}</div><div className="text-lg font-black text-blue-900">{v}</div></div>
          ))}
        </div>
        {!manager && <p className="text-[11px] text-slate-400">Numbers show YOUR submissions only.</p>}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => go(`/demand/${id}/${k}`)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${tab === k ? 'border-blue-900 text-blue-900 font-semibold' : 'border-transparent text-slate-500'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview d={d} reload={load} />}
      {tab === 'submissions' && <Submissions d={d} reload={load} />}
      {tab === 'assign' && manager && <Assign d={d} onSaved={load} />}
      {tab === 'edit' && manager && <DemandForm key={d.updatedAt} initial={d} onSaved={(x) => { load(); go(`/demand/${x._id}`); }} />}
      {tab === 'history' && manager && (
        <Section title="History">
          <ol className="space-y-2">{[...(d.history || [])].reverse().map((h) => (
            <li key={h._id} className="border-l-4 border-slate-300 pl-3"><div className="text-[11px] text-slate-500">{fmtDateTime(h.at)} · {h.byName}</div><div className="text-sm">{h.note}</div></li>
          ))}</ol>
        </Section>
      )}
      {user.role === 'super_admin' && tab === 'edit' && <DeleteDemand d={d} />}
    </div>
  );
}

function DeleteDemand({ d }) {
  const { notify } = useApp();
  const del = async () => {
    if (!window.confirm(`Delete demand ${d.demandId}? (only possible if no candidate is submitted)`)) return;
    try { await api(`/demands/${d._id}`, { method: 'DELETE' }); notify('Demand deleted'); go('/demands'); } catch (e) { notify(e.message, 'error'); }
  };
  return <div className="text-right"><button onClick={del} className="text-xs text-rose-700 underline">Delete demand (Director)</button></div>;
}

function FileThumb({ d, f, canDelete, reload }) {
  const { notify } = useApp();
  const [url, setUrl] = useState('');
  const isImg = f.contentType.startsWith('image/');
  useEffect(() => {
    let u = '';
    if (isImg) apiBlob(`/demands/${d._id}/files/${f._id}`).then((b) => { u = URL.createObjectURL(b); setUrl(u); }).catch(() => {});
    return () => u && URL.revokeObjectURL(u);
  }, [d._id, f._id, isImg]);
  const open = async () => {
    try { const b = await apiBlob(`/demands/${d._id}/files/${f._id}`); window.open(URL.createObjectURL(b), '_blank'); } catch (e) { notify(e.message, 'error'); }
  };
  const del = async () => {
    if (!window.confirm(`Delete ${f.type}?`)) return;
    try { await api(`/demands/${d._id}/files/${f._id}`, { method: 'DELETE' }); reload(); } catch (e) { notify(e.message, 'error'); }
  };
  return (
    <div className="border rounded-lg p-2 space-y-1">
      <p className="text-xs font-semibold">{f.type}</p>
      {isImg ? (url ? <img src={url} alt={f.type} onClick={open} className="w-full max-h-96 object-contain cursor-zoom-in bg-slate-50" /> : <div className="h-40 bg-slate-50 rounded animate-pulse" />)
        : <button onClick={open} className="w-full h-24 bg-slate-50 rounded flex items-center justify-center gap-2 text-sm text-blue-900"><FileText className="w-5 h-5" /> Open PDF</button>}
      <div className="flex justify-between text-[11px] text-slate-400"><span>{f.filename}</span>{canDelete && <button onClick={del} className="text-rose-600">delete</button>}</div>
    </div>
  );
}

function Overview({ d, reload }) {
  const { user, notify } = useApp();
  const manager = !!d._manage;
  const [type, setType] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = [['Salary', d.salary], ['Accommodation', d.accommodation], ['Food', d.food], ['Working Hours', d.workingHours], ['Overtime', d.overtime],
    ['Experience', d.experience], ['Age', d.ageRequirement], ['Qualification', d.qualification], ['Contract', d.contractDuration], ['Required Documents', d.requiredDocuments],
    ['Received', fmtDate(d.receivedDate)], ['Closing', fmtDate(d.closingDate)],
    ...(manager ? [['Recruitment Company', d.recruitmentCompany], ['Agent', d.agentName], ['Contact Person', d.contactPerson], ['Employer Email', d.employerEmail],
      ['Employer WhatsApp', d.employerWhatsapp], ['Rate from Employer', inr(d.rateFromEmployer)], ['Rate Agreed', inr(d.rateAgreed)], ['Payment Conditions', d.paymentConditions],
      ['Expected Revenue', inr(d.expectedRevenue)], ['Additional Costs', inr(d.additionalCosts)]] : []), ['Notes', d.notes]];

  const upload = async (e) => {
    e.preventDefault();
    if (!type || !file) return notify('Choose file type and file', 'error');
    if (file.size > 6 * 1024 * 1024) return notify('File larger than 6 MB', 'error');
    setBusy(true);
    try {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      await api(`/demands/${d._id}/files`, { method: 'POST', body: { type, filename: file.name, contentType: file.type, data } });
      notify(`${type} uploaded`); setType(''); setFile(null); e.target.reset(); reload();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };

  const names = d.submissions.filter((s) => s.selectionStatus !== 'Withdrawn');
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Section title="Poster / Demand Files">
          {d.files.length === 0 ? <Empty>No poster uploaded{manager ? ' — upload below' : ''}</Empty> : (
            <div className="grid sm:grid-cols-2 gap-3">{d.files.map((f) => <FileThumb key={f._id} d={d} f={f} canDelete={user.role === 'super_admin'} reload={reload} />)}</div>
          )}
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-semibold text-slate-600 mb-1">Candidates submitted on this vacancy{!manager && ' (yours)'}: {names.length}</p>
            {names.length === 0 ? <p className="text-xs text-slate-400">None yet</p> : (
              <div className="flex flex-wrap gap-1">{names.map((s) => <span key={s._id} className={`text-xs bg-slate-100 rounded-full px-2 py-0.5 ${SEL_CLS[s.selectionStatus] || ''}`}>{s.candidateName}{s.selectionStatus !== 'Pending' && ` · ${s.selectionStatus}`}</span>)}</div>
            )}
          </div>
          {manager && (
            <form onSubmit={upload} className="mt-3 border-t pt-3 grid sm:grid-cols-3 gap-2 items-end">
              <Field label="File type"><Select options={DEMAND_FILE_TYPES} value={type} onChange={(e) => setType(e.target.value)} /></Field>
              <Field label="Image or PDF (max 6 MB)"><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} className="text-xs" /></Field>
              <Btn type="submit" disabled={busy}><Upload className="w-4 h-4" /> {busy ? 'Uploading…' : 'Upload'}</Btn>
            </form>
          )}
        </Section>
      </div>
      <Section title="Job Details">
        <dl className="text-sm space-y-1.5">{rows.filter(([, v]) => v && v !== '—' && v !== '₹0').map(([k, v]) => (
          <div key={k} className="grid grid-cols-5 gap-2"><dt className="col-span-2 text-xs text-slate-500">{k}</dt><dd className="col-span-3 whitespace-pre-line">{v}</dd></div>
        ))}</dl>
      </Section>
    </div>
  );
}

function Submissions({ d, reload }) {
  const { user, notify } = useApp();
  const manager = !!d._manage;
  const closed = ['Closed', 'Completed'].includes(d.status);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [agentName, setAgentName] = useState('');
  const submitted = useMemo(() => new Set(d.submissions.map((s) => String(s.lead?._id || s.lead))), [d.submissions]);

  useEffect(() => {
    if (closed) return undefined;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limit: 10 });
      if (q.trim()) p.set('q', q.trim());
      api(`/leads?${p}`).then((r) => setFound(r.items)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q, closed]);

  const submit = async (l) => {
    try {
      await api(`/demands/${d._id}/submissions`, { method: 'POST', body: { leadId: l._id, agentName } });
      notify(`${l.name} submitted on ${d.demandId}`); reload();
    } catch (e) { notify(e.message, 'error'); }
  };
  const patch = async (s, body, msg) => {
    try { await api(`/submissions/${s._id}`, { method: 'PATCH', body }); if (msg) notify(msg); reload(); } catch (e) { notify(e.message, 'error'); }
  };
  const remark = (s) => { const r = window.prompt('Remarks', s.remarks || ''); if (r !== null) patch(s, { remarks: r }, 'Remarks saved'); };
  const sent = (s) => {
    if (s.sentToEmployer) return patch(s, { sentToEmployer: false });
    const to = window.prompt('CV sent by email to (employer email):', d.employerEmail || '');
    if (to === null) return;
    const att = window.prompt('Attachments sent (e.g. CV, Photo, Passport copy):', 'CV, Photo, Passport copy');
    patch(s, { sentToEmployer: true, sentTo: to, sentAttachments: att || '', sentDate: toInputDate(new Date()) }, 'Marked as emailed to employer');
  };
  const del = async (s) => {
    if (!window.confirm(`Remove ${s.candidateName} from this demand permanently?`)) return;
    try { await api(`/submissions/${s._id}`, { method: 'DELETE' }); reload(); } catch (e) { notify(e.message, 'error'); }
  };
  const canSubmit = (l) => (manager ? true : l._canEdit);

  return (
    <div className="space-y-4">
      {closed ? <div className="text-xs bg-slate-100 border rounded p-3">This demand is {d.status} — no new submissions.</div> : (
        <Section title="Submit Candidate on this Demand">
          <div className="grid sm:grid-cols-3 gap-2 mb-2">
            <div className="flex items-center gap-1 border rounded-md px-2 sm:col-span-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search YOUR candidate: name / mobile / GC-ID" className="flex-1 text-sm p-2 focus:outline-none" />
            </div>
            {user.role === 'b2b' && <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="B2B Agent name (if agent's candidate)" />}
          </div>
          {found.length === 0 ? <p className="text-xs text-slate-400">No candidate found. Register the candidate first, then submit here.</p> : (
            <ul className="divide-y border rounded">
              {found.map((l) => {
                const already = submitted.has(String(l._id));
                return (
                  <li key={l._id} className="p-2 flex justify-between items-center gap-2 text-sm">
                    <span><b>{l.name}</b> <span className="text-xs text-slate-500">{l.leadId} · {l.phone}{l.job && ` · ${l.job}`}</span></span>
                    {already ? <span className="text-xs text-emerald-700">already submitted</span>
                      : canSubmit(l) ? <Btn variant="green" onClick={() => submit(l)}><Send className="w-3.5 h-3.5" /> Submit</Btn>
                        : <span className="text-xs text-slate-400">view only</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      <Section title={`Submitted Candidates (${d.submissions.length})`} right={
        <Btn variant="light" onClick={() => downloadFile(`/demands/${d._id}/export.csv`, `${d.demandId}-candidates.csv`).catch((e) => notify(e.message, 'error'))}><Download className="w-4 h-4" /> Excel</Btn>}>
        {d.submissions.length === 0 ? <Empty>No candidate submitted yet</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 text-left"><tr>
                <th className="p-2">Candidate</th><th className="p-2">Passport</th><th className="p-2">Submitted</th><th className="p-2">Interview</th>
                <th className="p-2">Selection</th><th className="p-2">CV Emailed?</th><th className="p-2">Remarks</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {d.submissions.map((s) => (
                  <tr key={s._id} className="border-t align-top">
                    <td className="p-2"><button className="font-semibold hover:underline text-left" onClick={() => go(`/candidate/${s.lead?._id || s.lead}`)}>{s.candidateName}</button>
                      <div className="text-[11px] text-slate-500">{s.leadId} · {s.phone}</div></td>
                    <td className="p-2 text-xs">{s.passportNo || <span className="text-rose-600">not received</span>}</td>
                    <td className="p-2 text-xs">{fmtDate(s.createdAt)}<div className="text-slate-500">{s.submittedByName}{s.agentName && ` · Agent: ${s.agentName}`}</div></td>
                    <td className="p-2 text-xs">
                      {manager ? <select value={s.interviewStatus} onChange={(e) => patch(s, { interviewStatus: e.target.value })} className="border rounded p-1 text-xs">{INTERVIEW_STATUS.map((x) => <option key={x}>{x}</option>)}</select> : s.interviewStatus}
                    </td>
                    <td className={`p-2 text-xs ${SEL_CLS[s.selectionStatus] || ''}`}>
                      {manager ? <select value={s.selectionStatus} onChange={(e) => patch(s, { selectionStatus: e.target.value }, e.target.value === 'Selected' ? `${s.candidateName} marked Selected` : null)} className="border rounded p-1 text-xs">{SELECTION_STATUS.map((x) => <option key={x}>{x}</option>)}</select>
                        : <>{s.selectionStatus}{s.selectionStatus === 'Pending' && <button className="block text-[11px] text-rose-600 underline" onClick={() => window.confirm('Withdraw this candidate?') && patch(s, { selectionStatus: 'Withdrawn' }, 'Withdrawn')}>withdraw</button>}</>}
                    </td>
                    <td className="p-2 text-xs">
                      {manager ? <label className="flex items-center gap-1"><input type="checkbox" checked={s.sentToEmployer} onChange={() => sent(s)} /> {s.sentToEmployer ? 'Yes' : 'No'}</label> : (s.sentToEmployer ? 'Yes' : 'No')}
                      {s.sentToEmployer && <div className="text-[11px] text-slate-500">{fmtDate(s.sentDate)}{s.sentTo && ` → ${s.sentTo}`}{s.sentAttachments && <div>{s.sentAttachments}</div>}</div>}
                    </td>
                    <td className="p-2 text-xs max-w-[180px]">{s.remarks}<button className="block text-[11px] text-blue-900 underline" onClick={() => remark(s)}>{s.remarks ? 'edit' : 'add'}</button></td>
                    <td className="p-2">{user.role === 'super_admin' && <button onClick={() => del(s)} title="Remove (Director)"><Trash2 className="w-3.5 h-3.5 text-rose-600" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Assign({ d, onSaved }) {
  const { notify } = useApp();
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState(() => Object.fromEntries(d.assignments.map((a) => [String(a.user), { on: true, rate: a.rate, target: a.target || '', commission: a.commission || '', note: a.note }])));
  const [saving, setSaving] = useState(false);
  useEffect(() => { api('/users/basic').then((u) => setStaff(u.filter((x) => DEMAND_ASSIGNABLE.includes(x.role)))).catch(() => {}); }, []);
  const row = (id) => rows[id] || { on: false, rate: '', target: '', commission: '', note: '' };
  const set = (id, k, v) => setRows((p) => ({ ...p, [id]: { ...row(id), [k]: v } }));
  const save = async () => {
    const assignments = Object.entries(rows).filter(([, r]) => r.on).map(([user, r]) => ({ user, rate: r.rate, target: r.target, commission: r.commission, note: r.note }));
    setSaving(true);
    try { await api(`/demands/${d._id}/assignments`, { method: 'PUT', body: { assignments } }); await onSaved(); notify('Assignment saved — demand now shows on their dashboard'); }
    catch (e) { notify(e.message, 'error'); } finally { setSaving(false); }
  };
  return (
    <Section title="Assign this demand (only ticked employees will see it)">
      {staff.length === 0 ? <Empty>No Counsellor / B2B login yet. Create them in Employee Logins.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 text-left"><tr><th className="p-2">Give demand</th><th className="p-2">Employee</th><th className="p-2">Approved Rate (for this employee)</th><th className="p-2">Candidate Target</th><th className="p-2">Commission (₹ / selection)</th><th className="p-2">Note</th></tr></thead>
            <tbody>
              {staff.map((u) => {
                const r = row(u.id);
                return (
                  <tr key={u.id} className={`border-t ${r.on ? 'bg-blue-50/50' : ''}`}>
                    <td className="p-2"><input type="checkbox" checked={r.on} onChange={(e) => set(u.id, 'on', e.target.checked)} className="w-4 h-4" /></td>
                    <td className="p-2"><b>{u.name}</b><div className="text-[11px] text-slate-500">{ROLE_INFO[u.role]?.label}</div></td>
                    <td className="p-2"><Input disabled={!r.on} value={r.rate} onChange={(e) => set(u.id, 'rate', e.target.value)} placeholder={u.role === 'b2b' ? 'B2B rate e.g. ₹30,000' : 'e.g. ₹1,50,000'} /></td>
                    <td className="p-2"><Input disabled={!r.on} type="number" min="0" value={r.target} onChange={(e) => set(u.id, 'target', e.target.value)} className="!w-24" /></td>
                    <td className="p-2"><Input disabled={!r.on} type="number" min="0" value={r.commission} onChange={(e) => set(u.id, 'commission', e.target.value)} className="!w-28" /></td>
                    <td className="p-2"><Input disabled={!r.on} value={r.note} onChange={(e) => set(u.id, 'note', e.target.value)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end mt-3"><Btn onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Assignment'}</Btn></div>
    </Section>
  );
}
