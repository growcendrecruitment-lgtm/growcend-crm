import React, { useCallback, useEffect, useState } from 'react';
import { Download, Printer, Save, UserPlus, Search, FilePlus2 } from 'lucide-react';
import { api, downloadFile } from './api';
import { Section, Field, Input, Select, TextArea, Btn, Grid, Empty, Modal, fmtDate, inr, go, useApp, todayInput } from './ui';
import { ROLE_INFO, INDIAN_STATES } from './constants.js';

// ================= Accounts / Ledger =================
export function Accounts() {
  const { user, notify } = useApp();
  const isAdmin = user.role === 'super_admin';
  const first = todayInput().slice(0, 8) + '01';
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(todayInput());
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [d, setD] = useState(null);
  const [picker, setPicker] = useState(false);
  useEffect(() => { const t = setTimeout(() => setQ(search), 400); return () => clearTimeout(t); }, [search]);
  const load = useCallback(() => {
    const p = new URLSearchParams({ from, to });
    if (q) p.set('q', q);
    api(`/payments?${p}`).then(setD).catch((e) => notify(e.message, 'error'));
  }, [from, to, q, notify]);
  useEffect(() => { load(); }, [load]);
  const t = d?.totals || {};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-bold">Bills & Payments</h2>
        <Btn variant="green" onClick={() => setPicker(true)}><FilePlus2 className="w-4 h-4" /> Make New Bill</Btn>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
        <b>Bill kaise banta hai:</b> “Make New Bill” → candidate chuno → <b>Receive Payment</b> form bharo (amount, mode, UTR, purpose) → <b>Save Payment &amp; Generate Bill</b>. Bill number apne-aap lagta hai. Phir <b>Bill</b> button → <b>Print / Save as PDF</b>.
        {!isAdmin && <span className="block mt-1 text-blue-700">You see bills of your own candidates only.</span>}
      </div>
      <div className="bg-white border rounded-xl p-3 flex flex-wrap gap-3 items-end">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Search bill" className="flex-1 min-w-[180px]"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bill no. / name / mobile / GC-ID" /></Field>
        {isAdmin && (
          <Btn variant="light" onClick={() => downloadFile(`/payments?from=${from}&to=${to}&format=csv`, `payments-${from}-to-${to}.csv`).catch((e) => notify(e.message, 'error'))}>
            <Download className="w-4 h-4" /> Excel (for CA / GST)
          </Btn>
        )}
      </div>
      {picker && <PickCandidate onClose={() => setPicker(false)} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Bills', t.count || 0], ['Total Received', inr(t.amount)], ['Taxable Value', inr(t.taxable)], ['GST Collected', inr(t.gst)]].map(([k, v]) => (
          <div key={k} className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500">{k}</p><p className="text-xl font-black text-blue-900">{v}</p></div>
        ))}
      </div>
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr>
            <th className="p-2">Invoice</th><th className="p-2">Date</th><th className="p-2">Candidate</th><th className="p-2">Purpose</th>
            <th className="p-2">Mode</th><th className="p-2 text-right">GST</th><th className="p-2 text-right">Amount</th><th className="p-2"></th></tr></thead>
          <tbody>
            {!d?.items?.length && <tr><td colSpan={8}><Empty>No payments in this period</Empty></td></tr>}
            {d?.items?.map((p) => (
              <tr key={p._id} className={`border-t ${p.cancelled ? 'opacity-50' : ''}`}>
                <td className="p-2 font-mono text-xs">{p.invoiceNo}{p.cancelled && <span className="text-rose-600 ml-1">(Cancelled)</span>}</td>
                <td className="p-2 text-xs">{fmtDate(p.date)}</td>
                <td className="p-2 text-xs cursor-pointer hover:underline" onClick={() => go(`/candidate/${p.lead}/payments`)}>{p.billTo?.name}<div className="text-slate-400">{p.billTo?.leadId}</div></td>
                <td className="p-2 text-xs">{p.purpose}</td>
                <td className="p-2 text-xs">{p.mode}</td>
                <td className="p-2 text-xs text-right">{inr((p.gst?.cgst || 0) + (p.gst?.sgst || 0) + (p.gst?.igst || 0))}</td>
                <td className="p-2 text-right font-semibold">{inr(p.amount)}</td>
                <td className="p-2"><Btn variant="light" onClick={() => go(`/invoice/${p._id}`)}><Printer className="w-3.5 h-3.5" /> Bill</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Choose a candidate → opens their Payments & Bills tab
function PickCandidate({ onClose }) {
  const { notify } = useApp();
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limit: 15 });
      if (q.trim()) p.set('q', q.trim());
      api(`/leads?${p}`).then((r) => setItems(r.items)).catch((e) => notify(e.message, 'error'));
    }, 300);
    return () => clearTimeout(t);
  }, [q, notify]);
  return (
    <Modal title="Make New Bill — choose candidate" onClose={onClose}>
      <div className="flex items-center gap-1 border rounded-md px-2 mb-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name / mobile / GC-ID" className="flex-1 text-sm p-2 focus:outline-none" />
      </div>
      {items.length === 0 ? <Empty>No candidate found</Empty> : (
        <ul className="divide-y border rounded">
          {items.map((l) => (
            <li key={l._id}>
              <button disabled={!l._canEdit} onClick={() => go(`/candidate/${l._id}/payments`)}
                className="w-full text-left p-2 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-transparent flex justify-between gap-2">
                <span><b>{l.name}</b> <span className="text-xs text-slate-500">{l.leadId} · {l.phone}</span></span>
                <span className="text-xs text-slate-500">{l._canEdit ? `Due ${inr(Math.max(0, (l.packageAmount || 0) - (l.paidAmount || 0)))}` : 'view only'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ================= Company Settings =================
export function Settings() {
  const { notify } = useApp();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api('/settings').then(setS).catch((e) => notify(e.message, 'error')); }, [notify]);
  if (!s) return <Empty>Loading…</Empty>;
  const set = (grp, k) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setS((p) => ({ ...p, [grp]: { ...p[grp], [k]: val } }));
  };
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { setS(await api('/settings', { method: 'PUT', body: { company: s.company, bank: s.bank, invoice: { ...s.invoice, gstRate: Number(s.invoice.gstRate) || 18 } } })); notify('Settings saved'); }
    catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const C = s.company; const B = s.bank; const I = s.invoice;
  const pickLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Choose a PNG or JPG image', 'error');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 300 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      let data = cv.toDataURL('image/png');
      if (data.length > 350000) data = cv.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      setS((p) => ({ ...p, company: { ...p.company, logo: data } }));
      notify('Logo ready — click Save Settings');
    };
    img.onerror = () => notify('This image could not be read', 'error');
    img.src = url;
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <h2 className="text-xl font-bold">Company Settings <span className="text-xs font-normal text-slate-500">(printed on every bill)</span></h2>
      <Section title="Company Details">
        <Grid>
          <Field label="Company Name" required className="sm:col-span-2"><Input value={C.name} onChange={set('company', 'name')} /></Field>
          <Field label="Phone"><Input value={C.phone} onChange={set('company', 'phone')} /></Field>
          <Field label="Office Address" className="sm:col-span-2 lg:col-span-3"><Input value={C.address} onChange={set('company', 'address')} /></Field>
          <Field label="City"><Input value={C.city} onChange={set('company', 'city')} /></Field>
          <Field label="State" hint="Used to decide CGST+SGST or IGST"><Select options={INDIAN_STATES} value={C.state} onChange={set('company', 'state')} /></Field>
          <Field label="Pincode"><Input inputMode="numeric" maxLength={6} value={C.pincode} onChange={set('company', 'pincode')} /></Field>
          <Field label="Email"><Input value={C.email} onChange={set('company', 'email')} /></Field>
          <Field label="Website"><Input value={C.website} onChange={set('company', 'website')} /></Field>
          <Field label="GSTIN" hint="15 characters"><Input value={C.gstin} onChange={set('company', 'gstin')} className="uppercase" /></Field>
          <Field label="Company PAN"><Input value={C.pan} onChange={set('company', 'pan')} className="uppercase" /></Field>
          <Field label="CIN"><Input value={C.cin} onChange={set('company', 'cin')} /></Field>
          <Field label="MEA Recruiting Agent (RA) Licence No."><Input value={C.raLicense} onChange={set('company', 'raLicense')} /></Field>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 border rounded-lg p-3">
            {C.logo ? <img src={C.logo} alt="logo" className="h-14 w-14 object-contain border rounded" /> : <div className="h-14 w-14 border rounded flex items-center justify-center text-[10px] text-slate-400">No logo</div>}
            <div className="text-xs space-y-1">
              <p className="font-semibold text-slate-600">Company Logo (printed on bill)</p>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} className="text-xs" />
              {C.logo && <button type="button" className="text-rose-700 underline" onClick={() => setS((p) => ({ ...p, company: { ...p.company, logo: '' } }))}>Remove logo</button>}
            </div>
          </div>
        </Grid>
      </Section>
      <Section title="Bank Details (shown on bill)">
        <Grid>
          <Field label="Bank Name"><Input value={B.name} onChange={set('bank', 'name')} /></Field>
          <Field label="Account Number"><Input value={B.account} onChange={set('bank', 'account')} /></Field>
          <Field label="IFSC"><Input value={B.ifsc} onChange={set('bank', 'ifsc')} className="uppercase" /></Field>
          <Field label="Branch"><Input value={B.branch} onChange={set('bank', 'branch')} /></Field>
          <Field label="UPI ID"><Input value={B.upi} onChange={set('bank', 'upi')} /></Field>
        </Grid>
      </Section>
      <Section title="Invoice / GST">
        <Grid>
          <Field label="Invoice Prefix" hint="Bill no. looks like GC/2026-27/0001"><Input value={I.prefix} onChange={set('invoice', 'prefix')} /></Field>
          <Field label="GST Rate %"><Input type="number" value={I.gstRate} onChange={set('invoice', 'gstRate')} /></Field>
          <Field label="SAC Code" hint="998512 = placement services (confirm with your CA)"><Input value={I.sac} onChange={set('invoice', 'sac')} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" checked={!!I.gstEnabled} onChange={set('invoice', 'gstEnabled')} />
            Company is GST registered — make <b>Tax Invoice</b> (untick = simple Payment Receipt without GST)
          </label>
          <Field label="Terms printed on bill" className="sm:col-span-2 lg:col-span-3"><TextArea value={I.terms} onChange={set('invoice', 'terms')} /></Field>
        </Grid>
      </Section>
      <div className="flex justify-end"><Btn type="submit" disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}</Btn></div>
    </form>
  );
}

