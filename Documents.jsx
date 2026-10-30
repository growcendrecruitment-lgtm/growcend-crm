import React, { useEffect, useState } from 'react';
import { Upload, Eye, Trash2, CheckCircle2, Circle, Lock, Download } from 'lucide-react';
import { api, apiBlob } from './api';
import { Section, Field, Select, Btn, Modal, Empty, fmtDateTime, useApp } from './ui';
import { DOC_TYPES, REQUIRED_DOCS, CAN_UPLOAD, CAN_VIEW_DOCS } from './constants.js';

// Photos from phone camera are big — shrink to max 1800px JPEG (~200-400 KB) before upload
async function prepareFile(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 5 * 1024 * 1024) throw new Error('PDF is larger than 5 MB. Please compress it first.');
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return { data, contentType: 'application/pdf', filename: file.name };
  }
  if (!file.type.startsWith('image/')) throw new Error('Only photo (JPG/PNG) or PDF files allowed');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This image format is not supported. Use JPG or PNG.')); i.src = url; });
    const max = 1800;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.8), contentType: 'image/jpeg', filename: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } finally { URL.revokeObjectURL(url); }
}

export default function Documents({ lead, docs, reload }) {
  const { user, notify } = useApp();
  const [type, setType] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(null);
  const canUpload = CAN_UPLOAD.includes(user.role);
  const canView = CAN_VIEW_DOCS.includes(user.role);
  const count = (t) => docs.filter((d) => d.type === t).length;

  useEffect(() => () => viewer && URL.revokeObjectURL(viewer.url), [viewer]);

  const upload = async (e) => {
    e.preventDefault();
    if (!type) return notify('Choose document type', 'error');
    if (!file) return notify('Choose a file / take photo', 'error');
    setBusy(true);
    try {
      const p = await prepareFile(file);
      await api(`/leads/${lead._id}/documents`, { method: 'POST', body: { type, ...p } });
      notify(`${type} uploaded`);
      setFile(null); setType(''); e.target.reset();
      reload();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };

  const view = async (d) => {
    try { const blob = await apiBlob(`/documents/${d._id}/file`); setViewer({ doc: d, url: URL.createObjectURL(blob) }); }
    catch (err) { notify(err.message, 'error'); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Delete ${d.type}?`)) return;
    try { await api(`/documents/${d._id}`, { method: 'DELETE' }); notify('Deleted'); reload(); } catch (err) { notify(err.message, 'error'); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="space-y-4">
        {canUpload ? (
          <Section title="Upload Document">
            <form onSubmit={upload} className="space-y-3">
              <Field label="Document Type" required><Select options={DOC_TYPES} value={type} onChange={(e) => setType(e.target.value)} /></Field>
              <Field label="File" required hint="Photo (JPG/PNG) or PDF, max 5 MB. On mobile you can use camera.">
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)}
                  className="block w-full text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-900" />
              </Field>
              <Btn type="submit" disabled={busy} className="w-full"><Upload className="w-4 h-4" /> {busy ? 'Uploading…' : 'Upload'}</Btn>
            </form>
          </Section>
        ) : <div className="text-xs text-slate-500 bg-white border rounded-xl p-4">Your role cannot upload documents.</div>}

        <Section title="Checklist">
          <ul className="space-y-1 text-sm">
            {DOC_TYPES.filter((t) => REQUIRED_DOCS.includes(t) || count(t)).map((t) => (
              <li key={t} className="flex items-center gap-2">
                {count(t) ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-rose-400" />}
                <span className={count(t) ? '' : 'text-rose-700'}>{t}</span>
                {REQUIRED_DOCS.includes(t) && !count(t) && <span className="text-[10px] text-rose-500">required</span>}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="lg:col-span-2">
        <Section title={`Uploaded Documents (${docs.length})`} right={!canView && <span className="text-[11px] text-amber-700 flex items-center gap-1"><Lock className="w-3 h-3" /> Only Documentation & Director can open files</span>}>
          {docs.length === 0 ? <Empty>No documents uploaded yet</Empty> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 text-left"><tr><th className="p-2">Type</th><th className="p-2">File</th><th className="p-2">Uploaded</th><th className="p-2"></th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d._id} className="border-t">
                    <td className="p-2 font-semibold">{d.type}</td>
                    <td className="p-2 text-xs text-slate-600">{d.filename}<div className="text-slate-400">{Math.round(d.size / 1024)} KB</div></td>
                    <td className="p-2 text-xs text-slate-500">{fmtDateTime(d.createdAt)}<div>{d.uploadedByName}</div></td>
                    <td className="p-2">
                      {canView && (
                        <div className="flex gap-1 justify-end">
                          <Btn variant="light" onClick={() => view(d)}><Eye className="w-3.5 h-3.5" /> View</Btn>
                          <Btn variant="light" onClick={() => remove(d)}><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Btn>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      {viewer && (
        <Modal wide title={`${viewer.doc.type} — ${lead.name}`} onClose={() => setViewer(null)}>
          <div className="flex justify-end mb-2">
            <a href={viewer.url} download={`${lead.leadId}-${viewer.doc.filename}`} className="text-xs bg-blue-900 text-white px-3 py-1.5 rounded flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Download</a>
          </div>
          {viewer.doc.contentType === 'application/pdf'
            ? <iframe title="pdf" src={viewer.url} className="w-full h-[70vh] border" />
            : <img src={viewer.url} alt={viewer.doc.type} className="max-w-full mx-auto" />}
        </Modal>
      )}
    </div>
  );
}
