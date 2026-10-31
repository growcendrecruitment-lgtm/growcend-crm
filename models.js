import mongoose from 'mongoose';
import { ROLES, STATUSES, AGENT_STATUS, DEMAND_STATUS, INTERVIEW_STATUS, SELECTION_STATUS } from './constants.js';

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
  docAssignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // Documentation staff handling the file
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
leadSchema.index({ createdBy: 1 });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ docAssignedTo: 1 });
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
  store: { type: String, default: 'main' }, // 'main' DB or separate 'files' DB
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

// ---------- B2B Agents (separate register — never mixed with candidates) ----------
const agentNoteSchema = new Schema({
  note: str, system: { type: Boolean, default: false },
  by: { type: Schema.Types.ObjectId, ref: 'User' }, byName: str, at: { type: Date, default: Date.now }
});
const agentSchema = new Schema({
  agentId: { type: String, unique: true },
  agentName: { type: String, required: true, trim: true },
  companyName: str,
  contactPerson: str,
  phone: { type: String, required: true, trim: true },
  whatsapp: str,
  email: { type: String, trim: true, lowercase: true, default: '' },
  country: { type: String, trim: true, default: 'India' },
  city: str,
  address: str,
  agentType: str,
  manpower: str,          // available manpower
  jobCategories: str,     // interested job categories
  expectedRate: str,
  notes: str,             // telecaller notes
  followUpDate: Date,
  status: { type: String, enum: AGENT_STATUS, default: 'New Lead' },
  active: { type: Boolean, default: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' }, // auto = Bittu (B2B Counsellor)
  seenByB2B: { type: Boolean, default: false },              // notification for Bittu
  history: [agentNoteSchema],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdByName: str
}, { timestamps: true });
agentSchema.index({ createdAt: -1 });
agentSchema.index({ phone: 1 });
agentSchema.index({ createdBy: 1 });
agentSchema.pre('save', async function (next) {
  if (!this.agentId) { const n = await nextSeq('agent'); this.agentId = `AG-${n + 1000}`; }
  next();
});
export const Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);

// ---------- Job Demands (HR) ----------
const commissionLine = { type: { type: String, enum: ['fixed', 'percent'], default: 'fixed' }, value: { type: Number, default: 0 } };
const demandSchema = new Schema({
  demandId: { type: String, unique: true },
  country: { type: String, required: true, trim: true },
  employerName: str,
  recruitmentCompany: str,          // foreign recruitment company
  agentName: str,
  source: { type: String, trim: true, default: 'Direct Employer' },
  contactPerson: str, employerEmail: { type: String, trim: true, lowercase: true, default: '' }, employerWhatsapp: str,
  jobTitle: { type: String, required: true, trim: true },
  vacancies: { type: Number, default: 0 },
  salary: str, accommodation: str, food: str, workingHours: str, overtime: str,
  experience: str, ageRequirement: str, qualification: str, contractDuration: str, requiredDocuments: str,
  receivedDate: Date, closingDate: Date,
  // money (HR / Director only)
  rateFromEmployer: { type: Number, default: 0 },   // per candidate, ₹
  rateAgreed: { type: Number, default: 0 },         // per candidate, ₹
  paymentConditions: str,
  expectedRevenue: { type: Number, default: 0 },
  additionalCosts: { type: Number, default: 0 },
  commission: {
    counsellor: commissionLine, b2b: commissionLine, documentation: commissionLine, hr: commissionLine, other: commissionLine
  },
  status: { type: String, enum: DEMAND_STATUS, default: 'Open' },
  notes: str,
  assignments: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' }, userName: str, role: str,
    rate: str,              // approved rate for this employee / B2B rate
    target: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    note: str, assignedAt: { type: Date, default: Date.now }
  }],
  files: [{ type: { type: String }, filename: str, contentType: str, size: Number, fileId: Schema.Types.ObjectId,
    store: { type: String, default: 'main' }, uploadedByName: str, at: { type: Date, default: Date.now } }],
  history: [{ note: str, by: { type: Schema.Types.ObjectId, ref: 'User' }, byName: str, at: { type: Date, default: Date.now } }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdByName: str
}, { timestamps: true });
demandSchema.index({ createdAt: -1 });
demandSchema.index({ 'assignments.user': 1 });
demandSchema.pre('save', async function (next) {
  if (!this.demandId) { const n = await nextSeq('demand'); this.demandId = `DM-${n + 1000}`; }
  next();
});
export const Demand = mongoose.models.Demand || mongoose.model('Demand', demandSchema);

// One row = one candidate submitted against one demand (never twice)
const submissionSchema = new Schema({
  demand: { type: Schema.Types.ObjectId, ref: 'Demand', required: true, index: true },
  lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  leadId: str, candidateName: str, phone: str,
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true }, submittedByName: str, submittedByRole: str,
  agentName: str,               // when Bittu submits a B2B agent's candidate
  interviewStatus: { type: String, enum: INTERVIEW_STATUS, default: 'Not Scheduled' },
  interviewDate: Date,
  selectionStatus: { type: String, enum: SELECTION_STATUS, default: 'Pending' },
  sentToEmployer: { type: Boolean, default: false },   // Candidate file sent to employer by email: Yes / No
  sentDate: Date, sentTo: str, sentAttachments: str,
  employerResponse: str,
  remarks: str
}, { timestamps: true });
submissionSchema.index({ demand: 1, lead: 1 }, { unique: true });
export const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

// ---------- Company settings (single document) ----------
const settingsSchema = new Schema({
  _id: { type: String, default: 'main' },
  company: {
    name: { type: String, default: 'GROWCEND INDIA PRIVATE LIMITED' },
    address: str, city: str, state: str, pincode: str,
    phone: str, email: str, website: str, gstin: str, pan: str, cin: str, raLicense: str,
    logo: { type: String, default: '' } // small image as data URL, printed on bills
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
