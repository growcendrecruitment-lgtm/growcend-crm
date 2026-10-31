import React, { useEffect, useState } from 'react';
import { Users, CalendarClock, IndianRupee, AlertTriangle, CheckCircle2, Plane, UserPlus, Wallet, Briefcase, Eye } from 'lucide-react';
import { api } from './api';
import { Section, Field, Input, Select, TextArea, Btn, Grid, inr, go, useApp, toInputDate } from './ui';
import CandidateList from './CandidateList';
import { SERVICE_TYPES, SOURCES, INDIAN_STATES, DEMAND_MANAGE, DEMAND_ASSIGNABLE, AGENT_CREATE, AGENT_MANAGE, COUNSELLOR_ROLES, SUPERVISED_ROLES, ROLE_INFO, normalizePhone, isPhone, isPincode } from './constants.js';

// ================= Dashboard =================
function StatCards({ s, money }) {
  const c = s?.counts || {};
  const cards = [
    ['Total Candidates', s?.total, Users, 'text-blue-900', '/candidates'],
    ['Follow-ups Due Today', s?.dueToday, CalendarClock, 'text-amber-700', '/followups'],
    ['New This Month', s?.newThisMonth, UserPlus, 'text-blue-900', '/candidates'],
    ['Visa Approved', c['Visa Approved'] || 0, CheckCircle2, 'text-emerald-700', '/candidates'],
    ['Deployed (Flew)', c.Deployed || 0, Plane, 'text-emerald-700', '/candidates'],
    ['Passport Expiring (<6 mo)', s?.passportSoon, AlertTriangle, 'text-rose-700', '/candidates']
  ];
  if (money) cards.push(
    ['Collected This Month', inr(s?.collectedThisMonth), IndianRupee, 'text-emerald-700', '/accounts'],
    ['Pending Dues', inr(s?.pendingDues), Wallet, 'text-rose-700', '/candidates']
  );
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(([label, val, Icon, color]) => (
          <div key={label} className="bg-white p-4 rounded-xl border shadow-sm">
            <div className="flex items-center justify-between"><p className="text-xs text-slate-500">{label}</p><Icon className={`w-4 h-4 ${color}`} /></div>
            <h3 className={`text-2xl font-black mt-1 ${color}`}>{val ?? '…'}</h3>
          </div>
        ))}
      </div>
      {s && Object.keys(c).length > 0 && (
        <Section title="Candidates by Status">
          <div className="flex flex-wrap gap-2">
            {Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <span key={k} className="text-xs bg-slate-100 rounded-full px-3 py-1">{k}: <b>{n}</b></span>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ================= Team Monitoring (Bittu / Director — VIEW ONLY) =================
export function TeamView() {
  const { user, notify } = useApp();
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState('');
  const [s, setS] = useState(null);
  const [agents, setAgents] = useState(null);
  useEffect(() => {
    api('/users/basic').then((us) => setUsers(us.filter((u) => (user.role === 'super_admin' ? u.role !== 'super_admin' : SUPERVISED_ROLES.includes(u.role)))))
      .catch((e) => notify(e.message, 'error'));
  }, [user.role, notify]);
  useEffect(() => {
    setS(null); setAgents(null);
    if (!sel) return;
    api(`/leads/stats?owner=${sel}`).then(setS).catch((e) => notify(e.message, 'error'));
    api(`/agents?createdBy=${sel}&limit=1`).then((d) => setAgents(d.total)).catch(() => {});
  }, [sel, notify]);
  const emp = users.find((u) => u.id === sel);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Eye className="w-5 h-5" /> Team Monitoring <span className="text-xs font-normal text-slate-500">(view only)</span></h2>
      <div className="bg-white border rounded-xl p-3 flex flex-wrap gap-3 items-end">
        <Field label="Choose employee" className="min-w-[260px]">
          <Select value={sel} onChange={(e) => setSel(e.target.value)} placeholder="— Select employee —"
            options={users.map((u) => ({ value: u.id, label: `${u.name} — ${ROLE_INFO[u.role]?.label || u.role}` }))} />
        </Field>
        {user.role === 'b2b' && <p className="text-xs text-slate-500">You can view all Telecallers & Counsellors. You cannot change their records.</p>}
      </div>
      {!sel ? <p className="text-sm text-slate-500">Select an employee to see their dashboard, follow-ups and candidates.</p> : (
        <>
          <StatCards s={s} money={false} />
          {emp?.role === 'telecaller' && <div className="bg-white border rounded-xl p-4 text-sm">B2B Agent leads entered: <b>{agents ?? '…'}</b> <button className="text-blue-900 underline text-xs ml-2" onClick={() => go('/agents')}>open register</button></div>}
          <CandidateList key={`f-${sel}`} title={`${emp?.name || ''} — Follow-ups due`} due="today" owner={sel} compact readOnly />
          <CandidateList key={`a-${sel}`} title={`${emp?.name || ''} — All candidates`} owner={sel} readOnly />
        </>
      )}
    </div>
  );
}

export function Dashboard() {
  const { user, notify } = useApp();
  const [s, setS] = useState(null);
  const [ag, setAg] = useState(null);
  useEffect(() => { api('/leads/stats').then(setS).catch((e) => notify(e.message, 'error')); }, [notify]);
  useEffect(() => { if (AGENT_CREATE.includes(user.role)) api('/agents/summary').then(setAg).catch(() => {}); }, [user.role]);
  const [store, setStore] = useState(null);
  const [dem, setDem] = useState(null);
  useEffect(() => {
    if ([...DEMAND_MANAGE, ...DEMAND_ASSIGNABLE].includes(user.role)) api('/demands?status=Open').then(setDem).catch(() => {});
  }, [user.role]);
  useEffect(() => { if (user.role === 'super_admin') api('/storage').then(setStore).catch(() => {}); }, [user.role]);
  const c = s?.counts || {};
  const cards = [
    ['Total Candidates', s?.total, Users, 'text-blue-900', '/candidates'],
    ['Follow-ups Due Today', s?.dueToday, CalendarClock, 'text-amber-700', '/followups'],
    ['New This Month', s?.newThisMonth, UserPlus, 'text-blue-900', '/candidates'],
    ['Visa Approved', c['Visa Approved'] || 0, CheckCircle2, 'text-emerald-700', '/candidates'],
    ['Deployed (Flew)', c.Deployed || 0, Plane, 'text-emerald-700', '/candidates'],
    ['Passport Expiring (<6 mo)', s?.passportSoon, AlertTriangle, 'text-rose-700', '/candidates']
  ];
  if (user.role === 'super_admin') cards.push(
    ['Collected This Month', inr(s?.collectedThisMonth), IndianRupee, 'text-emerald-700', '/accounts'],
    ['Total Pending Dues', inr(s?.pendingDues), Wallet, 'text-rose-700', '/candidates']
  );
  if (ag && AGENT_MANAGE.includes(user.role)) cards.push(['New B2B Agent Leads (unseen)', ag.unseen, Briefcase, 'text-rose-700', '/agents'], ['Total B2B Agents', ag.total, Briefcase, 'text-blue-900', '/agents']);
  else if (ag) cards.push(['My B2B Agent Leads', ag.total, Briefcase, 'text-blue-900', '/agents']);
  if (dem) {
    const manage = DEMAND_MANAGE.includes(user.role);
    cards.push([manage ? 'Open Job Demands' : 'My Open Demands', dem.length, Briefcase, 'text-indigo-700', '/demands']);
    cards.push([manage ? 'Selected (open demands)' : 'My Selected (open demands)', dem.reduce((s, d) => s + d.counts.selected, 0), CheckCircle2, 'text-emerald-700', '/demands']);
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Welcome, {user.name}</h2>
        <p className="text-xs text-slate-500">{ROLE_INFO[user.role]?.see}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(([label, val, Icon, color, link]) => (
          <button key={label} onClick={() => go(link)} className="bg-white p-4 rounded-xl border shadow-sm text-left hover:border-blue-400">
            <div className="flex items-center justify-between"><p className="text-xs text-slate-500">{label}</p><Icon className={`w-4 h-4 ${color}`} /></div>
            <h3 className={`text-2xl font-black mt-1 ${color}`}>{val ?? '…'}</h3>
          </button>
        ))}
      </div>
      {s && Object.keys(c).length > 0 && (
        <Section title="Candidates by Status">
          <div className="flex flex-wrap gap-2">
            {Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <span key={k} className="text-xs bg-slate-100 rounded-full px-3 py-1">{k}: <b>{n}</b></span>
            ))}
          </div>
        </Section>
      )}
      {store && <StorageBar s={store} />}
      <CandidateList title="Today's Follow-ups" due="today" compact />
    </div>
  );
}

