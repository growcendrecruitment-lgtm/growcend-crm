import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { User, Lead, DocFile, Payment, Settings, Agent, getSettings, nextSeq } from './models.js';
import {
  ROLES, STATUSES, DOC_TYPES, PAY_MODES, CAN_CREATE, CAN_EDIT, CAN_PAY, CAN_UPLOAD, CAN_VIEW_DOCS,
  CAN_SEE_FULL_IDS, CAN_ASSIGN_DOC, COUNSELLOR_ROLES, SUPERVISED_ROLES, AGENT_CREATE, AGENT_MANAGE, AGENT_STATUS,
  normalizePhone, isPhone, isAnyPhone, isPincode, isAadhaar, isPAN, isPassport, isEmail, r2
} from './constants.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET missing or too short (min 32 characters). Set it in .env / Render Environment');
  if (isProd) process.exit(1);
}
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/growcend_crm';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'frame-src': ["'self'", 'blob:'] } }
}));
app.use(compression()); // pages & data travel compressed = faster on mobile internet
// Bigger body only for document uploads
app.use((req, res, next) =>
  express.json({ limit: req.method === 'POST' && req.path.endsWith('/documents') ? '9mb' : '1mb' })(req, res, next));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : (isProd ? false : true) }));

// ---------- Helpers ----------
const IST = 330 * 60000;
const istDay = (d = new Date()) => new Date(new Date(d).getTime() + IST);
const endOfTodayIST = () => { const x = istDay(); x.setUTCHours(23, 59, 59, 999); return new Date(x.getTime() - IST); };
const startOfMonthIST = () => { const x = istDay(); x.setUTCDate(1); x.setUTCHours(0, 0, 0, 0); return new Date(x.getTime() - IST); };
const istDateStart = (s) => new Date(new Date(`${s}T00:00:00.000Z`).getTime() - IST);
const fmtDate = (d) => (d ? istDay(d).toISOString().slice(0, 10) : '');
const financialYear = (d) => {
  const x = istDay(d); const y = x.getUTCFullYear();
  const start = x.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
const toCSV = (rows) => '﻿' + rows.map((r) => r.map((v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\r\n');
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error(err);
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ message: err.message });
  res.status(500).json({ message: 'Server error' });
});

// ---------- Auth ----------
const auth = wrap(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Login required' });
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ message: 'Session expired, please login again' }); }
  const user = await User.findById(payload.id).select('-password');
  if (!user || !user.active) return res.status(401).json({ message: 'Account disabled or not found' });
  req.user = user;
  next();
});
const allow = (roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Permission denied for your role' });

// ---------- Data privacy (enforced on the SERVER — hiding buttons is not enough) ----------
// super_admin     : everything
// telecaller/counsellor : only candidates they created OR that are assigned to them
// b2b (Bittu)     : own candidates (edit) + VIEW-ONLY candidates of all Telecallers & Counsellors
// documentation   : only files handed to them (Documentation Staff = me)
// hr              : own candidates + VIEW-ONLY candidates already in documentation process
const idOf = (x) => (x && x._id ? x._id : x);
const sameId = (a, b) => !!a && !!b && String(idOf(a)) === String(idOf(b));
const supervisedIds = async () => (await User.find({ role: { $in: SUPERVISED_ROLES } }).select('_id').lean()).map((u) => u._id);

async function leadScope(user) {
  const me = user._id;
  switch (user.role) {
    case 'super_admin': return {};
    case 'documentation': return { docAssignedTo: me };
    case 'hr': return { $or: [{ createdBy: me }, { assignedTo: me }, { docAssignedTo: { $ne: null } }] };
    case 'b2b': {
      const ids = await supervisedIds();
      return { $or: [{ createdBy: me }, { assignedTo: me }, { createdBy: { $in: ids } }, { assignedTo: { $in: ids } }] };
    }
    default: return { $or: [{ createdBy: me }, { assignedTo: me }] };
  }
}
function canEditLead(user, lead) {
  if (user.role === 'super_admin') return true;
  if (user.role === 'documentation') return sameId(lead.docAssignedTo, user._id);
  return sameId(lead.createdBy, user._id) || sameId(lead.assignedTo, user._id);
}
async function canViewLead(user, lead) {
  if (canEditLead(user, lead)) return true;
  if (user.role === 'hr') return !!lead.docAssignedTo;
  if (user.role === 'b2b') {
    const ids = await supervisedIds();
    return ids.some((id) => sameId(id, lead.createdBy) || sameId(id, lead.assignedTo));
  }
  return false;
}
// Loads a candidate and checks access. mode = 'view' | 'edit'
async function loadLead(req, res, mode = 'view', id = req.params.id) {
  if (!mongoose.isValidObjectId(id)) { res.status(404).json({ message: 'Candidate not found' }); return null; }
  const lead = await Lead.findById(id);
  if (!lead) { res.status(404).json({ message: 'Candidate not found' }); return null; }
  const ok = mode === 'edit' ? canEditLead(req.user, lead) : await canViewLead(req.user, lead);
  if (!ok) {
    res.status(403).json({ message: mode === 'edit' ? 'You can only VIEW this candidate. Changes are not allowed for your login.' : 'This candidate is not assigned to you.' });
    return null;
  }
  return lead;
}
// Supervisor filter: ?owner=<employeeId>  (Director: anyone, Bittu: Telecallers & Counsellors only)
async function ownerFilter(req) {
  const owner = req.query.owner;
  if (!owner) return null;
  if (!mongoose.isValidObjectId(owner)) return { _id: null };
  if (req.user.role !== 'super_admin') {
    if (req.user.role !== 'b2b') return { _id: null };
    const u = await User.findById(owner).select('role');
    if (!u || !SUPERVISED_ROLES.includes(u.role)) return { _id: null };
  }
  return { $or: [{ createdBy: owner }, { assignedTo: owner }] };
}
// Check "Assigned Counsellor" / "Documentation Staff" choices
async function checkAssignments(data, user, lead) {
  if (data.assignedTo && !sameId(data.assignedTo, lead?.assignedTo)) {
    if (!mongoose.isValidObjectId(data.assignedTo)) return 'Invalid counsellor';
    const u = await User.findById(data.assignedTo).select('role active name');
    if (!u || !u.active) return 'Selected counsellor login is not active';
    if (user.role !== 'super_admin' && !COUNSELLOR_ROLES.includes(u.role) && !sameId(u._id, user._id))
      return 'Candidate can be assigned only to a Counsellor or B2B Counsellor';
  }
  if (data.docAssignedTo !== undefined && !sameId(data.docAssignedTo, lead?.docAssignedTo)) {
    if (!CAN_ASSIGN_DOC.includes(user.role)) { delete data.docAssignedTo; return null; }
    if (data.docAssignedTo) {
      if (!mongoose.isValidObjectId(data.docAssignedTo)) return 'Invalid documentation staff';
      const u = await User.findById(data.docAssignedTo).select('role active');
      if (!u || !u.active || u.role !== 'documentation') return 'Choose an active Documentation staff login';
    }
  }
  return null;
}
async function userName(id) { return id ? (await User.findById(id).select('name'))?.name || '' : ''; }

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { message: 'Too many login attempts. Try again in 15 minutes.' } });
const publicUser = (u) => ({ id: u._id, name: u.name, username: u.username, role: u.role, department: u.department, active: u.active });

