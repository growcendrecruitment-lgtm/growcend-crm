import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Users as UsersIcon, PhoneCall, FileText, IndianRupee, Globe, Plane, Briefcase, LogOut,
  UserPlus, CalendarClock, Settings as SettingsIcon, Menu, X, KeyRound, Eye, ClipboardList
} from 'lucide-react';
import { api, getToken, setToken } from './api';
import { AppCtx, go } from './ui';
import Login from './Login';
import CandidateList from './CandidateList';
import CandidateForm from './CandidateForm';
import CandidateDetail from './CandidateDetail';
import Invoice from './Invoice';
import { Dashboard, Telecalling, TeamView } from './Pages';
import Agents from './Agents';
import Demands, { DemandDetail, NewDemand } from './Demands';
import { Accounts, Settings, Users } from './Admin';
import { ROLE_INFO, ROLES, CAN_CREATE, CAN_PAY, AGENT_CREATE, AGENT_MANAGE, DEMAND_MANAGE, DEMAND_ASSIGNABLE } from './constants.js';

const NAV = [
  { path: '/', label: 'Dashboard', icon: Building2, roles: ROLES },
  { path: '/candidates', label: 'Candidates', icon: UsersIcon, roles: ROLES },
  { path: '/new', label: 'New Candidate (Full Form)', icon: UserPlus, roles: CAN_CREATE },
  { path: '/followups', label: "Today's Follow-ups", icon: CalendarClock, roles: ['super_admin', 'telecaller', 'counsellor', 'b2b', 'hr'] },
  { path: '/telecalling', label: 'Telecalling Station', icon: PhoneCall, roles: ['super_admin', 'telecaller', 'counsellor', 'b2b'] },
  { path: '/vault', label: 'Documentation Desk', icon: FileText, roles: ['super_admin', 'documentation'] },
  { path: '/demands', label: 'Job Demands', icon: ClipboardList, roles: [...DEMAND_MANAGE, ...DEMAND_ASSIGNABLE] },
  { path: '/agents', label: 'B2B Agent Register', icon: Briefcase, roles: AGENT_CREATE, badge: 'agents' },
  { path: '/team', label: 'Team Monitoring (View)', icon: Eye, roles: ['super_admin', 'b2b'] },
  { path: '/accounts', label: 'Bills & Payments', icon: IndianRupee, roles: [...new Set(['super_admin', ...CAN_PAY])] },
  { path: '/users', label: 'Employee Logins', icon: KeyRound, roles: ['super_admin'] },
  { path: '/settings', label: 'Company Settings', icon: SettingsIcon, roles: ['super_admin'] }
];

