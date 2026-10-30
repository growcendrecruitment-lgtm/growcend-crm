import React, { useEffect, useState, useCallback } from 'react';
import {
  Building2, Users, PhoneCall, FileText, DollarSign, Lock, Globe, Plane,
  Briefcase, LogOut, UserPlus, Search, RefreshCw
} from 'lucide-react';
import { api, getToken, setToken } from './api';
import Login from './Login';

const ROLE_INFO = {
  super_admin: { label: 'Director / Super Admin', dept: 'Management' },
  telecaller: { label: 'Telecaller', dept: 'Telecalling' },
  counsellor: { label: 'Counsellor', dept: 'Counselling' },
  b2b: { label: 'B2B Counsellor & Supervisor', dept: 'B2B & Supervisory' },
  documentation: { label: 'Documentation Vault Staff', dept: 'Documentation (Private)' },
  hr: { label: 'HR / Int. Recruitment', dept: 'HR & Employers' }
};

// Which role can open which module
const TABS = [
  { key: 'dashboard', label: 'Master Dashboard', icon: Building2, roles: Object.keys(ROLE_INFO) },
  { key: 'telecalling', label: 'Telecalling & IVR Hub', icon: PhoneCall, roles: ['super_admin', 'telecaller', 'b2b'] },
  { key: 'counselling', label: 'Counsellor & Candidate Match', icon: Users, roles: ['super_admin', 'counsellor', 'b2b', 'hr', 'telecaller'] },
  { key: 'b2b', label: 'B2B Agents Desk', icon: Briefcase, roles: ['super_admin', 'b2b'] },
  { key: 'documentation', label: 'Documentation Vault', icon: FileText, roles: ['super_admin', 'documentation'] },
  { key: 'finance', label: 'Accounts & Tax Invoices', icon: DollarSign, roles: ['super_admin'] },
  { key: 'users', label: 'Employee Logins', icon: UserPlus, roles: ['super_admin'] }
];

const STATUSES = [
  'New Lead', 'Interested', 'Not Interested', 'Counselling Done',
  'Advance Payment Received', 'Documents Verified', 'Offer Letter Sent',
  'Permit Under Process', 'Visa Approved', 'Travel Booked', 'Deployed', 'Rejected'
];

export default function GrowcendCRM() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());

  useEffect(() => {
    if (getToken()) {
      api('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setChecking(false));
    }
    const onLogout = () => setUser(null);
    window.addEventListener('growcend-logout', onLogout);
    return () => window.removeEventListener('growcend-logout', onLogout);
  }, []);

  if (checking) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Workspace user={user} onLogout={() => { setToken(null); setUser(null); }} />;
}