app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  const user = await User.findOne({ username: String(username).toLowerCase().trim() });
  const ok = user && user.active && await bcrypt.compare(String(password), user.password);
  if (!ok) return res.status(401).json({ message: 'Invalid username or password' });
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: publicUser(user) });
}));
app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

// ---------- Users ----------
app.get('/api/users', auth, allow(['super_admin']), wrap(async (req, res) => {
  res.json((await User.find().sort({ createdAt: -1 })).map(publicUser));
}));
app.get('/api/users/basic', auth, wrap(async (req, res) => {
  res.json((await User.find({ active: true }).select('name role').sort({ name: 1 })).map((u) => ({ id: u._id, name: u.name, role: u.role })));
}));
app.post('/api/users/create', auth, allow(['super_admin']), wrap(async (req, res) => {
  const { username, password, name, role, department } = req.body || {};
  if (!username || !password || !name || !role || !department) return res.status(400).json({ message: 'All fields are required' });
  if (String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (await User.findOne({ username: String(username).toLowerCase().trim() })) return res.status(400).json({ message: 'Username already exists' });
  const u = await User.create({ username, password: await bcrypt.hash(String(password), 10), name, role, department });
  res.status(201).json({ message: 'Employee login created', user: publicUser(u) });
}));
app.patch('/api/users/:id', auth, allow(['super_admin']), wrap(async (req, res) => {
  const { active, password, role } = req.body || {};
  const update = {};
  const self = String(req.params.id) === String(req.user._id);
  if (typeof active === 'boolean') {
    if (self && !active) return res.status(400).json({ message: 'You cannot disable yourself' });
    update.active = active;
  }
  if (role) {
    if (!ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });
    if (self && role !== 'super_admin') return res.status(400).json({ message: 'You cannot remove your own admin role' });
    update.role = role;
  }
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    update.password = await bcrypt.hash(String(password), 10);
  }
  const u = await User.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!u) return res.status(404).json({ message: 'User not found' });
  res.json(publicUser(u));
}));

// ---------- Settings ----------
app.get('/api/settings', auth, wrap(async (req, res) => res.json(await getSettings())));
app.put('/api/settings', auth, allow(['super_admin']), wrap(async (req, res) => {
  const { company = {}, bank = {}, invoice = {} } = req.body || {};
  if (company.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(company.gstin).toUpperCase()))
    return res.status(400).json({ message: 'GSTIN format is wrong (15 characters, e.g. 08ABCDE1234F1Z5)' });
  if (company.pincode && !isPincode(company.pincode)) return res.status(400).json({ message: 'Company pincode must be 6 digits' });
  if (company.logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(company.logo) || company.logo.length > 400000))
    return res.status(400).json({ message: 'Logo must be a PNG/JPG image (small size, under 300 KB)' });
  const s = await getSettings();
  const cur = s.company.toObject();
  s.company = { ...cur, ...company,
    gstin: String(company.gstin !== undefined ? company.gstin : cur.gstin || '').toUpperCase(),
    pan: String(company.pan !== undefined ? company.pan : cur.pan || '').toUpperCase() };
  s.bank = { ...s.bank.toObject(), ...bank };
  s.invoice = { ...s.invoice.toObject(), ...invoice, prefix: String(invoice.prefix || 'GC').replace(/[^A-Za-z0-9-]/g, '') || 'GC' };
  await s.save();
  res.json(s);
}));

// ---------- Candidates ----------
const LEAD_FIELDS = ['name', 'fatherName', 'dob', 'gender', 'maritalStatus', 'spouseName', 'childrenCount', 'nationality',
  'phone', 'altPhone', 'whatsapp', 'email', 'address', 'aadhaarNo', 'panNo', 'passport', 'qualification', 'trade',
  'experienceYears', 'experienceDetails', 'englishLevel', 'serviceType', 'country', 'job', 'expectedSalary',
  'employer', 'visa', 'medical', 'pcc', 'travel', 'source', 'referredBy', 'assignedTo', 'status', 'nextFollowUp',
  'notes', 'packageAmount', 'docAssignedTo'];