function StorageBar({ s }) {
  const bar = (label, used) => {
    if (used == null) return null;
    const pct = Math.min(100, Math.round((used / s.limitMB) * 100));
    const color = pct > 85 ? 'bg-rose-600' : pct > 65 ? 'bg-amber-500' : 'bg-emerald-600';
    return (
      <div key={label}>
        <div className="flex justify-between text-xs mb-1"><span>{label}</span><span><b>{used} MB</b> / {s.limitMB} MB ({pct}%)</span></div>
        <div className="h-2 bg-slate-100 rounded"><div className={`h-2 rounded ${color}`} style={{ width: `${pct}%` }} /></div>
      </div>
    );
  };
  return (
    <Section title="Free Storage Used (Director only)">
      <div className="space-y-3">
        {bar(s.separateFilesDb ? 'Main database (candidates, bills)' : 'Database (candidates + documents)', s.mainMB)}
        {s.separateFilesDb && bar('Documents database', s.filesMB)}
        <p className="text-[11px] text-slate-500">{s.candidates} candidates · {s.documents} documents ({s.documentsMB} MB). Bar 85% se upar laal ho jaye to space badhane ka time hai.</p>
      </div>
    </Section>
  );
}

// ================= Telecalling quick registration =================
export function Telecalling() {
  const { notify } = useApp();
  const empty = { name: '', phone: '', pincode: '', city: '', state: '', serviceType: 'Overseas Job Placement', country: '', job: '', source: 'Telecalling', nextFollowUp: '', notes: '', assignedTo: '' };
  const [counsellors, setCounsellors] = useState([]);
  useEffect(() => { api('/users/basic').then((us) => setCounsellors(us.filter((u) => COUNSELLOR_ROLES.includes(u.role)))).catch(() => {}); }, []);
  const [f, setF] = useState(empty);
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const set = (k, clean) => (e) => { const v = clean ? clean(e.target.value) : e.target.value; setF((p) => ({ ...p, [k]: v })); setErr((p) => ({ ...p, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault(); setDup(null);
    const x = {};
    if (!f.name.trim()) x.name = 'Required';
    if (!isPhone(normalizePhone(f.phone))) x.phone = 'Enter valid 10-digit mobile';
    if (!isPincode(f.pincode)) x.pincode = '6 digit pincode required';
    setErr(x);
    if (Object.keys(x).length) return notify('Please correct the fields marked in red', 'error');
    setSaving(true);
    try {
      const lead = await api('/leads', { method: 'POST', body: {
        name: f.name, phone: f.phone, serviceType: f.serviceType, country: f.country, job: f.job, source: f.source,
        nextFollowUp: f.nextFollowUp, notes: f.notes, assignedTo: f.assignedTo, address: { pincode: f.pincode, city: f.city, state: f.state }
      } });
      notify(`Lead saved — ${lead.leadId} ${lead.name}`);
      setF(empty); setRefresh((r) => r + 1);
    } catch (e2) { if (e2.status === 409) setDup(e2.data); notify(e2.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Telecalling Station</h2>
      <Section title="Quick Lead Registration" right={<button className="text-xs text-blue-900 underline" onClick={() => go('/new')}>Full form →</button>}>
        <form onSubmit={submit} noValidate>
          {dup && <div className="mb-3 bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded p-2 flex justify-between items-center">{dup.message}{dup.existingId && <Btn type="button" variant="light" onClick={() => go(`/candidate/${dup.existingId}`)}>Open</Btn>}</div>}
          <Grid cols={4}>
            <Field label="Candidate Full Name" required error={err.name}><Input name="cand-name" autoComplete="off" value={f.name} onChange={set('name')} /></Field>
            <Field label="Mobile Number" required error={err.phone}><Input type="tel" inputMode="tel" name="cand-phone" autoComplete="off" placeholder="98XXXXXXXX" value={f.phone} onChange={set('phone', (v) => v.replace(/[^\d+\s]/g, '').slice(0, 14))} /></Field>
            <Field label="Pincode" required error={err.pincode}><Input inputMode="numeric" autoComplete="off" placeholder="6 digits" value={f.pincode} onChange={set('pincode', (v) => v.replace(/\D/g, '').slice(0, 6))} /></Field>
            <Field label="City / Village"><Input autoComplete="off" value={f.city} onChange={set('city')} /></Field>
            <Field label="State"><Select options={INDIAN_STATES} value={f.state} onChange={set('state')} /></Field>
            <Field label="Service Required"><Select options={SERVICE_TYPES} value={f.serviceType} onChange={set('serviceType')} /></Field>
            <Field label="Preferred Country"><Input value={f.country} onChange={set('country')} /></Field>
            <Field label="Job / Trade"><Input value={f.job} onChange={set('job')} /></Field>
            <Field label="Lead Source"><Select options={SOURCES} value={f.source} onChange={set('source')} /></Field>
            <Field label="Transfer to Counsellor" hint="optional"><Select options={counsellors.map((u) => ({ value: u.id, label: u.name + (u.role === 'b2b' ? ' (B2B)' : '') }))} placeholder="— Keep with me —" value={f.assignedTo} onChange={set('assignedTo')} /></Field>
            <Field label="Next Follow-up"><Input type="date" min={toInputDate(new Date())} value={f.nextFollowUp} onChange={set('nextFollowUp')} /></Field>
            <Field label="Remarks" className="sm:col-span-2"><TextArea rows={1} value={f.notes} onChange={set('notes')} /></Field>
          </Grid>
          <div className="flex justify-end mt-3"><Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Lead'}</Btn></div>
        </form>
      </Section>
      <CandidateList title="Today's Follow-ups" due="today" refreshKey={refresh} compact />
      <CandidateList title="Recent Leads" refreshKey={refresh} compact />
    </div>
  );
}
