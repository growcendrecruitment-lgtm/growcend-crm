import mongoose from 'mongoose';
import { ROLES, STATUSES } from './constants.js';

const { Schema } = mongoose;
const str = { type: String, trim: true, default: '' };

// ---------- User ----------
const userSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, enum: ROLES },
  department: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });
export const User = mongoose.models.User || mongoose.model('User', userSchema);

// ---------- Counter (auto numbers: GC-1001, invoice numbers) ----------
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
export async function nextSeq(key, start = 0) {
  const c = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return start + c.seq;
}

// ---------- Candidate (stored in "leads" collection) ----------
const followupSchema = new Schema({
  note: str, outcome: str, nextDate: Date, system: { type: Boolean, default: false },
  by: { type: Schema.Types.ObjectId, ref: 'User' }, byName: str, at: { type: Date, default: Date.now }
});

const leadSchema = new Schema({
  leadId: { type: String, unique: true },

  // Personal
  name: { type: String, required: true, trim: true },
  fatherName: str,
  dob: Date,
  gender: str,
  maritalStatus: str,
  spouseName: str,
  childrenCount: Number,
  nationality: { type: String, trim: true, default: 'Indian' },

  // Contact
  phone: { type: String, required: true, trim: true },
  altPhone: str,
  whatsapp: str,
  email: { type: String, trim: true, lowercase: true, default: '' },

  // Address
  address: {
    line: str, city: str, district: str, state: str, pincode: str
  },

  // IDs
  aadhaarNo: str,
  panNo: str,
  passport: {
    number: str, issueDate: Date, expiryDate: Date, issuePlace: str, ecr: str
  },

  // Education & skills
  qualification: str,
  trade: str,
  experienceYears: Number,
  experienceDetails: str,
  englishLevel: str,

  // Requirement
  serviceType: { type: String, trim: true, default: 'Overseas Job Placement' },
  country: str,
  job: str,
  expectedSalary: str,

  // Process
  employer: { name: str, country: str, jobTitle: str, salary: str, offerDate: Date },
  visa: { type: str, applicationNo: str, status: str, appliedOn: Date, approvedOn: Date, expiryDate: Date },
  medical: { status: str, date: Date, center: str },
  pcc: { status: str, date: Date },
  travel: { date: Date, airline: str, ticketNo: str, from: str, to: str },

  // Sales
  source: { type: String, trim: true, default: 'Telecalling' },
  referredBy: str,
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: STATUSES, default: 'New Lead' },
  nextFollowUp: Date,
  notes: str,
  followups: [followupSchema],

  // Money (paidAmount is auto-updated from payments)
  packageAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },

  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdByName: str
}, { timestamps: true });

leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ nextFollowUp: 1 });
leadSchema.index({ 'address.pincode': 1 });

leadSchema.pre('save', async function (next) {
  if (!this.leadId) { const n = await nextSeq('lead'); this.leadId = `GC-${n < 1000 ? n + 1000 : n}`; }
  next();
});
export const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

// ---------- Documents (file itself lives in GridFS) ----------
const docSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  type: { type: String, required: true },
  filename: str,
  contentType: str,
  size: Number,
  fileId: Schema.Types.ObjectId,
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  uploadedByName: str
}, { timestamps: true });
export const DocFile = mongoose.models.DocFile || mongoose.model('DocFile', docSchema);

// ---------- Payments / Invoices ----------
const paymentSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  invoiceNo: { type: String, unique: true },
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true, min: 1 },
  mode: str,
  reference: str,
  purpose: str,
  description: str,
  gst: {
    applied: { type: Boolean, default: false },
    rate: Number, taxable: Number, cgst: Number, sgst: Number, igst: Number
  },
  billTo: { name: str, phone: str, address: str, state: str, pincode: str, passportNo: str, leadId: str },
  cancelled: { type: Boolean, default: false },
  cancelReason: str,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdByName: str
}, { timestamps: true });
paymentSchema.index({ date: -1 });
export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

// ---------- Company settings (single document) ----------
const settingsSchema = new Schema({
  _id: { type: String, default: 'main' },
  company: {
    name: { type: String, default: 'GROWCEND INDIA PRIVATE LIMITED' },
    address: str, city: str, state: str, pincode: str,
    phone: str, email: str, website: str, gstin: str, pan: str, cin: str, raLicense: str
  },
  bank: { name: str, account: str, ifsc: str, branch: str, upi: str },
  invoice: {
    prefix: { type: String, default: 'GC' },
    gstEnabled: { type: Boolean, default: true },
    gstRate: { type: Number, default: 18 },
    sac: { type: String, default: '998512' },
    terms: { type: String, default: 'Fees once paid are subject to the terms of the service agreement signed by the candidate.\nThis is a computer generated invoice.' }
  }
}, { timestamps: true });
export const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
export async function getSettings() {
  return (await Settings.findById('main')) || (await Settings.create({ _id: 'main' }));
}