function cleanLeadInput(body, user, isCreate) {
  const d = {};
  for (const k of LEAD_FIELDS) if (body[k] !== undefined) d[k] = body[k];
  const privileged = CAN_SEE_FULL_IDS.includes(user.role);

  // masked values coming back from the form are ignored
  if (typeof d.aadhaarNo === 'string' && /x|\*/i.test(d.aadhaarNo)) delete d.aadhaarNo;
  if (typeof d.panNo === 'string' && /^x|\*/i.test(d.panNo) && !privileged) delete d.panNo;

  for (const k of ['phone', 'altPhone', 'whatsapp']) if (typeof d[k] === 'string') d[k] = normalizePhone(d[k]);
  if (typeof d.aadhaarNo === 'string') d.aadhaarNo = d.aadhaarNo.replace(/\s|-/g, '');
  if (typeof d.panNo === 'string') d.panNo = d.panNo.trim().toUpperCase();
  if (d.passport && typeof d.passport.number === 'string') d.passport.number = d.passport.number.trim().toUpperCase();
  if (d.address && typeof d.address.pincode === 'string') d.address.pincode = d.address.pincode.trim();
  if (d.assignedTo === '') d.assignedTo = null;
  if (d.docAssignedTo === '') d.docAssignedTo = null;

  const e = [];
  if (isCreate || d.name !== undefined) if (!String(d.name || '').trim()) e.push('Name is required');
  if (isCreate || d.phone !== undefined) if (!isPhone(d.phone)) e.push('Mobile number must be a valid 10-digit Indian number');
  if (d.altPhone && !isPhone(d.altPhone)) e.push('Alternate number must be 10 digits');
  if (d.whatsapp && !isPhone(d.whatsapp)) e.push('WhatsApp number must be 10 digits');
  if (d.email && !isEmail(d.email)) e.push('Email is not valid');
  if (isCreate || d.address !== undefined) if (!isPincode(d.address?.pincode)) e.push('Pincode is required (6 digits)');
  if (d.aadhaarNo && !isAadhaar(d.aadhaarNo)) e.push('Aadhaar must be 12 digits');
  if (d.panNo && !isPAN(d.panNo)) e.push('PAN format is wrong (e.g. ABCDE1234F)');
  if (d.passport?.number && !isPassport(d.passport.number)) e.push('Passport number format is wrong (e.g. A1234567)');
  if (d.status && !STATUSES.includes(d.status)) e.push('Invalid status');
  if (d.packageAmount !== undefined && d.packageAmount !== '' && (isNaN(d.packageAmount) || Number(d.packageAmount) < 0)) e.push('Package amount is not valid');
  if (d.dob && new Date(d.dob) > new Date()) e.push('Date of birth cannot be in the future');
  if (d.passport?.issueDate && d.passport?.expiryDate && new Date(d.passport.expiryDate) <= new Date(d.passport.issueDate)) e.push('Passport expiry must be after issue date');
  if (d.packageAmount === '') d.packageAmount = 0;
  return { data: d, error: e.join(' • ') };
}

function serializeLead(lead, user) {
  const o = lead.toObject ? lead.toObject() : { ...lead };
  o._canEdit = canEditLead(user, lead);
  if (!CAN_SEE_FULL_IDS.includes(user.role)) {
    if (o.aadhaarNo) o.aadhaarNo = 'XXXX XXXX ' + o.aadhaarNo.slice(-4);
    if (o.panNo) o.panNo = 'XXXXX' + o.panNo.slice(5);
  }
  return o;
}