// ================= Employee Logins =================
export function Users() {
  const { user: me, notify } = useApp();
  const empty = { name: '', username: '', password: '', role: 'telecaller', department: 'Telecalling' };
  const [users, setUsers] = useState([]);
  const [f, setF] = useState(empty);
  const load = useCallback(() => api('/users').then(setUsers).catch((e) => notify(e.message, 'error')), [notify]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => { const v = e.target.value; setF((p) => ({ ...p, [k]: v, ...(k === 'role' ? { department: ROLE_INFO[v].dept } : {}) })); };
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/users/create', { method: 'POST', body: f }); notify(`Login created for ${f.name}`); setF(empty); load(); }
    catch (err) { notify(err.message, 'error'); }
  };
  const patch = async (u, body, msg) => {
    try { await api(`/users/${u.id}`, { method: 'PATCH', body }); notify(msg); load(); } catch (err) { notify(err.message, 'error'); }
  };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Employee Logins</h2>
      <Section title="Create New Employee Login">
        <form onSubmit={submit}>
          <Grid>
            <Field label="Full Name" required><Input value={f.name} onChange={set('name')} required /></Field>
            <Field label="Username" required hint="small letters, no space"><Input value={f.username} onChange={set('username')} autoComplete="off" required /></Field>
            <Field label="Password" required hint="min 8 characters"><Input type="password" value={f.password} onChange={set('password')} minLength={8} autoComplete="new-password" required /></Field>
            <Field label="Role" required><Select options={Object.entries(ROLE_INFO).map(([k, v]) => ({ value: k, label: v.label }))} value={f.role} onChange={set('role')} /></Field>
            <Field label="Department" required><Input value={f.department} onChange={set('department')} required /></Field>
            <div className="flex items-end"><Btn type="submit" className="w-full"><UserPlus className="w-4 h-4" /> Create Login</Btn></div>
          </Grid>
        </form>
      </Section>
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="p-2">Name</th><th className="p-2">Username</th><th className="p-2">Role</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2 font-semibold">{u.name}</td>
                <td className="p-2">{u.username}</td>
                <td className="p-2">
                  <select value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value }, 'Role updated')} className="border rounded p-1 text-xs">
                    {Object.entries(ROLE_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </td>
                <td className="p-2">{u.active ? <span className="text-emerald-700">Active</span> : <span className="text-rose-700">Disabled</span>}</td>
                <td className="p-2 text-right space-x-3 text-xs whitespace-nowrap">
                  <button className="text-blue-900 underline" onClick={() => { const pw = window.prompt(`New password for ${u.name} (min 8 characters):`); if (pw) patch(u, { password: pw }, `Password reset for ${u.name}`); }}>Reset password</button>
                  {u.id !== me.id && <button className="text-rose-700 underline" onClick={() => patch(u, { active: !u.active }, u.active ? 'Disabled' : 'Enabled')}>{u.active ? 'Disable' : 'Enable'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
