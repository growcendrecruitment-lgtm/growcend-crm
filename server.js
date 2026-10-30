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

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// ---------- Config checks ----------
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET missing or too short (min 32 characters). Set it in .env');
  if (isProd) process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/growcend_crm';

// ---------- App ----------
const app = express();
app.set('trust proxy', 1); // behind Nginx
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : (isProd ? false : true) }));

// ---------- Models ----------
export const ROLES = ['super_admin', 'telecaller', 'counsellor', 'b2b', 'documentation', 'hr'];

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, enum: ROLES },
  department: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);

export const LEAD_STATUSES = [
  'New Lead', 'Interested', 'Not Interested', 'Counselling Done',
  'Advance Payment Received', 'Documents Verified', 'Offer Letter Sent',
  'Permit Under Process', 'Visa Approved', 'Travel Booked', 'Deployed', 'Rejected'
];

const leadSchema = new mongoose.Schema({
  leadId: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  country: { type: String, trim: true, default: '' },
  job: { type: String, trim: true, default: '' },
  source: { type: String, trim: true, default: 'Telecalling' },
  status: { type: String, enum: LEAD_STATUSES, default: 'New Lead' },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Indexes keep search/list fast even with lakhs of records
leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ phone: 1 });

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 1000 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

leadSchema.pre('save', async function (next) {
  if (this.leadId) return next();
  const c = await Counter.findByIdAndUpdate('lead', { $inc: { seq: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  this.leadId = `GC-${c.seq}`;
  next();
});

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

// ---------- Middleware ----------
const auth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).select('-password');
    if (!user || !user.active) return res.status(401).json({ message: 'Account disabled or not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
};

const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Permission denied' });

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { message: 'Too many login attempts. Try again in 15 minutes.' } });

const publicUser = (u) => ({ id: u._id, name: u.name, username: u.username, role: u.role, department: u.department, active: u.active });

// ---------- Auth ----------
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  try {
    const user = await User.findOne({ username: String(username).toLowerCase().trim() });
    const ok = user && user.active && await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid username or password' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

// ---------- Users (Super Admin only) ----------
app.get('/api/users', auth, allow('super_admin'), async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users.map(publicUser));
});

app.post('/api/users/create', auth, allow('super_admin'), async (req, res) => {
  const { username, password, name, role, department } = req.body || {};
  if (!username || !password || !name || !role || !department) return res.status(400).json({ message: 'All fields are required' });
  if (String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });
  try {
    const hashedPassword = await bcrypt.hash(String(password), 10);
    const newUser = await User.create({ username, password: hashedPassword, name, role, department });
    res.status(201).json({ message: 'Employee User Created Successfully', user: publicUser(newUser) });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Username already exists' });
    res.status(400).json({ message: err.message });
  }
});

app.patch('/api/users/:id', auth, allow('super_admin'), async (req, res) => {
  const { active, password } = req.body || {};
  const update = {};
  if (typeof active === 'boolean') {
    if (String(req.params.id) === String(req.user._id) && !active) return res.status(400).json({ message: 'You cannot disable yourself' });
    update.active = active;
  }
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    update.password = await bcrypt.hash(String(password), 10);
  }
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(publicUser(user));
});

// ---------- Leads / Candidates ----------
// Paginated list: /api/leads?q=ramesh&status=Visa Approved,Travel Booked&page=1&limit=50
app.get('/api/leads', auth, async (req, res) => {
  const { q, status } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const filter = {};
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { leadId: rx }, { country: rx }, { job: rx }];
  }
  if (status) filter.status = { $in: String(status).split(',') };
  const [items, total] = await Promise.all([
    Lead.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('createdBy', 'name'),
    Lead.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

app.get('/api/leads/stats', auth, async (req, res) => {
  const [total, byStatus] = await Promise.all([
    Lead.countDocuments(),
    Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  res.json({ total, counts });
});

app.post('/api/leads', auth, allow('super_admin', 'telecaller', 'counsellor', 'b2b', 'hr'), async (req, res) => {
  const { name, phone, country, job, source, notes } = req.body || {};
  if (!name || !phone) return res.status(400).json({ message: 'Name and phone are required' });
  try {
    const lead = await Lead.create({ name, phone, country, job, source, notes, createdBy: req.user._id });
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch('/api/leads/:id', auth, async (req, res) => {
  const allowed = ['status', 'notes', 'country', 'job'];
  const update = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get('/api/meta', auth, (req, res) => res.json({ roles: ROLES, statuses: LEAD_STATUSES }));

app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

// ---------- Serve React build (production) ----------
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found' }));

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Growcend MongoDB Connected Successfully');
    // First-run: create Super Admin from env vars if no user exists yet (useful on free hosts without a terminal)
    const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
    if (ADMIN_USERNAME && ADMIN_PASSWORD && (await User.countDocuments()) === 0) {
      if (ADMIN_PASSWORD.length < 8) {
        console.error('❌ ADMIN_PASSWORD must be at least 8 characters');
      } else {
        await User.create({
          username: ADMIN_USERNAME, password: await bcrypt.hash(ADMIN_PASSWORD, 10),
          name: ADMIN_NAME || 'Director', role: 'super_admin', department: 'Management'
        });
        console.log(`👑 Super Admin "${ADMIN_USERNAME}" created`);
      }
    }
    app.listen(PORT, () => console.log(`🚀 Growcend Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });
