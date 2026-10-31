import React, { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from './api';
import { Field, Input, Select, TextArea, Section, Grid, Btn, getPath, setPath, toInputDate, useApp, go } from './ui';
import {
  GENDERS, MARITAL, INDIAN_STATES, ECR, QUALIFICATIONS, ENGLISH, SERVICE_TYPES, SOURCES, STATUSES, VISA_STATUS,
  MEDICAL_STATUS, PCC_STATUS, CAN_PAY, CAN_ASSIGN_DOC, COUNSELLOR_ROLES, normalizePhone, isPhone, isPincode, isAadhaar, isPAN, isPassport, isEmail
} from './constants.js';

const married = (v) => v.maritalStatus && v.maritalStatus !== 'Single';

export const PROFILE_SECTIONS = [
  { title: '1. Basic Details', fields: [
    { k: 'name', label: 'Full Name (as in Passport)', req: true, auto: 'name' },
    { k: 'fatherName', label: "Father's Name" },
    { k: 'dob', label: 'Date of Birth', type: 'date' },
    { k: 'gender', label: 'Gender', type: 'select', options: GENDERS },
    { k: 'maritalStatus', label: 'Marital Status', type: 'select', options: MARITAL },
    { k: 'spouseName', label: 'Wife / Husband Name', show: married },
    { k: 'childrenCount', label: 'No. of Children', type: 'number', show: married },
    { k: 'nationality', label: 'Nationality' }
  ] },
  { title: '2. Contact Details', fields: [
    { k: 'phone', label: 'Mobile Number', req: true, type: 'tel', hint: '10 digit, without +91', auto: 'tel' },
    { k: 'altPhone', label: 'Alternate Mobile', type: 'tel' },
    { k: 'whatsapp', label: 'WhatsApp Number', type: 'tel' },
    { k: 'email', label: 'Email', type: 'email', auto: 'email' }
  ] },
  { title: '3. Address', fields: [
    { k: 'address.line', label: 'House No. / Street / Village', span: 2, auto: 'street-address' },
    { k: 'address.city', label: 'City / Town' },
    { k: 'address.district', label: 'District' },
    { k: 'address.state', label: 'State', type: 'select', options: INDIAN_STATES },
    { k: 'address.pincode', label: 'Pincode', req: true, type: 'pincode', auto: 'postal-code' }
  ] },
  { title: '4. ID & Passport', fields: [
    { k: 'aadhaarNo', label: 'Aadhaar Number', type: 'aadhaar', hint: '12 digits' },
    { k: 'panNo', label: 'PAN Number', upper: true, hint: 'e.g. ABCDE1234F' },
    { k: 'passport.number', label: 'Passport Number', upper: true, hint: 'e.g. A1234567' },
    { k: 'passport.issueDate', label: 'Passport Issue Date', type: 'date' },
    { k: 'passport.expiryDate', label: 'Passport Expiry Date', type: 'date' },
    { k: 'passport.issuePlace', label: 'Place of Issue' },
    { k: 'passport.ecr', label: 'ECR / ECNR', type: 'select', options: ECR }
  ] },
  { title: '5. Education & Experience', fields: [
    { k: 'qualification', label: 'Highest Qualification', type: 'select', options: QUALIFICATIONS },
    { k: 'trade', label: 'Trade / Skill', hint: 'e.g. Welder, Driver, Accountant' },
    { k: 'experienceYears', label: 'Experience (Years)', type: 'number' },
    { k: 'englishLevel', label: 'English Speaking', type: 'select', options: ENGLISH },
    { k: 'experienceDetails', label: 'Experience Details (company, country, years)', type: 'textarea', span: 3 }
  ] },
  { title: '6. Requirement & Lead Info', fields: [
    { k: 'serviceType', label: 'Service Required', type: 'select', options: SERVICE_TYPES, req: true },
    { k: 'country', label: 'Preferred Country' },
    { k: 'job', label: 'Job / Position Wanted' },
    { k: 'expectedSalary', label: 'Expected Salary' },
    { k: 'source', label: 'Lead Source', type: 'select', options: SOURCES },
    { k: 'referredBy', label: 'Referred By / Agent Name' },
    { k: 'assignedTo', label: 'Assigned Counsellor', type: 'user', hint: 'Telecaller: choose counsellor to transfer the lead' },
    { k: 'docAssignedTo', label: 'Documentation Staff (file handover)', type: 'docuser', hint: 'Choose when candidate is selected — file goes to Documentation' },
    { k: 'status', label: 'Status', type: 'select', options: STATUSES },
    { k: 'packageAmount', label: 'Total Package / Fee (₹)', type: 'number', payOnly: true },
    { k: 'nextFollowUp', label: 'Next Follow-up Date', type: 'date' },
    { k: 'notes', label: 'Remarks', type: 'textarea', span: 3 }
  ] }
];

export const PROCESS_SECTIONS = [
  { title: 'Employer / Job Offer', fields: [
    { k: 'employer.name', label: 'Employer / Company Name' },
    { k: 'employer.country', label: 'Country' },
    { k: 'employer.jobTitle', label: 'Job Title' },
    { k: 'employer.salary', label: 'Salary Offered' },
    { k: 'employer.offerDate', label: 'Offer Letter Date', type: 'date' }
  ] },
  { title: 'Visa / Work Permit', fields: [
    { k: 'visa.type', label: 'Visa Type', hint: 'e.g. Work Permit, Employment Visa' },
    { k: 'visa.applicationNo', label: 'Application / Reference No.' },
    { k: 'visa.status', label: 'Visa Status', type: 'select', options: VISA_STATUS },
    { k: 'visa.appliedOn', label: 'Applied On', type: 'date' },
    { k: 'visa.approvedOn', label: 'Approved On', type: 'date' },
    { k: 'visa.expiryDate', label: 'Visa Expiry', type: 'date' }
  ] },
  { title: 'Medical & Police Clearance', fields: [
    { k: 'medical.status', label: 'Medical Status', type: 'select', options: MEDICAL_STATUS },
    { k: 'medical.date', label: 'Medical Date', type: 'date' },
    { k: 'medical.center', label: 'Medical Centre' },
    { k: 'pcc.status', label: 'PCC Status', type: 'select', options: PCC_STATUS },
    { k: 'pcc.date', label: 'PCC Date', type: 'date' }
  ] },
  { title: 'Travel', fields: [
    { k: 'travel.date', label: 'Travel Date', type: 'date' },
    { k: 'travel.airline', label: 'Airline' },
    { k: 'travel.ticketNo', label: 'Ticket / PNR No.' },
    { k: 'travel.from', label: 'From (City)' },
    { k: 'travel.to', label: 'To (City)' }
  ] }
];

const allFields = (sections) => sections.flatMap((s) => s.fields);

function toFormValues(lead, sections) {
  let v = { ...lead };
  for (const f of allFields(sections)) {
    const cur = getPath(v, f.k);
    if (f.type === 'date') v = setPath(v, f.k, toInputDate(cur));
    else if (f.type === 'user' || f.type === 'docuser') v = setPath(v, f.k, cur?._id || cur || '');
    else if (cur == null) v = setPath(v, f.k, '');
  }
  return v;
}

export function validate(v, sections) {
  const e = {};
  const keys = new Set(allFields(sections).map((f) => f.k));
  for (const f of allFields(sections)) if (f.req && (!f.show || f.show(v)) && !String(getPath(v, f.k) ?? '').trim()) e[f.k] = 'Required';
  const ph = (k, msg) => { const x = getPath(v, k); if (keys.has(k) && x && !isPhone(normalizePhone(x))) e[k] = msg; };
  ph('phone', 'Enter valid 10-digit mobile (starts with 6-9)');
  ph('altPhone', 'Enter valid 10-digit number');
  ph('whatsapp', 'Enter valid 10-digit number');
  if (keys.has('email') && v.email && !isEmail(v.email)) e.email = 'Email not valid';
  const pin = getPath(v, 'address.pincode');
  if (keys.has('address.pincode') && pin && !isPincode(pin)) e['address.pincode'] = 'Pincode must be 6 digits';
  if (keys.has('aadhaarNo') && v.aadhaarNo && !/x/i.test(v.aadhaarNo) && !isAadhaar(v.aadhaarNo)) e.aadhaarNo = 'Aadhaar must be 12 digits';
  if (keys.has('panNo') && v.panNo && !/^x/i.test(v.panNo) && !isPAN(v.panNo)) e.panNo = 'Format: ABCDE1234F';
  const pp = getPath(v, 'passport.number');
  if (keys.has('passport.number') && pp && !isPassport(pp)) e['passport.number'] = 'Format: A1234567';
  if (keys.has('dob') && v.dob && v.dob > toInputDate(new Date())) e.dob = 'Cannot be future date';
  return e;
}

export default function CandidateForm({ initial = {}, mode = 'create', group = 'profile', onSaved, readOnly = false }) {
  const { user, notify } = useApp();
  const sections = group === 'process' ? PROCESS_SECTIONS : PROFILE_SECTIONS;
  const defaults = mode === 'create' ? { nationality: 'Indian', serviceType: 'Overseas Job Placement', source: 'Telecalling', status: 'New Lead' } : {};
  const [v, setV] = useState(() => toFormValues({ ...defaults, ...initial }, sections));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [dup, setDup] = useState(null);

  useEffect(() => { api('/users/basic').then(setUsers).catch(() => {}); }, []);
  const curAssigned = initial.assignedTo?._id || initial.assignedTo || '';
  const userOptions = useMemo(() => users
    .filter((u) => COUNSELLOR_ROLES.includes(u.role) || user.role === 'super_admin' || u.id === curAssigned || u.id === user.id)
    .map((u) => ({ value: u.id, label: `${u.name}${u.role === 'b2b' ? ' (B2B)' : ''}` })), [users, user, curAssigned]);
  const docOptions = useMemo(() => users.filter((u) => u.role === 'documentation').map((u) => ({ value: u.id, label: u.name })), [users]);
  const canPay = CAN_PAY.includes(user.role);
  const canAssignDoc = CAN_ASSIGN_DOC.includes(user.role);

  const change = (f) => (e) => {
    let val = e.target.value;
    if (f.upper) val = val.toUpperCase().replace(/\s/g, '');
    if (f.type === 'tel') val = val.replace(/[^\d+\s]/g, '').slice(0, 14);
    if (f.type === 'pincode') val = val.replace(/\D/g, '').slice(0, 6);
    if (f.type === 'aadhaar') val = val.replace(/[^\d\s]/g, '').slice(0, 14);
    setV((p) => setPath(p, f.k, val));
    if (errors[f.k]) setErrors((p) => ({ ...p, [f.k]: undefined }));
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setDup(null);
    const e = validate(v, sections);
    setErrors(e);
    if (Object.keys(e).length) { notify('Please correct the fields marked in red', 'error'); return; }
    const tops = [...new Set(allFields(sections).map((f) => f.k.split('.')[0]))];
    const body = Object.fromEntries(tops.map((k) => [k, v[k]]));
    if (!canPay) delete body.packageAmount;
    setSaving(true);
    try {
      if (mode === 'create') {
        const lead = await api('/leads', { method: 'POST', body });
        notify(`Candidate saved — ID ${lead.leadId}`);
        go(`/candidate/${lead._id}`);
      } else {
        const lead = await api(`/leads/${initial._id}`, { method: 'PATCH', body });
        notify('Changes saved');
        onSaved && onSaved(lead);
      }
    } catch (err) {
      if (err.status === 409) setDup(err.data);
      notify(err.message, 'error');
    } finally { setSaving(false); }
  };

  const renderField = (f) => {
    if (f.show && !f.show(v)) return null;
    const val = getPath(v, f.k) ?? '';
    const common = { value: val, onChange: change(f), autoComplete: f.auto || 'off', name: f.k };
    let input;
    if (f.type === 'select') input = <Select options={f.options} {...common} />;
    else if (f.type === 'user') input = <Select options={userOptions} placeholder="— Not assigned —" {...common} />;
    else if (f.type === 'docuser') {
      const cur = initial.docAssignedTo;
      const opts = docOptions.length || !cur ? docOptions : [{ value: cur._id || cur, label: cur.name || 'Assigned' }];
      input = <Select options={opts} placeholder="— Not handed over —" {...common} disabled={!canAssignDoc} />;
    }
    else if (f.type === 'textarea') input = <TextArea {...common} />;
    else if (f.type === 'date') input = <Input type="date" {...common} />;
    else if (f.type === 'number') input = <Input type="number" min="0" step="any" inputMode="decimal" {...common} disabled={f.payOnly && !canPay} />;
    else if (f.type === 'tel') input = <Input type="tel" inputMode="tel" placeholder="98XXXXXXXX" {...common} />;
    else if (f.type === 'pincode') input = <Input inputMode="numeric" placeholder="6 digit pincode" {...common} />;
    else if (f.type === 'aadhaar') input = <Input inputMode="numeric" placeholder="XXXX XXXX XXXX" {...common} disabled={/x/i.test(val) && mode === 'edit'} />;
    else input = <Input type={f.type || 'text'} {...common} />;
    return (
      <Field key={f.k} label={f.label} required={f.req} error={errors[f.k]} hint={f.hint}
        className={f.span === 3 ? 'sm:col-span-2 lg:col-span-3' : f.span === 2 ? 'sm:col-span-2' : ''}>
        {input}
      </Field>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <fieldset disabled={readOnly} className="space-y-4 min-w-0">
      {dup && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-lg p-3 flex justify-between items-center gap-2">
          <span>{dup.message}</span>
          {dup.existingId && <Btn type="button" variant="light" onClick={() => go(`/candidate/${dup.existingId}`)}>Open existing</Btn>}
        </div>
      )}
      {sections.map((s) => (
        <Section key={s.title} title={s.title}><Grid>{s.fields.map(renderField)}</Grid></Section>
      ))}
      </fieldset>
      {!readOnly && <div className="sticky bottom-0 bg-slate-100/95 py-3 flex justify-end gap-2 border-t">
        {mode === 'create' && <Btn type="button" variant="light" onClick={() => window.history.back()}>Cancel</Btn>}
        <Btn type="submit" disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : mode === 'create' ? 'Save Candidate' : 'Save Changes'}</Btn>
      </div>}
    </form>
  );
}