app.get('/api/leads', auth, wrap(async (req, res) => {
  const { q, status, serviceType, due, assigned, inDoc } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const filter = {};
  if (q) {
    const rx = new RegExp(escapeRx(String(q).trim()), 'i');
    const digits = normalizePhone(q);
    filter.$or = [{ name: rx }, { leadId: rx }, { 'address.pincode': rx }, { 'address.city': rx }, { 'address.district': rx },
      { country: rx }, { job: rx }, { 'passport.number': rx }, ...(digits.length >= 4 ? [{ phone: new RegExp(digits) }] : [])];
  }
  if (status) filter.status = { $in: String(status).split(',') };
  if (serviceType) filter.serviceType = serviceType;
  if (assigned === 'me') filter.assignedTo = req.user._id;
  if (inDoc) filter.docAssignedTo = { $ne: null };
  if (due === 'today') filter.nextFollowUp = { $ne: null, $lte: endOfTodayIST() };
  const where = { $and: [await leadScope(req.user), filter, (await ownerFilter(req)) || {}] };
  const sort = due ? { nextFollowUp: 1 } : { createdAt: -1 };
  const [rows, total] = await Promise.all([
    Lead.find(where).sort(sort).skip((page - 1) * limit).limit(limit)
      .select('leadId name phone address serviceType country job status nextFollowUp packageAmount paidAmount createdAt assignedTo docAssignedTo createdBy createdByName')
      .populate('assignedTo', 'name').populate('docAssignedTo', 'name'),
    Lead.countDocuments(where)
  ]);
  const items = rows.map((l) => { const o = l.toObject(); o._canEdit = canEditLead(req.user, l); return o; });
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

app.get('/api/leads/stats', auth, wrap(async (req, res) => {
  const soon = new Date(Date.now() + 180 * 86400000);
  const base = { $and: [await leadScope(req.user), (await ownerFilter(req)) || {}] };
  const w = (extra) => ({ $and: [base, extra] });
  const isAll = req.user.role === 'super_admin' && !req.query.owner;
  const scopedIds = isAll ? null : await Lead.find(base).distinct('_id');
  const payMatch = { cancelled: false, date: { $gte: startOfMonthIST() }, ...(scopedIds ? { lead: { $in: scopedIds } } : {}) };
  const [total, statusRows, dueToday, newThisMonth, payMonth, money, passportSoon] = await Promise.all([
    Lead.countDocuments(base),
    Lead.find(base).select('status').lean(),
    Lead.countDocuments(w({ nextFollowUp: { $ne: null, $lte: endOfTodayIST() } })),
    Lead.countDocuments(w({ createdAt: { $gte: startOfMonthIST() } })),
    Payment.aggregate([{ $match: payMatch }, { $group: { _id: null, sum: { $sum: '$amount' } } }]),
    Lead.find(w({ packageAmount: { $gt: 0 } })).select('packageAmount paidAmount').lean(),
    Lead.countDocuments(w({ 'passport.expiryDate': { $ne: null, $lte: soon } }))
  ]);
  const counts = {};
  for (const r of statusRows) if (r.status) counts[r.status] = (counts[r.status] || 0) + 1;
  res.json({
    total, counts, dueToday, newThisMonth, passportSoon,
    collectedThisMonth: payMonth[0]?.sum || 0,
    pendingDues: r2(money.reduce((sum, l) => sum + Math.max(0, (l.packageAmount || 0) - (l.paidAmount || 0)), 0))
  });
}));

app.get('/api/leads/export.csv', auth, wrap(async (req, res) => {
  const where = { $and: [await leadScope(req.user), (await ownerFilter(req)) || {}] };
  const leads = (await Lead.find(where).sort({ createdAt: -1 }).populate('assignedTo', 'name').populate('docAssignedTo', 'name').lean())
    .map((l) => serializeLead(l, req.user));
  const head = ['ID', 'Name', 'Father Name', 'DOB', 'Gender', 'Marital Status', 'Mobile', 'Alt Mobile', 'WhatsApp', 'Email',
    'Address', 'City', 'District', 'State', 'Pincode', 'Aadhaar', 'PAN', 'Passport No', 'Passport Expiry', 'ECR/ECNR',
    'Qualification', 'Trade', 'Experience (Yrs)', 'Service', 'Country', 'Job', 'Status', 'Source', 'Assigned To',
    'Documentation Staff', 'Created By', 'Package (Rs)', 'Paid (Rs)', 'Due (Rs)', 'Next Follow-up', 'Created On'];
  const rows = leads.map((l) => [l.leadId, l.name, l.fatherName, fmtDate(l.dob), l.gender, l.maritalStatus, l.phone, l.altPhone, l.whatsapp, l.email,
    l.address?.line, l.address?.city, l.address?.district, l.address?.state, l.address?.pincode, l.aadhaarNo, l.panNo,
    l.passport?.number, fmtDate(l.passport?.expiryDate), l.passport?.ecr, l.qualification, l.trade, l.experienceYears,
    l.serviceType, l.country, l.job, l.status, l.source, l.assignedTo?.name,
    l.docAssignedTo?.name, l.createdByName, l.packageAmount, l.paidAmount,
    (l.packageAmount || 0) - (l.paidAmount || 0), fmtDate(l.nextFollowUp), fmtDate(l.createdAt)]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="growcend-candidates-${fmtDate(new Date())}.csv"`);
  res.send(toCSV([head, ...rows]));
}));

app.get('/api/leads/:id', auth, wrap(async (req, res) => {
  const lead = await loadLead(req, res, 'view');
  if (!lead) return;
  await lead.populate([{ path: 'assignedTo', select: 'name' }, { path: 'docAssignedTo', select: 'name' }]);
  res.json(serializeLead(lead, req.user));
}));

app.post('/api/leads', auth, allow(CAN_CREATE), wrap(async (req, res) => {
  const { data, error } = cleanLeadInput(req.body || {}, req.user, true);
  if (error) return res.status(400).json({ message: error });
  const dup = await Lead.findOne({ phone: data.phone });
  if (dup) {
    if (await canViewLead(req.user, dup))
      return res.status(409).json({ message: `This mobile number is already registered: ${dup.leadId} (${dup.name})`, existingId: dup._id });
    const owner = (await userName(dup.assignedTo)) || dup.createdByName || 'another employee';
    return res.status(409).json({ message: `This mobile number is already registered (${dup.leadId}) and is handled by ${owner}. Please ask Director / senior.` });
  }
  const assignErr = await checkAssignments(data, req.user, null);
  if (assignErr) return res.status(400).json({ message: assignErr });
  const lead = new Lead({ ...data, createdBy: req.user._id, createdByName: req.user.name });
  lead.followups.push({ note: `Candidate registered by ${req.user.name}`, system: true, by: req.user._id, byName: req.user.name });
  if (data.assignedTo) lead.followups.push({ note: `Assigned to counsellor: ${await userName(data.assignedTo)}`, system: true, by: req.user._id, byName: req.user.name });
  if (data.docAssignedTo) lead.followups.push({ note: `File handed to Documentation: ${await userName(data.docAssignedTo)}`, system: true, by: req.user._id, byName: req.user.name });
  await lead.save();
  res.status(201).json(serializeLead(lead, req.user));
}));

app.patch('/api/leads/:id', auth, allow(CAN_EDIT), wrap(async (req, res) => {
  const lead = await loadLead(req, res, 'edit');
  if (!lead) return;
  const { data, error } = cleanLeadInput(req.body || {}, req.user, false);
  if (error) return res.status(400).json({ message: error });
  const assignErr = await checkAssignments(data, req.user, lead);
  if (assignErr) return res.status(400).json({ message: assignErr });
  if (data.assignedTo !== undefined && !sameId(data.assignedTo, lead.assignedTo))
    lead.followups.push({ note: data.assignedTo ? `Assigned to counsellor: ${await userName(data.assignedTo)}` : 'Counsellor removed', system: true, by: req.user._id, byName: req.user.name });
  if (data.docAssignedTo !== undefined && !sameId(data.docAssignedTo, lead.docAssignedTo))
    lead.followups.push({ note: data.docAssignedTo ? `File handed to Documentation: ${await userName(data.docAssignedTo)}` : 'Documentation staff removed', system: true, by: req.user._id, byName: req.user.name });
  if (data.phone && data.phone !== lead.phone) {
    const dup = await Lead.findOne({ phone: data.phone, _id: { $ne: lead._id } }).select('leadId name');
    if (dup) return res.status(409).json({ message: `This mobile number belongs to ${dup.leadId} (${dup.name})` });
  }
  if (data.status && data.status !== lead.status)
    lead.followups.push({ note: `Status changed: ${lead.status} → ${data.status}`, system: true, by: req.user._id, byName: req.user.name });
  lead.set(data);
  await lead.save();
  await lead.populate([{ path: 'assignedTo', select: 'name' }, { path: 'docAssignedTo', select: 'name' }]);
  res.json(serializeLead(lead, req.user));
}));

app.post('/api/leads/:id/followups', auth, wrap(async (req, res) => {
  const { note, outcome, nextDate, status } = req.body || {};
  if (!note && !outcome) return res.status(400).json({ message: 'Write a note or choose call outcome' });
  const lead = await loadLead(req, res, 'edit');
  if (!lead) return;
  lead.followups.push({ note, outcome, nextDate: nextDate || null, by: req.user._id, byName: req.user.name });
  lead.nextFollowUp = nextDate || null;
  if (status && STATUSES.includes(status) && status !== lead.status) {
    lead.followups.push({ note: `Status changed: ${lead.status} → ${status}`, system: true, by: req.user._id, byName: req.user.name });
    lead.status = status;
  }
  await lead.save();
  await lead.populate([{ path: 'assignedTo', select: 'name' }, { path: 'docAssignedTo', select: 'name' }]);
  res.json(serializeLead(lead, req.user));
}));

app.delete('/api/leads/:id', auth, allow(['super_admin']), wrap(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ message: 'Candidate not found' });
  if (await Payment.exists({ lead: lead._id, cancelled: false }))
    return res.status(400).json({ message: 'This candidate has payments. Cancel the invoices first.' });
  const docs = await DocFile.find({ lead: lead._id });
  for (const d of docs) await deleteFile(d);
  await DocFile.deleteMany({ lead: lead._id });
  await lead.deleteOne();
  res.json({ ok: true });
}));

// ---------- Documents (stored inside MongoDB GridFS — private, login required) ----------
let bucket;          // where NEW documents are saved (FILES_MONGODB_URI if set, else main DB)
let mainBucket;      // main DB — older documents may still be here
const bucketOf = (doc) => (doc.store === 'main' ? mainBucket : bucket);
async function findStream(doc) {
  // try the bucket recorded on the document, then the other one (documents saved before a second DB was added)
  for (const b of [bucketOf(doc), doc.store === 'main' ? bucket : mainBucket]) {
    if (b && (await b.find({ _id: doc.fileId }).limit(1).toArray()).length) return b.openDownloadStream(doc.fileId);
  }
  return null;
}
async function deleteFile(doc) {
  for (const b of [bucket, mainBucket]) if (b) await b.delete(doc.fileId).catch(() => {});
}
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

app.get('/api/leads/:id/documents', auth, wrap(async (req, res) => {
  if (!(await loadLead(req, res, 'view'))) return;
  res.json(await DocFile.find({ lead: req.params.id }).sort({ createdAt: -1 }).select('-fileId'));
}));

app.post('/api/leads/:id/documents', auth, allow(CAN_UPLOAD), wrap(async (req, res) => {
  const { type, filename, contentType, data } = req.body || {};
  if (!DOC_TYPES.includes(type)) return res.status(400).json({ message: 'Choose document type' });
  if (!ALLOWED_TYPES.includes(contentType)) return res.status(400).json({ message: 'Only JPG, PNG, WEBP images or PDF allowed' });
  if (!data) return res.status(400).json({ message: 'File missing' });
  const buf = Buffer.from(String(data).replace(/^data:[^,]+,/, ''), 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ message: 'File too large (max 6 MB)' });
  const lead = await loadLead(req, res, 'edit');
  if (!lead) return;
  const safeName = String(filename || type).replace(/[^\w.\- ]/g, '_').slice(0, 80);
  const fileId = await new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(`${lead.leadId}-${safeName}`, { contentType, metadata: { lead: lead._id, type } });
    up.on('error', reject);
    up.on('finish', () => resolve(up.id));
    up.end(buf);
  });
  const doc = await DocFile.create({ lead: lead._id, type, filename: safeName, contentType, size: buf.length, fileId,
    store: process.env.FILES_MONGODB_URI ? 'files' : 'main',
    uploadedBy: req.user._id, uploadedByName: req.user.name });
  await Lead.updateOne({ _id: lead._id }, { $push: { followups: { note: `Document uploaded: ${type}`, system: true, by: req.user._id, byName: req.user.name } } });
  const out = doc.toObject(); delete out.fileId;
  res.status(201).json(out);
}));

app.get('/api/documents/:docId/file', auth, allow(CAN_VIEW_DOCS), wrap(async (req, res) => {
  const doc = await DocFile.findById(req.params.docId);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (!(await loadLead(req, res, 'view', doc.lead))) return;
  res.setHeader('Content-Type', doc.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
  const stream = await findStream(doc);
  if (!stream) { res.removeHeader('Content-Disposition'); return res.status(404).json({ message: 'File not found in storage' }); }
  stream.on('error', () => res.end()).pipe(res);
}));

app.delete('/api/documents/:docId', auth, allow(['super_admin']), wrap(async (req, res) => {
  const doc = await DocFile.findById(req.params.docId);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  await deleteFile(doc);
  await doc.deleteOne();
  await Lead.updateOne({ _id: doc.lead }, { $push: { followups: { note: `Document deleted: ${doc.type}`, system: true, by: req.user._id, byName: req.user.name } } });
  res.json({ ok: true });
}));

// ---------- Payments & Invoices ----------
function computeGst(amount, settings, candidateState) {
  const inv = settings.invoice || {};
  if (!inv.gstEnabled) return { applied: false, rate: 0, taxable: r2(amount), cgst: 0, sgst: 0, igst: 0 };
  const rate = Number(inv.gstRate) || 18;
  const taxable = r2((amount * 100) / (100 + rate)); // amount received is inclusive of GST
  const tax = r2(amount - taxable);
  const companyState = (settings.company?.state || '').trim().toLowerCase();
  const custState = (candidateState || '').trim().toLowerCase();
  const intra = !companyState || !custState || companyState === custState;
  if (intra) { const c = r2(tax / 2); return { applied: true, rate, taxable, cgst: c, sgst: r2(tax - c), igst: 0 }; }
  return { applied: true, rate, taxable, cgst: 0, sgst: 0, igst: tax };
}

app.get('/api/leads/:id/payments', auth, wrap(async (req, res) => {
  if (!(await loadLead(req, res, 'view'))) return;
  res.json(await Payment.find({ lead: req.params.id }).sort({ date: -1, createdAt: -1 }));
}));

app.post('/api/leads/:id/payments', auth, allow(CAN_PAY), wrap(async (req, res) => {
  const { amount, date, mode, reference, purpose, description } = req.body || {};
  const amt = r2(amount);
  if (!(amt > 0)) return res.status(400).json({ message: 'Enter a valid amount' });
  if (!PAY_MODES.includes(mode)) return res.status(400).json({ message: 'Choose payment mode' });
  if (!purpose) return res.status(400).json({ message: 'Choose payment purpose' });
  if (['UPI', 'Bank Transfer', 'Cheque', 'Card'].includes(mode) && !String(reference || '').trim())
    return res.status(400).json({ message: 'Enter UTR / transaction / cheque number for ' + mode });
  const lead = await loadLead(req, res, 'edit');
  if (!lead) return;
  const settings = await getSettings();
  const payDate = date ? new Date(date) : new Date();
  const fy = financialYear(payDate);
  const invoiceNo = `${settings.invoice.prefix || 'GC'}/${fy}/${String(await nextSeq(`inv-${fy}`)).padStart(4, '0')}`;
  const a = lead.address || {};
  const payment = await Payment.create({
    lead: lead._id, invoiceNo, date: payDate, amount: amt, mode, reference, purpose, description,
    gst: computeGst(amt, settings, a.state),
    billTo: {
      name: lead.name, phone: lead.phone, leadId: lead.leadId, state: a.state, pincode: a.pincode,
      address: [a.line, a.city, a.district, a.state].filter(Boolean).join(', '), passportNo: lead.passport?.number || ''
    },
    createdBy: req.user._id, createdByName: req.user.name
  });
  lead.paidAmount = r2((lead.paidAmount || 0) + amt);
  lead.followups.push({ note: `Payment received ₹${amt} (${mode}) — Invoice ${invoiceNo}`, system: true, by: req.user._id, byName: req.user.name });
  await lead.save();
  res.status(201).json(payment);
}));

app.post('/api/payments/:pid/cancel', auth, allow(['super_admin']), wrap(async (req, res) => {
  const p = await Payment.findById(req.params.pid);
  if (!p) return res.status(404).json({ message: 'Payment not found' });
  if (p.cancelled) return res.status(400).json({ message: 'Already cancelled' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ message: 'Write reason for cancelling' });
  p.cancelled = true; p.cancelReason = reason; await p.save();
  await Lead.updateOne({ _id: p.lead }, {
    $inc: { paidAmount: -p.amount },
    $push: { followups: { note: `Invoice ${p.invoiceNo} cancelled: ${reason}`, system: true, by: req.user._id, byName: req.user.name } }
  });
  res.json(p);
}));

app.get('/api/payments/:pid', auth, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.pid)) return res.status(404).json({ message: 'Invoice not found' });
  const p = await Payment.findById(req.params.pid);
  if (!p) return res.status(404).json({ message: 'Invoice not found' });
  const lead = await loadLead(req, res, 'view', p.lead);
  if (!lead) return;
  // "Paid till this bill" — all valid bills of this candidate made up to (and including) this one
  const upto = await Payment.find({ lead: p.lead, cancelled: false, createdAt: { $lte: p.createdAt } }).select('amount').lean();
  const paidTill = r2(upto.reduce((s, x) => s + x.amount, 0));
  res.json({
    payment: p, settings: await getSettings(),
    lead: { _id: lead._id, leadId: lead.leadId, name: lead.name, packageAmount: lead.packageAmount, paidAmount: lead.paidAmount, paidTill }
  });
}));

// Bills list: Director sees all; Counsellor / Bittu / Documentation see bills of THEIR candidates only
app.get('/api/payments', auth, allow([...new Set(['super_admin', ...CAN_PAY])]), wrap(async (req, res) => {
  const { from, to, format, q } = req.query;
  if (format === 'csv' && req.user.role !== 'super_admin') return res.status(403).json({ message: 'Only Director can download accounts' });
  const filter = {};
  if (req.user.role !== 'super_admin') filter.lead = { $in: await Lead.find(await leadScope(req.user)).distinct('_id') };
  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRx(String(q).trim()), 'i');
    filter.$or = [{ invoiceNo: rx }, { 'billTo.name': rx }, { 'billTo.phone': rx }, { 'billTo.leadId': rx }];
  }
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = istDateStart(from);
    if (to) filter.date.$lt = new Date(istDateStart(to).getTime() + 86400000);
  }
  const items = await Payment.find(filter).sort({ date: -1, createdAt: -1 }).limit(format === 'csv' ? 100000 : 1000);
  const ok = items.filter((p) => !p.cancelled);
  const totals = {
    count: ok.length,
    amount: r2(ok.reduce((s, p) => s + p.amount, 0)),
    taxable: r2(ok.reduce((s, p) => s + (p.gst?.taxable || 0), 0)),
    gst: r2(ok.reduce((s, p) => s + (p.gst?.cgst || 0) + (p.gst?.sgst || 0) + (p.gst?.igst || 0), 0))
  };
  if (format === 'csv') {
    const head = ['Invoice No', 'Date', 'Candidate ID', 'Candidate', 'Mobile', 'State', 'Purpose', 'Mode', 'Reference',
      'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Status', 'Received By'];
    const rows = items.map((p) => [p.invoiceNo, fmtDate(p.date), p.billTo?.leadId, p.billTo?.name, p.billTo?.phone, p.billTo?.state,
      p.purpose, p.mode, p.reference, p.gst?.taxable, p.gst?.cgst, p.gst?.sgst, p.gst?.igst, p.amount,
      p.cancelled ? `Cancelled: ${p.cancelReason}` : 'Valid', p.createdByName]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="growcend-payments-${from || 'all'}-${to || ''}.csv"`);
    return res.send(toCSV([head, ...rows]));
  }
  res.json({ items, totals });
}));

// ---------- B2B Agent Register (separate from candidates) ----------
// Telecaller/Counsellor: add agent leads + see only their own. Bittu (b2b) & Director: see and manage ALL.
const AGENT_FIELDS = ['agentName', 'companyName', 'contactPerson', 'phone', 'whatsapp', 'email', 'country', 'city', 'address',
  'agentType', 'manpower', 'jobCategories', 'expectedRate', 'notes', 'followUpDate', 'status', 'active'];
const agentScope = (user) => (AGENT_MANAGE.includes(user.role) ? {} : { createdBy: user._id });
const canEditAgent = (user, a) => AGENT_MANAGE.includes(user.role) || sameId(a.createdBy, user._id);

function cleanAgentInput(body, isCreate) {
  const d = {};
  for (const k of AGENT_FIELDS) if (body[k] !== undefined) d[k] = body[k];
  for (const k of ['phone', 'whatsapp']) if (typeof d[k] === 'string') d[k] = normalizePhone(d[k]);
  if (d.followUpDate === '') d.followUpDate = null;
  const e = [];
  if (isCreate || d.agentName !== undefined) if (!String(d.agentName || '').trim()) e.push('Agent name is required');
  if (isCreate || d.phone !== undefined) if (!isAnyPhone(d.phone)) e.push('Mobile number is required (Indian 10 digit, or foreign with country code)');
  if (d.whatsapp && !isAnyPhone(d.whatsapp)) e.push('WhatsApp number is not valid');
  if (d.email && !isEmail(d.email)) e.push('Email is not valid');
  if (d.status && !AGENT_STATUS.includes(d.status)) e.push('Invalid status');
  return { data: d, error: e.join(' • ') };
}
async function loadAgent(req, res, mode = 'view') {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ message: 'Agent not found' }); return null; }
  const a = await Agent.findById(req.params.id);
  if (!a) { res.status(404).json({ message: 'Agent not found' }); return null; }
  const ok = AGENT_MANAGE.includes(req.user.role) || sameId(a.createdBy, req.user._id);
  if (!ok || (mode === 'edit' && !canEditAgent(req.user, a))) { res.status(403).json({ message: 'This agent record is not yours' }); return null; }
  return a;
}
const agentOut = (a, user) => { const o = a.toObject ? a.toObject() : { ...a }; o._canEdit = canEditAgent(user, a); return o; };
function agentQuery(req) {
  const { q, status, createdBy } = req.query;
  const f = {};
  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRx(String(q).trim()), 'i');
    const digits = normalizePhone(q);
    f.$or = [{ agentName: rx }, { companyName: rx }, { contactPerson: rx }, { agentId: rx }, { city: rx }, { country: rx }, { jobCategories: rx },
      ...(digits.length >= 4 ? [{ phone: new RegExp(digits) }] : [])];
  }
  if (status) f.status = status;
  if (createdBy && AGENT_MANAGE.includes(req.user.role) && mongoose.isValidObjectId(createdBy)) f.createdBy = createdBy;
  if (req.query.unseen) f.seenByB2B = false;
  return { $and: [agentScope(req.user), f] };
}