function Workspace({ user, onLogout }) {
  const tabs = TABS.filter((t) => t.roles.includes(user.role));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [ivrActive, setIvrActive] = useState(false);
  const [activeCallNumber, setActiveCallNumber] = useState('');
  const [msg, setMsg] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({ total: 0, counts: {} });

  useEffect(() => {
    if (activeTab === 'dashboard') api('/leads/stats').then(setStats).catch((e) => setMsg(e.message));
  }, [activeTab, refreshKey]);

  const handleStartIVRCall = (phoneNumber) => {
    setActiveCallNumber(phoneNumber);
    setIvrActive(true);
  };

  const info = ROLE_INFO[user.role] || { label: user.role };
  const count = (s) => stats.counts[s] || 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      {/* TOP HEADER BAR */}
      <header className="bg-blue-900 text-white border-b border-blue-800 shadow-md px-6 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-full bg-white p-1 shadow-inner flex items-center justify-center border-2 border-blue-300">
            <div className="w-full h-full rounded-full bg-blue-900 flex flex-col items-center justify-center text-[9px] font-bold text-white relative overflow-hidden text-center">
              <Globe className="w-6 h-6 text-blue-200 absolute opacity-40" />
              <span className="z-10 text-[8px] tracking-tighter">GROWCEND</span>
              <Plane className="w-3 h-3 text-amber-400 z-10 -rotate-45" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-wide flex items-center gap-2">
              GROWCEND INDIA PRIVATE LIMITED
              <span className="text-xs bg-blue-700 text-blue-100 px-2 py-0.5 rounded-full font-normal">Enterprise CRM v3.2</span>
            </h1>
            <p className="text-xs text-blue-200">International Recruitment & Overseas Employment Management System</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <p className="text-xs text-blue-300">{user.name}</p>
            <p className="text-xs font-bold text-amber-300">{info.label}</p>
          </div>
          <button onClick={onLogout} className="bg-blue-800 border border-blue-600 rounded-md px-3 py-1.5 text-xs flex items-center gap-1.5 hover:bg-blue-700">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between">
          <div className="p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">Operational Modules</p>
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === key ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icon className="w-4 h-4" /> {label}
                {key === 'documentation' && <Lock className="w-3 h-3 ml-auto text-amber-500" />}
              </button>
            ))}
          </div>

          <div className="p-4 m-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${ivrActive ? 'bg-emerald-500 animate-ping' : 'bg-emerald-600'}`}></span>
                Cloud IVR Gateway
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">Demo</span>
            </div>
            {ivrActive ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">On Call: <strong className="text-blue-900">{activeCallNumber}</strong></p>
                <button onClick={() => setIvrActive(false)} className="w-full bg-rose-600 text-white text-xs py-1 rounded shadow">End Call</button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">IVR provider (Exotel/Knowlarity etc.) connect karna baaki hai.</p>
            )}
          </div>
        </aside>

        {/* WORKSPACE */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-100">
          {msg && (
            <div className="mb-4 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded p-2 flex justify-between no-print">
              {msg} <button onClick={() => setMsg('')}>✕</button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">Executive Master Dashboard</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Stat label="Total Candidates / Leads" value={stats.total} />
                <Stat label="Visas Approved" value={count('Visa Approved')} />
                <Stat label="Advance Payments" value={count('Advance Payment Received')} />
                <Stat label="New Leads (to call)" value={count('New Lead')} danger />
              </div>
              <p className="text-xs text-slate-500">Ye numbers database ke real data se aate hain.</p>
            </div>
          )}

          {activeTab === 'telecalling' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">Telecalling & IVR Station</h2>
              <LeadForm onCreated={() => setRefreshKey((k) => k + 1)} onError={setMsg} />
              <LeadTable refreshKey={refreshKey} onCall={handleStartIVRCall} onError={setMsg} />
            </div>
          )}

          {activeTab === 'counselling' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">Counsellor & Candidate Match</h2>
              <LeadTable refreshKey={refreshKey} onCall={handleStartIVRCall} onError={setMsg} />
            </div>
          )}

          {activeTab === 'documentation' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">Documentation Processing Vault</h2>
              <div className="bg-white p-5 rounded-xl border space-y-3">
                <p className="text-xs text-slate-600">Welcome to Authorized Documentation Vault. Sirf Documentation staff aur Director ko access hai (server par bhi check hota hai).</p>
                <LeadTable refreshKey={refreshKey} onError={setMsg}
                  statusFilter="Advance Payment Received,Documents Verified,Offer Letter Sent,Permit Under Process" />
              </div>
            </div>
          )}

          {activeTab === 'b2b' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">B2B Agent Desk (Supervisor)</h2>
              <p className="text-xs text-slate-600">All agent leads and rate negotiations managed here. (Agent module — next phase)</p>
            </div>
          )}

          {activeTab === 'finance' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">Tax Invoices & Financial Ledger</h2>
              <div className="bg-white p-8 rounded-xl border max-w-xl mx-auto space-y-4">
                <h3 className="font-bold text-blue-900">GROWCEND INDIA PRIVATE LIMITED</h3>
                <p className="text-xs text-slate-500">Official Tax Invoice Template</p>
                <button onClick={() => window.print()} className="bg-blue-900 text-white text-xs px-4 py-2 rounded no-print">Print Invoice</button>
              </div>
            </div>
          )}

          {activeTab === 'users' && <UsersAdmin me={user} onError={setMsg} />}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className="bg-white p-4 rounded-xl border shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <h3 className={`text-2xl font-black mt-1 ${danger ? 'text-rose-700' : 'text-blue-900'}`}>{value}</h3>
    </div>
  );
}

function LeadForm({ onCreated, onError }) {
  const empty = { name: '', phone: '', country: '', job: '', notes: '' };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      onCreated(await api('/leads', { method: 'POST', body: f }));
      setF(empty);
    } catch (err) { onError(err.message); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
      <h3 className="font-bold text-slate-800 text-sm">Quick Lead Tele-Registration Form</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input value={f.name} onChange={set('name')} placeholder="Candidate Full Name *" className="border rounded p-2 text-xs" required />
        <input value={f.phone} onChange={set('phone')} placeholder="Mobile Number *" className="border rounded p-2 text-xs" required />
        <input value={f.country} onChange={set('country')} placeholder="Preferred Country" className="border rounded p-2 text-xs" />
        <input value={f.job} onChange={set('job')} placeholder="Job / Trade" className="border rounded p-2 text-xs" />
        <input value={f.notes} onChange={set('notes')} placeholder="Notes" className="border rounded p-2 text-xs md:col-span-2" />
      </div>
      <button disabled={saving} className="bg-blue-900 text-white text-xs px-4 py-2 rounded disabled:opacity-60">{saving ? 'Saving…' : 'Save Lead'}</button>
    </form>
  );
}

