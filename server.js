import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { User, Lead, DocFile, Payment, Settings, getSettings, nextSeq } from './models.js';
import {
  ROLES, STATUSES, DOC_TYPES, PAY_MODES, CAN_CREATE, CAN_EDIT, CAN_PAY, CAN_UPLOAD, CAN_VIEW_DOCS,
  CAN_SEE_FULL_IDS, normalizePhone, isPhone, isPincode, isAadhaar, isPAN, isPassport, isEmail, r2
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
  const s = await getSettings();
  s.company = { ...s.company.toObject(), ...company, gstin: String(company.gstin || '').toUpperCase(), pan: String(company.pan || '').toUpperCase() };
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
  'notes', 'packageAmount'];

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
  const o = lead.toObject ? lead.toObject() : lead;
  if (!CAN_SEE_FULL_IDS.includes(user.role)) {
    if (o.aadhaarNo) o.aadhaarNo = 'XXXX XXXX ' + o.aadhaarNo.slice(-4);
    if (o.panNo) o.panNo = 'XXXXX' + o.panNo.slice(5);
  }
  return o;
}

app.get('/api/leads', auth, wrap(async (req, res) => {
  const { q, status, serviceType, due, assigned } = req.query;
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
  if (due === 'today') filter.nextFollowUp = { $ne: null, $lte: endOfTodayIST() };
  const sort = due ? { nextFollowUp: 1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([
    Lead.find(filter).sort(sort).skip((page - 1) * limit).limit(limit)
      .select('leadId name phone address serviceType country job status nextFollowUp packageAmount paidAmount createdAt assignedTo')
      .populate('assignedTo', 'name'),
    Lead.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

app.get('/api/leads/stats', auth, wrap(async (req, res) => {
  const soon = new Date(Date.now() + 180 * 86400000);
  const [total, byStatus, dueToday, newThisMonth, payMonth, money, passportSoon] = await Promise.all([
    Lead.countDocuments(),
    Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lead.countDocuments({ nextFollowUp: { $ne: null, $lte: endOfTodayIST() } }),
    Lead.countDocuments({ createdAt: { $gte: startOfMonthIST() } }),
    Payment.aggregate([{ $match: { cancelled: false, date: { $gte: startOfMonthIST() } } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]),
    Lead.find({ packageAmount: { $gt: 0 } }).select('packageAmount paidAmount').lean(),
    Lead.countDocuments({ 'passport.expiryDate': { $ne: null, $lte: soon } })
  ]);
  const counts = Object.fromEntries(byStatus.filter((s) => s._id).map((s) => [s._id, s.count]));
  res.json({
    total, counts, dueToday, newThisMonth, passportSoon,
    collectedThisMonth: payMonth[0]?.sum || 0,
    pendingDues: r2(money.reduce((sum, l) => sum + Math.max(0, (l.packageAmount || 0) - (l.paidAmount || 0)), 0))
  });
}));

app.get('/api/leads/export.csv', auth, allow(['super_admin']), wrap(async (req, res) => {
  const leads = await Lead.find().sort({ createdAt: -1 }).populate('assignedTo', 'name').lean();
  const head = ['ID', 'Name', 'Father Name', 'DOB', 'Gender', 'Marital Status', 'Mobile', 'Alt Mobile', 'WhatsApp', 'Email',
    'Address', 'City', 'District', 'State', 'Pincode', 'Aadhaar', 'PAN', 'Passport No', 'Passport Expiry', 'ECR/ECNR',
    'Qualification', 'Trade', 'Experience (Yrs)', 'Service', 'Country', 'Job', 'Status', 'Source', 'Assigned To',
    'Package (Rs)', 'Paid (Rs)', 'Due (Rs)', 'Next Follow-up', 'Created On'];
  const rows = leads.map((l) => [l.leadId, l.name, l.fatherName, fmtDate(l.dob), l.gender, l.maritalStatus, l.phone, l.altPhone, l.whatsapp, l.email,
    l.address?.line, l.address?.city, l.address?.district, l.address?.state, l.address?.pincode, l.aadhaarNo, l.panNo,
    l.passport?.number, fmtDate(l.passport?.expiryDate), l.passport?.ecr, l.qualification, l.trade, l.experienceYears,
    l.serviceType, l.country, l.job, l.status, l.source, l.assignedTo?.name, l.packageAmount, l.paidAmount,
    (l.packageAmount || 0) - (l.paidAmount || 0), fmtDate(l.nextFollowUp), fmtDate(l.createdAt)]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="growcend-candidates-${fmtDate(new Date())}.csv"`);
  res.send(toCSV([head, ...rows]));
}));

app.get('/api/leads/:id', auth, wrap(async (req, res) => {
  const lead = await Lead.findById(req.params.id).populate('assignedTo', 'name');
  if (!lead) return res.status(404).json({ message: 'Candidate not found' });
  res.json(serializeLead(lead, req.user));
}));

app.post('/api/leads', auth, allow(CAN_CREATE), wrap(async (req, res) => {
  const { data, error } = cleanLeadInput(req.body || {}, req.user, true);
  if (error) return res.status(400).json({ message: error });
  const dup = await Lead.findOne({ phone: data.phone }).select('leadId name');
  if (dup) return res.status(409).json({ message: `This mobile number is already registered: ${dup.leadId} (${dup.name})`, existingId: dup._id });
  const lead = new Lead({ ...data, createdBy: req.user._id, createdByName: req.user.name });
  lead.followups.push({ note: `Candidate registered by ${req.user.name}`, system: true, by: req.user._id, byName: req.user.name });
  await lead.save();
  res.status(201).json(serializeLead(lead, req.user));
}));

app.patch('/api/leads/:id', auth, allow(CAN_EDIT), wrap(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ message: 'Candidate not found' });
  const { data, error } = cleanLeadInput(req.body || {}, req.user, false);
  if (error) return res.status(400).json({ message: error });
  if (data.phone && data.phone !== lead.phone) {
    const dup = await Lead.findOne({ phone: data.phone, _id: { $ne: lead._id } }).select('leadId name');
    if (dup) return res.status(409).json({ message: `This mobile number belongs to ${dup.leadId} (${dup.name})` });
  }
  if (data.status && data.status !== lead.status)
    lead.followups.push({ note: `Status changed: ${lead.status} → ${data.status}`, system: true, by: req.user._id, byName: req.user.name });
  lead.set(data);
  await lead.save();
  await lead.populate('assignedTo', 'name');
  res.json(serializeLead(lead, req.user));
}));

app.post('/api/leads/:id/followups', auth, wrap(async (req, res) => {
  const { note, outcome, nextDate, status } = req.body || {};
  if (!note && !outcome) return res.status(400).json({ message: 'Write a note or choose call outcome' });
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ message: 'Candidate not found' });
  lead.followups.push({ note, outcome, nextDate: nextDate || null, by: req.user._id, byName: req.user.name });
  lead.nextFollowUp = nextDate || null;
  if (status && STATUSES.includes(status) && status !== lead.status) {
    lead.followups.push({ note: `Status changed: ${lead.status} → ${status}`, system: true, by: req.user._id, byName: req.user.name });
    lead.status = status;
  }
  await lead.save();
  await lead.populate('assignedTo', 'name');
  res.json(serializeLead(lead, req.user));
}));

app.delete('/api/leads/:id', auth, allow(['super_admin']), wrap(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ message: 'Candidate not found' });
  if (await Payment.exists({ lead: lead._id, cancelled: false }))
    return res.status(400).json({ message: 'This candidate has payments. Cancel the invoices first.' });
  const docs = await DocFile.find({ lead: lead._id });
  for (const d of docs) await bucket.delete(d.fileId).catch(() => {});
  await DocFile.deleteMany({ lead: lead._id });
  await lead.deleteOne();
  res.json({ ok: true });
}));

// ---------- Documents (stored inside MongoDB GridFS — private, login required) ----------
let bucket;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

app.get('/api/leads/:id/documents', auth, wrap(async (req, res) => {
  res.json(await DocFile.find({ lead: req.params.id }).sort({ createdAt: -1 }).select('-fileId'));
}));

app.post('/api/leads/:id/documents', auth, allow(CAN_UPLOAD), wrap(async (req, res) => {
  const { type, filename, contentType, data } = req.body || {};
  if (!DOC_TYPES.includes(type)) return res.status(400).json({ message: 'Choose document type' });
  if (!ALLOWED_TYPES.includes(contentType)) return res.status(400).json({ message: 'Only JPG, PNG, WEBP images or PDF allowed' });
  if (!data) return res.status(400).json({ message: 'File missing' });
  const buf = Buffer.from(String(data).replace(/^data:[^,]+,/, ''), 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ message: 'File too large (max 6 MB)' });
  const lead = await Lead.findById(req.params.id).select('leadId');
  if (!lead) return res.status(404).json({ message: 'Candidate not found' });
  const safeName = String(filename || type).replace(/[^\w.\- ]/g, '_').slice(0, 80);
  const fileId = await new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(`${lead.leadId}-${safeName}`, { contentType, metadata: { lead: lead._id, type } });
    up.on('error', reject);
    up.on('finish', () => resolve(up.id));
    up.end(buf);
  });
  const doc = await DocFile.create({ lead: lead._id, type, filename: safeName, contentType, size: buf.length, fileId,
    uploadedBy: req.user._id, uploadedByName: req.user.name });
  await Lead.updateOne({ _id: lead._id }, { $push: { followups: { note: `Document uploaded: ${type}`, system: true, by: req.user._id, byName: req.user.name } } });
  const out = doc.toObject(); delete out.fileId;
  res.status(201).json(out);
}));

app.get('/api/documents/:docId/file', auth, allow(CAN_VIEW_DOCS), wrap(async (req, res) => {
  const doc = await DocFile.findById(req.params.docId);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  res.setHeader('Content-Type', doc.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
  bucket.openDownloadStream(doc.fileId).on('error', () => res.end()).pipe(res);
}));

app.delete('/api/documents/:docId', auth, allow(CAN_VIEW_DOCS), wrap(async (req, res) => {
  const doc = await DocFile.findById(req.params.docId);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  await bucket.delete(doc.fileId).catch(() => {});
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
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ message: 'Candidate not found' });
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
  const p = await Payment.findById(req.params.pid);
  if (!p) return res.status(404).json({ message: 'Invoice not found' });
  const lead = await Lead.findById(p.lead).select('leadId name packageAmount paidAmount');
  res.json({ payment: p, lead, settings: await getSettings() });
}));

app.get('/api/payments', auth, allow(['super_admin']), wrap(async (req, res) => {
  const { from, to, format } = req.query;
  const filter = {};
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

app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found' }));

// ---------- React build ----------
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
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
