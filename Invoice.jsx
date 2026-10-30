import React, { useEffect, useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { api } from './api';
import { Btn, Empty, fmtDate, inr, go } from './ui';
import { amountInWords } from './constants.js';

export default function Invoice({ id }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/payments/${id}`).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <Empty>{err}</Empty>;
  if (!d) return <Empty>Loading…</Empty>;

  const { payment: p, settings: s, lead } = d;
  const c = s.company || {};
  const b = s.bank || {};
  const g = p.gst || {};
  const title = g.applied ? 'TAX INVOICE' : 'PAYMENT RECEIPT';
  const missingSetup = !c.address || (g.applied && !c.gstin);

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap gap-2 justify-between items-center">
        <button onClick={() => go(`/candidate/${p.lead}/payments`)} className="text-xs text-blue-900 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to candidate</button>
        <Btn onClick={() => window.print()}><Printer className="w-4 h-4" /> Print / Save as PDF</Btn>
      </div>
      {missingSetup && (
        <div className="no-print bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded p-2">
          Company address{g.applied ? ' / GSTIN' : ''} is not filled. Director: go to <b>Company Settings</b> and fill company details — they appear on every bill.
        </div>
      )}

      <div className="invoice bg-white mx-auto shadow border p-8 max-w-[210mm] text-[13px] text-slate-800 relative">
        {p.cancelled && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-7xl font-black text-rose-500/30 -rotate-12">CANCELLED</span></div>}

        <div className="flex justify-between items-start border-b-2 border-blue-900 pb-3">
          <div>
            <h1 className="text-xl font-extrabold text-blue-900">{c.name}</h1>
            <p className="text-xs whitespace-pre-line">{[c.address, [c.city, c.state, c.pincode].filter(Boolean).join(', ')].filter(Boolean).join('\n')}</p>
            <p className="text-xs">{[c.phone && `Ph: ${c.phone}`, c.email, c.website].filter(Boolean).join(' · ')}</p>
            <p className="text-xs font-semibold">{[c.gstin && `GSTIN: ${c.gstin}`, c.pan && `PAN: ${c.pan}`, c.cin && `CIN: ${c.cin}`].filter(Boolean).join(' · ')}</p>
            {c.raLicense && <p className="text-xs">Recruiting Agent Licence No: {c.raLicense}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-black tracking-wide">{title}</h2>
            <p className="text-xs">No: <b>{p.invoiceNo}</b></p>
            <p className="text-xs">Date: <b>{fmtDate(p.date)}</b></p>
            {g.applied && <p className="text-xs">Place of Supply: {p.billTo?.state || c.state || '—'}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-3 border-b">
          <div>
            <p className="text-[11px] uppercase text-slate-500 font-semibold">Bill To</p>
            <p className="font-bold">{p.billTo?.name}</p>
            <p className="text-xs">{p.billTo?.address}{p.billTo?.pincode && ` – ${p.billTo.pincode}`}</p>
            <p className="text-xs">Mobile: {p.billTo?.phone}</p>
          </div>
          <div className="text-xs text-right">
            <p>Candidate ID: <b>{p.billTo?.leadId}</b></p>
            {p.billTo?.passportNo && <p>Passport No: {p.billTo.passportNo}</p>}
          </div>
        </div>

        <table className="w-full mt-3 text-xs border">
          <thead className="bg-slate-100">
            <tr><th className="border p-2 text-left">#</th><th className="border p-2 text-left">Description</th>{g.applied && <th className="border p-2">SAC</th>}<th className="border p-2 text-right">Amount (₹)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-2">1</td>
              <td className="border p-2">{p.purpose}{p.description && <div className="text-slate-500">{p.description}</div>}</td>
              {g.applied && <td className="border p-2 text-center">{s.invoice?.sac}</td>}
              <td className="border p-2 text-right">{(g.applied ? g.taxable : p.amount).toFixed(2)}</td>
            </tr>
            {g.applied && g.cgst > 0 && <Row label={`CGST @ ${g.rate / 2}%`} v={g.cgst} span={3} />}
            {g.applied && g.sgst > 0 && <Row label={`SGST @ ${g.rate / 2}%`} v={g.sgst} span={3} />}
            {g.applied && g.igst > 0 && <Row label={`IGST @ ${g.rate}%`} v={g.igst} span={3} />}
            <tr className="bg-slate-100 font-bold">
              <td className="border p-2 text-right" colSpan={g.applied ? 3 : 2}>Total</td>
              <td className="border p-2 text-right">{inr(p.amount)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs mt-2"><b>Amount in words:</b> {amountInWords(p.amount)}</p>
        <p className="text-xs">Payment Mode: {p.mode}{p.reference && ` (Ref: ${p.reference})`}</p>

        {lead && lead.packageAmount > 0 && (
          <div className="mt-3 text-xs border rounded p-2 bg-slate-50 grid grid-cols-3 gap-2">
            <div>Total Package: <b>{inr(lead.packageAmount)}</b></div>
            <div>Paid till date: <b>{inr(lead.paidAmount)}</b></div>
            <div>Balance: <b>{inr(Math.max(0, lead.packageAmount - lead.paidAmount))}</b></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mt-6 text-xs">
          <div>
            {(b.name || b.account || b.upi) && (<>
              <p className="font-semibold">Bank Details</p>
              {b.name && <p>Bank: {b.name}{b.branch && `, ${b.branch}`}</p>}
              {b.account && <p>A/c No: {b.account}</p>}
              {b.ifsc && <p>IFSC: {b.ifsc}</p>}
              {b.upi && <p>UPI: {b.upi}</p>}
            </>)}
            {s.invoice?.terms && <p className="mt-2 text-[11px] text-slate-500 whitespace-pre-line">{s.invoice.terms}</p>}
            {p.cancelled && <p className="mt-2 text-rose-700">Cancelled: {p.cancelReason}</p>}
          </div>
          <div className="text-right self-end">
            <p>For <b>{c.name}</b></p>
            <div className="h-14" />
            <p className="border-t inline-block pt-1">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const Row = ({ label, v, span }) => (
  <tr><td className="border p-2 text-right" colSpan={span}>{label}</td><td className="border p-2 text-right">{v.toFixed(2)}</td></tr>
);
