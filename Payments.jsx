import React, { useCallback, useEffect, useState } from 'react';
import { Printer, XCircle, IndianRupee, AlertTriangle } from 'lucide-react';
import { api } from './api';
import { Section, Field, Select, Input, Btn, Empty, Grid, fmtDate, inr, go, useApp, todayInput } from './ui';
import { PAY_MODES, PAY_PURPOSES, CAN_PAY } from './constants.js';

export default function Payments({ lead, reload }) {
  const { user, notify } = useApp();
  const [items, setItems] = useState([]);
  const [pkg, setPkg] = useState(lead.packageAmount || '');
  const empty = { amount: '', date: todayInput(), mode: '', reference: '', purpose: '', description: '' };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  const canPay = CAN_PAY.includes(user.role) && lead._canEdit;
  const [settings, setSettings] = useState(null);
  useEffect(() => { api('/settings').then(setSettings).catch(() => {}); }, []);
  const c = settings?.company || {};
  const gstOn = !!settings?.invoice?.gstEnabled;
  const setupMissing = settings && (!c.address || !c.state || (gstOn && !c.gstin));

  const load = useCallback(() => api(`/leads/${lead._id}/payments`).then(setItems).catch((e) => notify(e.message, 'error')), [lead._id, notify]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const due = (lead.packageAmount || 0) - (lead.paidAmount || 0);

  const savePkg = async () => {
    try { await api(`/leads/${lead._id}`, { method: 'PATCH', body: { packageAmount: Number(pkg) || 0 } }); notify('Package updated'); reload(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) return notify('Enter amount', 'error');
    if (!f.mode || !f.purpose) return notify('Choose payment mode and purpose', 'error');
    if (f.mode !== 'Cash' && !f.reference.trim()) return notify('Enter UTR / transaction / cheque number', 'error');
    if (lead.packageAmount > 0 && Number(f.amount) > due &&
      !window.confirm(`Amount ${inr(f.amount)} is more than due ${inr(due)}. Continue?`)) return;
    setSaving(true);
    try {
      const p = await api(`/leads/${lead._id}/payments`, { method: 'POST', body: { ...f, amount: Number(f.amount) } });
      notify(`Payment saved — Invoice ${p.invoiceNo}`);
      setF(empty); load(); reload();
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };

  const cancel = async (p) => {
    const reason = window.prompt(`Cancel invoice ${p.invoiceNo} of ${inr(p.amount)}?\nWrite reason:`);
    if (!reason) return;
    try { await api(`/payments/${p._id}/cancel`, { method: 'POST', body: { reason } }); notify('Invoice cancelled'); load(); reload(); }
    catch (err) { notify(err.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Package / Fee</p>
          {canPay ? (
            <div className="flex gap-2 mt-1">
              <Input type="number" min="0" value={pkg} onChange={(e) => setPkg(e.target.value)} />
              <Btn variant="light" onClick={savePkg}>Save</Btn>
            </div>
          ) : <p className="text-xl font-black text-blue-900">{inr(lead.packageAmount)}</p>}
        </div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500">Total Paid</p><p className="text-xl font-black text-emerald-700">{inr(lead.paidAmount)}</p></div>
        <div className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500">Balance Due</p><p className={`text-xl font-black ${due > 0 ? 'text-rose-700' : 'text-slate-700'}`}>{inr(Math.max(0, due))}</p></div>
      </div>

      {canPay && (setupMissing || !lead.address?.state) && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 space-y-1">
          {setupMissing && <div className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Company address / State{gstOn ? ' / GSTIN' : ''} not filled in <b>Company Settings</b> — bill will be incomplete. {user.role === 'super_admin' ? <button className="underline" onClick={() => go('/settings')}>Fill now</button> : 'Ask Director to fill it.'}</div>}
          {!lead.address?.state && gstOn && <div className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Candidate's <b>State</b> is empty (Profile → Address). Bill will take CGST + SGST. Fill State first if candidate is from another state (then IGST).</div>}
        </div>
      )}

      {canPay && (
        <Section title="Receive Payment (Bill auto-generates)">
          <form onSubmit={add}>
            <Grid cols={3}>
              <Field label="Amount Received (₹, incl. GST)" required><Input type="number" min="1" step="any" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
              <Field label="Payment Date" required><Input type="date" max={todayInput()} value={f.date} onChange={set('date')} /></Field>
              <Field label="Mode" required><Select options={PAY_MODES} value={f.mode} onChange={set('mode')} /></Field>
              <Field label="UTR / Txn / Cheque No." required={f.mode && f.mode !== 'Cash'}><Input value={f.reference} onChange={set('reference')} /></Field>
              <Field label="Purpose" required><Select options={PAY_PURPOSES} value={f.purpose} onChange={set('purpose')} /></Field>
              <Field label="Description on Bill (optional)"><Input value={f.description} onChange={set('description')} placeholder="e.g. Work permit processing – Croatia" /></Field>
            </Grid>
            <div className="flex justify-end mt-3"><Btn type="submit" variant="green" disabled={saving}><IndianRupee className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Payment & Generate Bill'}</Btn></div>
          </form>
        </Section>
      )}

      <Section title={`Payment History (${items.length})`}>
        {items.length === 0 ? <Empty>No payments yet</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 text-left"><tr>
                <th className="p-2">Invoice No</th><th className="p-2">Date</th><th className="p-2">Purpose</th><th className="p-2">Mode</th>
                <th className="p-2 text-right">Amount</th><th className="p-2">By</th><th className="p-2"></th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p._id} className={`border-t ${p.cancelled ? 'opacity-50 line-through' : ''}`}>
                    <td className="p-2 font-mono text-xs">{p.invoiceNo}</td>
                    <td className="p-2 text-xs">{fmtDate(p.date)}</td>
                    <td className="p-2 text-xs">{p.purpose}</td>
                    <td className="p-2 text-xs">{p.mode}{p.reference && <div className="text-slate-400">{p.reference}</div>}</td>
                    <td className="p-2 text-right font-semibold">{inr(p.amount)}</td>
                    <td className="p-2 text-xs text-slate-500">{p.createdByName}</td>
                    <td className="p-2 no-underline">
                      <div className="flex gap-1 justify-end" style={{ textDecoration: 'none' }}>
                        <Btn variant="light" onClick={() => go(`/invoice/${p._id}`)}><Printer className="w-3.5 h-3.5" /> Bill</Btn>
                        {user.role === 'super_admin' && !p.cancelled && <Btn variant="light" onClick={() => cancel(p)} title="Cancel invoice"><XCircle className="w-3.5 h-3.5 text-rose-600" /></Btn>}
                      </div>
                    </td>
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