function useHashRoute() {
  const read = () => (window.location.hash.replace(/^#/, '') || '/');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const f = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return route;
}

export default function GrowcendCRM() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  useEffect(() => {
    if (getToken()) api('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setChecking(false));
    const onLogout = () => setUser(null);
    window.addEventListener('growcend-logout', onLogout);
    return () => window.removeEventListener('growcend-logout', onLogout);
  }, []);
  if (checking) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Shell user={user} onLogout={() => { setToken(null); setUser(null); go('/'); }} />;
}

function Shell({ user, onLogout }) {
  const route = useHashRoute();
  const [toast, setToast] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [call, setCall] = useState('');
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    if (!AGENT_MANAGE.includes(user.role)) return;
    api('/agents/summary').then((d) => setUnseen(d.unseen || 0)).catch(() => {});
  }, [route, user.role]);

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type, id: Date.now() });
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.type === 'error' ? 7000 : 3500); return () => clearTimeout(t); }, [toast]);

  const ctx = useMemo(() => ({ user, notify, startCall: setCall }), [user, notify]);
  const nav = NAV.filter((n) => n.roles.includes(user.role));
  const parts = route.split('/').filter(Boolean);
  const allowed = (p) => NAV.find((n) => n.path === p)?.roles.includes(user.role) ?? true;

  let page;
  if (parts[0] === 'candidate' && parts[1]) page = <CandidateDetail key={parts[1]} id={parts[1]} tab={parts[2] || 'profile'} />;
  else if (parts[0] === 'invoice' && parts[1]) page = <Invoice id={parts[1]} />;
  else if (parts[0] === 'demand' && parts[1] === 'new') page = DEMAND_MANAGE.includes(user.role) ? <NewDemand /> : <div className="p-10 text-center text-sm text-rose-700">Only HR / Director can create demands.</div>;
  else if (parts[0] === 'demand' && parts[1]) page = <DemandDetail key={parts[1]} id={parts[1]} tab={parts[2] || 'overview'} />;
  else if (!allowed('/' + (parts[0] || ''))) page = <div className="p-10 text-center text-sm text-rose-700">Permission denied for your role.</div>;
  else switch (parts[0]) {
    case 'candidates': page = (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{user.role === 'super_admin' ? 'All Candidates' : 'My Candidates'}</h2>
        {user.role !== 'super_admin' && <p className="text-xs text-slate-500">{ROLE_INFO[user.role]?.see}</p>}
        <CandidateList />
      </div>); break;
    case 'new': page = <div className="space-y-4"><h2 className="text-xl font-bold">New Candidate Registration</h2><CandidateForm mode="create" /></div>; break;
    case 'followups': page = <div className="space-y-4"><h2 className="text-xl font-bold">Today's & Overdue Follow-ups</h2><CandidateList due="today" /></div>; break;
    case 'telecalling': page = <Telecalling />; break;
    case 'vault': page = (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Documentation Desk</h2>
        <p className="text-xs text-slate-600">Files handed to Documentation (candidate page → <b>Documentation Staff</b> chosen). Open a candidate → <b>Documents</b> tab to upload / verify, <b>Payments &amp; Bills</b> tab to take payment and make bill.</p>
        <CandidateList inDoc />
      </div>); break;
    case 'agents': page = <Agents />; break;
    case 'demands': page = <Demands />; break;
    case 'team': page = <TeamView />; break;
    case 'accounts': page = <Accounts />; break;
    case 'users': page = <Users />; break;
    case 'settings': page = <Settings />; break;
    default: page = <Dashboard />;
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app-root min-h-screen bg-slate-100 font-sans text-slate-800 flex flex-col">
        <header className="bg-blue-900 text-white shadow-md px-3 sm:px-6 py-2.5 flex justify-between items-center sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
            <div className="w-10 h-10 rounded-full bg-white p-0.5 flex items-center justify-center border-2 border-blue-300 shrink-0">
              <div className="w-full h-full rounded-full bg-blue-900 flex flex-col items-center justify-center relative overflow-hidden">
                <Globe className="w-5 h-5 text-blue-200 absolute opacity-40" />
                <span className="z-10 text-[6px] font-bold tracking-tighter">GROWCEND</span>
                <Plane className="w-2.5 h-2.5 text-amber-400 z-10 -rotate-45" />
              </div>
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold tracking-wide">GROWCEND INDIA PVT LTD</h1>
              <p className="text-[10px] sm:text-xs text-blue-200 hidden sm:block">Overseas Recruitment & Visa Consultancy CRM</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-xs text-blue-200">{user.name}</p>
              <p className="text-xs font-bold text-amber-300">{ROLE_INFO[user.role]?.label}</p>
            </div>
            <button onClick={onLogout} className="bg-blue-800 border border-blue-600 rounded-md px-3 py-1.5 text-xs flex items-center gap-1.5 hover:bg-blue-700">
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </header>

        <div className="flex flex-1">
          <aside className={`${menuOpen ? 'block' : 'hidden'} lg:block fixed lg:static inset-y-0 top-[60px] left-0 z-20 w-64 bg-white border-r overflow-y-auto`}>
            <nav className="p-3 space-y-1">
              {nav.map(({ path, label, icon: Icon, badge }) => {
                const active = path === '/' ? route === '/' : route.startsWith(path);
                return (
                  <button key={path} onClick={() => { go(path); setMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${active ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    <Icon className="w-4 h-4" /> <span className="flex-1 text-left">{label}</span>
                    {badge === 'agents' && unseen > 0 && <span className="bg-rose-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{unseen} new</span>}
                  </button>
                );
              })}
            </nav>
            {call && (
              <div className="m-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                <p className="font-bold text-emerald-800">📞 Calling {call}</p>
                <p className="text-slate-500 mt-1">After the call, add a follow-up note in the candidate's page.</p>
                <button onClick={() => setCall('')} className="mt-2 w-full bg-rose-600 text-white py-1 rounded">Done</button>
              </div>
            )}
          </aside>

          <main className="flex-1 min-w-0 p-3 sm:p-6">{page}</main>
        </div>

        {toast && (
          <div className={`no-print fixed bottom-4 right-4 left-4 sm:left-auto z-50 max-w-md shadow-lg rounded-lg px-4 py-3 text-sm flex justify-between gap-3 ${toast.type === 'error' ? 'bg-rose-700 text-white' : 'bg-emerald-700 text-white'}`}>
            <span>{toast.msg}</span><button onClick={() => setToast(null)}>✕</button>
          </div>
        )}
      </div>
    </AppCtx.Provider>
  );
}