app.get('/api/agents', auth, allow(AGENT_CREATE), wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const where = agentQuery(req);
  const [rows, total] = await Promise.all([
    Agent.find(where).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-history').populate('assignedTo', 'name'),
    Agent.countDocuments(where)
  ]);
  res.json({ items: rows.map((a) => agentOut(a, req.user)), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

app.get('/api/agents/summary', auth, allow(AGENT_CREATE), wrap(async (req, res) => {
  const scope = agentScope(req.user);
  const [total, unseen, today] = await Promise.all([
    Agent.countDocuments(scope),
    AGENT_MANAGE.includes(req.user.role) ? Agent.countDocuments({ seenByB2B: false }) : 0,
    Agent.countDocuments({ ...scope, createdAt: { $gte: new Date(endOfTodayIST().getTime() - 86400000 + 1) } })
  ]);
  res.json({ total, unseen, today });
}));

app.get('/api/agents/export.csv', auth, allow(AGENT_CREATE), wrap(async (req, res) => {
  const rows = await Agent.find(agentQuery(req)).sort({ createdAt: -1 }).populate('assignedTo', 'name').lean();
  const head = ['Agent ID', 'Agent Name', 'Company', 'Contact Person', 'Mobile', 'WhatsApp', 'Email', 'Country', 'City', 'Address',
    'Agent Type', 'Available Manpower', 'Job Categories', 'Expected Rate', 'Telecaller Notes', 'Follow-up Date', 'Lead Status',
    'Active', 'Assigned To (B2B)', 'Entered By', 'Entry Date'];
  const data = rows.map((a) => [a.agentId, a.agentName, a.companyName, a.contactPerson, a.phone, a.whatsapp, a.email, a.country, a.city,
    a.address, a.agentType, a.manpower, a.jobCategories, a.expectedRate, a.notes, fmtDate(a.followUpDate), a.status,
    a.active ? 'Active' : 'Inactive', a.assignedTo?.name, a.createdByName, fmtDate(a.createdAt)]);
  let who = 'all';
  if (req.query.createdBy && AGENT_MANAGE.includes(req.user.role)) who = (await userName(req.query.createdBy)) || 'employee';
  else if (!AGENT_MANAGE.includes(req.user.role)) who = req.user.name;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="b2b-agent-leads-${String(who).replace(/[^\w-]+/g, '_')}-${fmtDate(new Date())}.csv"`);
  res.send(toCSV([head, ...data]));
}));

app.get('/api/agents/:id', auth, allow(AGENT_CREATE), wrap(async (req, res) => {
  const a = await loadAgent(req, res, 'view');
  if (!a) return;
  if (req.user.role === 'b2b' && !a.seenByB2B) { a.seenByB2B = true; await a.save(); }
  await a.populate('assignedTo', 'name');
  res.json(agentOut(a, req.user));
}));

app.post('/api/agents', auth, allow(AGENT_CREATE), wrap(async (req, res) => {
  const { data, error } = cleanAgentInput(req.body || {}, true);
  if (error) return res.status(400).json({ message: error });
  const dup = await Agent.findOne({ phone: data.phone }).select('agentId agentName createdByName');
  if (dup) return res.status(409).json({ message: `This agent is already in the register: ${dup.agentId} (${dup.agentName}, entered by ${dup.createdByName})` });
  const bittu = await User.findOne({ role: 'b2b', active: true }).sort({ createdAt: 1 });
  const a = new Agent({ ...data, status: data.status || 'New Lead', createdBy: req.user._id, createdByName: req.user.name,
    assignedTo: bittu?._id || null, seenByB2B: req.user.role === 'b2b' });
  a.history.push({ note: `Agent lead entered by ${req.user.name}${bittu ? ` — auto-assigned to ${bittu.name} (B2B)` : ''}`, system: true, by: req.user._id, byName: req.user.name });
  await a.save();
  res.status(201).json(agentOut(a, req.user));
}));

app.patch('/api/agents/:id', auth, allow(AGENT_CREATE), wrap(async (req, res) => {
  const a = await loadAgent(req, res, 'edit');
  if (!a) return;
  const { data, error } = cleanAgentInput(req.body || {}, false);
  if (error) return res.status(400).json({ message: error });
  if (data.phone && data.phone !== a.phone) {
    const dup = await Agent.findOne({ phone: data.phone, _id: { $ne: a._id } }).select('agentId agentName');
    if (dup) return res.status(409).json({ message: `This number belongs to ${dup.agentId} (${dup.agentName})` });
  }
  if (data.status && data.status !== a.status) a.history.push({ note: `Status: ${a.status} → ${data.status}`, system: true, by: req.user._id, byName: req.user.name });
  if (typeof data.active === 'boolean' && data.active !== a.active) a.history.push({ note: data.active ? 'Marked Active' : 'Marked Inactive', system: true, by: req.user._id, byName: req.user.name });
  a.set(data);
  await a.save();
  await a.populate('assignedTo', 'name');
  res.json(agentOut(a, req.user));
}));

app.post('/api/agents/:id/notes', auth, allow(AGENT_CREATE), wrap(async (req, res) => {
  const a = await loadAgent(req, res, 'edit');
  if (!a) return;
  const note = String(req.body?.note || '').trim();
  if (!note) return res.status(400).json({ message: 'Write the discussion / communication note' });
  a.history.push({ note, by: req.user._id, byName: req.user.name });
  if (req.body?.followUpDate !== undefined) a.followUpDate = req.body.followUpDate || null;
  await a.save();
  await a.populate('assignedTo', 'name');
  res.json(agentOut(a, req.user));
}));

app.delete('/api/agents/:id', auth, allow(['super_admin']), wrap(async (req, res) => {
  const a = await Agent.findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Agent not found' });
  await a.deleteOne();
  res.json({ ok: true });
}));

// Storage used (Director) — to know when free space is getting full
let filesDb = null;
app.get('/api/storage', auth, allow(['super_admin']), wrap(async (req, res) => {
  const mb = (b) => Math.round((b || 0) / 1048576 * 10) / 10;
  const stat = async (db) => { try { const s = await db.stats(); return mb((s.storageSize || 0) + (s.indexSize || 0)) || mb(s.dataSize); } catch { return null; } };
  const separate = !!process.env.FILES_MONGODB_URI;
  const [mainMB, filesMB, docs, cands] = await Promise.all([
    stat(mongoose.connection.db), separate ? stat(filesDb) : null, DocFile.countDocuments(), Lead.countDocuments()
  ]);
  const sizeAgg = await DocFile.aggregate([{ $group: { _id: null, s: { $sum: '$size' } } }]);
  res.json({ limitMB: 512, mainMB, filesMB, separateFilesDb: separate, documents: docs, candidates: cands, documentsMB: mb(sizeAgg[0]?.s) });
}));

app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found' }));

// ---------- React build ----------
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  // Files in /assets have a unique name per build → browser can keep them for a year (opens faster next time)
  app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '365d', immutable: true }));
  app.use(express.static(distDir, { maxAge: 0 }));
  app.get(/^\/(?!api).*/, (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(distDir, 'index.html')); });
}

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Growcend MongoDB Connected Successfully');
    const filesConn = process.env.FILES_MONGODB_URI
      ? await mongoose.createConnection(process.env.FILES_MONGODB_URI).asPromise()
      : mongoose.connection;
    bucket = new mongoose.mongo.GridFSBucket(filesConn.db, { bucketName: 'documents' });
    mainBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'documents' });
    filesDb = filesConn.db;
    if (process.env.FILES_MONGODB_URI) console.log('📁 Separate database connected for documents');

    const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
    if (ADMIN_USERNAME && ADMIN_PASSWORD && (await User.countDocuments()) === 0) {
      if (ADMIN_PASSWORD.length < 8) console.error('❌ ADMIN_PASSWORD must be at least 8 characters');
      else {
        await User.create({ username: ADMIN_USERNAME, password: await bcrypt.hash(ADMIN_PASSWORD, 10),
          name: ADMIN_NAME || 'Director', role: 'super_admin', department: 'Management' });
        console.log(`👑 Super Admin "${ADMIN_USERNAME}" created`);
      }
    }
    await Settings.init().catch(() => {});
    app.listen(PORT, () => console.log(`🚀 Growcend Server running on port ${PORT}`));
  })
  .catch((err) => { console.error('❌ MongoDB Connection Error:', err.message); process.exit(1); });