function LeadTable({ refreshKey, statusFilter, onCall, onError }) {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });

  // wait 400ms after typing before searching (fast with 1000s of records)
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page, limit: 50 });
    if (query) p.set('q', query);
    if (statusFilter) p.set('status', statusFilter);
    try {
      const d = await api(`/leads?${p}`);
      setLeads(d.items);
      setMeta({ total: d.total, pages: d.pages });
    } catch (e) { onError(e.message); }
  }, [page, query, statusFilter, onError]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const onStatus = async (id, status) => {
    try {
      const updated = await api(`/leads/${id}`, { method: 'PATCH', body: { status } });
      setLeads((ls) => ls.map((l) => (l._id === id ? { ...l, ...updated } : l)));
    } catch (e) { onError(e.message); }
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="p-3 border-b flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / phone / ID / country"
          className="flex-1 text-xs p-1.5 focus:outline-none" />
        <span className="text-[11px] text-slate-500">{meta.total} records</span>
        <button onClick={load} className="text-slate-500 hover:text-blue-900"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="p-2">ID</th><th className="p-2">Name</th><th className="p-2">Phone</th>
              <th className="p-2">Country</th><th className="p-2">Job</th><th className="p-2">Status</th>
              {onCall && <th className="p-2"></th>}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">No records</td></tr>}
            {leads.map((l) => (
              <tr key={l._id} className="border-t">
                <td className="p-2 font-mono text-blue-900">{l.leadId}</td>
                <td className="p-2 font-medium">{l.name}</td>
                <td className="p-2">{l.phone}</td>
                <td className="p-2">{l.country}</td>
                <td className="p-2">{l.job}</td>
                <td className="p-2">
                  <select value={l.status} onChange={(e) => onStatus(l._id, e.target.value)} className="border rounded p-1 text-xs">
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                {onCall && (
                  <td className="p-2">
                    <button onClick={() => onCall(l.phone)} className="bg-emerald-600 text-white px-2 py-1 rounded flex items-center gap-1">
                      <PhoneCall className="w-3 h-3" /> Call
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t flex items-center justify-end gap-2 text-xs">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">← Prev</button>
        <span>Page {page} / {meta.pages}</span>
        <button disabled={page >= meta.pages} onClick={() => setPage(page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next →</button>
      </div>
    </div>
  );
}

function UsersAdmin({ me, onError }) {
  const empty = { name: '', username: '', password: '', role: 'telecaller', department: 'Telecalling' };
  const [users, setUsers] = useState([]);
  const [f, setF] = useState(empty);
  const [ok, setOk] = useState('');

  const load = useCallback(() => api('/users').then(setUsers).catch((e) => onError(e.message)), [onError]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((p) => ({ ...p, [k]: v, ...(k === 'role' ? { department: ROLE_INFO[v].dept } : {}) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setOk('');
    try {
      await api('/users/create', { method: 'POST', body: f });
      setOk(`Login created for ${f.name}`);
      setF(empty);
      load();
    } catch (err) { onError(err.message); }
  };

  const toggle = async (u) => {
    try { await api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); load(); }
    catch (err) { onError(err.message); }
  };

  const resetPw = async (u) => {
    const pw = window.prompt(`New password for ${u.name} (min 8 characters):`);
    if (!pw) return;
    try { await api(`/users/${u.id}`, { method: 'PATCH', body: { password: pw } }); setOk(`Password reset for ${u.name}`); }
    catch (err) { onError(err.message); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Employee Logins</h2>
      <form onSubmit={submit} className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
        <h3 className="font-bold text-sm">Create New Employee Login</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={f.name} onChange={set('name')} placeholder="Full Name" className="border rounded p-2 text-xs" required />
          <input value={f.username} onChange={set('username')} placeholder="Username" className="border rounded p-2 text-xs" required />
          <input type="password" value={f.password} onChange={set('password')} placeholder="Password (min 8)" minLength={8} className="border rounded p-2 text-xs" required />
          <select value={f.role} onChange={set('role')} className="border rounded p-2 text-xs">
            {Object.entries(ROLE_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input value={f.department} onChange={set('department')} placeholder="Department" className="border rounded p-2 text-xs" required />
          <button className="bg-blue-900 text-white text-xs px-4 py-2 rounded">Create Login</button>
        </div>
        {ok && <p className="text-xs text-emerald-700">{ok}</p>}
      </form>

      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr><th className="p-2">Name</th><th className="p-2">Username</th><th className="p-2">Role</th><th className="p-2">Status</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2 font-medium">{u.name}</td>
                <td className="p-2">{u.username}</td>
                <td className="p-2">{ROLE_INFO[u.role]?.label || u.role}</td>
                <td className="p-2">{u.active ? <span className="text-emerald-700">Active</span> : <span className="text-rose-700">Disabled</span>}</td>
                <td className="p-2 space-x-2 text-right">
                  <button onClick={() => resetPw(u)} className="text-blue-900 underline">Reset password</button>
                  {u.id !== me.id && <button onClick={() => toggle(u)} className="text-rose-700 underline">{u.active ? 'Disable' : 'Enable'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
