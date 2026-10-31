// Shared lists & validators — used by BOTH the server (Node) and the browser (React)

export const ROLE_INFO = {
  super_admin: { label: 'Director / Super Admin', dept: 'Management', see: 'All candidates of the company.' },
  telecaller: { label: 'Telecaller', dept: 'Telecalling', see: 'You see only candidates YOU entered or that are assigned to you.' },
  counsellor: { label: 'Counsellor', dept: 'Counselling', see: 'You see only candidates YOU entered or that are assigned to you.' },
  b2b: { label: 'B2B Counsellor (Bittu) & Supervisor', dept: 'B2B & Supervisory', see: 'Your own candidates (can edit) + all Telecallers’ & Counsellors’ candidates (VIEW ONLY).' },
  documentation: { label: 'Documentation Staff', dept: 'Documentation', see: 'You see only files handed to you (Documentation Staff = you).' },
  hr: { label: 'HR / Int. Recruitment', dept: 'HR & Employers', see: 'Your own candidates + candidates in documentation process (VIEW ONLY).' }
};
export const ROLES = Object.keys(ROLE_INFO);

// Who can do what
export const CAN_CREATE = ['super_admin', 'telecaller', 'counsellor', 'b2b', 'hr'];
export const CAN_EDIT = ['super_admin', 'telecaller', 'counsellor', 'b2b', 'hr', 'documentation'];
export const CAN_PAY = ['super_admin', 'counsellor', 'b2b', 'documentation'];
export const CAN_ASSIGN_DOC = ['super_admin', 'counsellor', 'b2b', 'documentation']; // who can hand a file to a Documentation staff
export const COUNSELLOR_ROLES = ['counsellor', 'b2b'];   // "Assigned Counsellor" can be one of these
export const SUPERVISED_ROLES = ['telecaller', 'counsellor']; // Bittu (b2b) gets VIEW-ONLY access to these employees
export const AGENT_CREATE = ['super_admin', 'telecaller', 'counsellor', 'b2b'];
export const AGENT_MANAGE = ['super_admin', 'b2b']; // see & edit ALL B2B agents
export const CAN_UPLOAD = ['super_admin', 'documentation', 'counsellor', 'b2b'];
export const CAN_VIEW_DOCS = ['super_admin', 'documentation']; // Aadhaar/PAN/Passport images: private
export const CAN_SEE_FULL_IDS = ['super_admin', 'documentation'];

export const STATUSES = [
  'New Lead', 'Interested', 'Not Interested', 'Not Reachable', 'Call Back Later',
  'Counselling Done', 'Registered', 'Advance Payment Received', 'Documents Pending',
  'Documents Verified', 'Interview Scheduled', 'Selected', 'Offer Letter Sent',
  'Medical Done', 'Permit Under Process', 'Visa Applied', 'Visa Approved', 'Visa Rejected',
  'Travel Booked', 'Deployed', 'Rejected', 'Refund / Cancelled'
];

export const SERVICE_TYPES = ['Overseas Job Placement', 'Work Visa', 'Visit / Tourist Visa', 'Study Visa', 'Business Visa', 'Other'];
export const SOURCES = ['Telecalling', 'Walk-in', 'Reference', 'Facebook / Instagram', 'Website', 'Newspaper', 'B2B Agent', 'Other'];
export const GENDERS = ['Male', 'Female', 'Other'];
export const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];
export const QUALIFICATIONS = ['Below 10th', '10th', '12th', 'ITI', 'Diploma', 'Graduate', 'Post Graduate', 'Other'];
export const ENGLISH = ['None', 'Basic', 'Good', 'Fluent'];
export const ECR = ['ECR', 'ECNR'];
export const VISA_STATUS = ['Not Started', 'Documents Collected', 'Applied', 'Under Process', 'Approved', 'Rejected'];
export const MEDICAL_STATUS = ['Pending', 'Fit', 'Unfit'];
export const PCC_STATUS = ['Not Applied', 'Applied', 'Received'];
export const CALL_OUTCOMES = ['Spoke - Interested', 'Spoke - Not Interested', 'Not Reachable', 'Switched Off', 'Busy', 'Call Back Later', 'Visited Office', 'WhatsApp Sent'];

export const DOC_TYPES = [
  'Photo', 'Aadhaar Front', 'Aadhaar Back', 'PAN Card', 'Passport Front', 'Passport Back',
  '10th Marksheet', '12th Marksheet', 'Degree / Diploma', 'Experience Certificate', 'Resume / CV',
  'Medical Report', 'PCC (Police Clearance)', 'Offer Letter', 'Work Permit', 'Visa Copy',
  'Air Ticket', 'Bank Statement', 'Agreement / Consent', 'Other'
];
export const REQUIRED_DOCS = ['Photo', 'Aadhaar Front', 'Aadhaar Back', 'PAN Card', 'Passport Front', 'Passport Back'];

export const AGENT_TYPES = ['Indian Manpower Agency', 'Foreign Recruitment Company', 'Sub-Agent / Freelancer', 'Overseas Partner', 'Other'];
export const AGENT_STATUS = ['New Lead', 'Contacted', 'Demand Shared', 'Rate Shared', 'Negotiation', 'Active Partner', 'Follow-up Later', 'Not Interested', 'Inactive'];

// ---------- Job Demands (HR) ----------
export const DEMAND_MANAGE = ['super_admin', 'hr'];        // create / edit / assign demands, see rates
export const DEMAND_ASSIGNABLE = ['counsellor', 'b2b'];    // can receive a demand
export const DEMAND_SOURCES = ['Direct Employer', 'B2B Agent', 'Foreign Recruitment Agency', 'Overseas Partner', 'Other'];
export const DEMAND_STATUS = ['Open', 'On Hold', 'Closed', 'Completed'];
export const DEMAND_FILE_TYPES = ['Job Vacancy Poster', 'Employer Demand Image', 'Job Description PDF', 'Candidate Requirement Details'];
export const INTERVIEW_STATUS = ['Not Scheduled', 'Scheduled', 'Interview Done', 'No Show'];
export const SELECTION_STATUS = ['Pending', 'Shortlisted', 'Selected', 'Rejected', 'On Hold', 'Withdrawn'];
export const COMMISSION_KEYS = [
  ['counsellor', 'Counsellor Commission'], ['b2b', 'B2B Counsellor Commission'], ['documentation', 'Documentation Commission'],
  ['hr', 'HR Commission'], ['other', 'Other Approved Commission']
];
// value of one commission line per selected candidate (fixed ₹ or % of agreed rate)
export const commissionValue = (c = {}, rate = 0) =>
  (c.type === 'percent' ? (Number(c.value) || 0) * (Number(rate) || 0) / 100 : Number(c.value) || 0);
export const commissionTotal = (commission = {}, rate = 0) =>
  Math.round(COMMISSION_KEYS.reduce((s, [k]) => s + commissionValue(commission[k], rate), 0) * 100) / 100;

export const PAY_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'];
export const PAY_PURPOSES = [
  'Registration Fee', 'Advance Payment', 'Documentation Charges', 'Visa Processing Fee',
  'Service Charges', 'Medical / PCC Charges', 'Air Ticket', 'Final Payment', 'Other'
];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

// GST state codes (for "Place of Supply" on Tax Invoice)
export const STATE_CODES = {
  'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', Punjab: '03', Chandigarh: '04', Uttarakhand: '05', Haryana: '06',
  Delhi: '07', Rajasthan: '08', 'Uttar Pradesh': '09', Bihar: '10', Sikkim: '11', 'Arunachal Pradesh': '12', Nagaland: '13',
  Manipur: '14', Mizoram: '15', Tripura: '16', Meghalaya: '17', Assam: '18', 'West Bengal': '19', Jharkhand: '20', Odisha: '21',
  Chhattisgarh: '22', 'Madhya Pradesh': '23', Gujarat: '24', 'Dadra and Nagar Haveli and Daman and Diu': '26', Maharashtra: '27',
  Karnataka: '29', Goa: '30', Lakshadweep: '31', Kerala: '32', 'Tamil Nadu': '33', Puducherry: '34',
  'Andaman and Nicobar Islands': '35', Telangana: '36', 'Andhra Pradesh': '37', Ladakh: '38'
};
export const stateWithCode = (st) => (st ? (STATE_CODES[st] ? `${st} (${STATE_CODES[st]})` : st) : '');

// ---------- Validators ----------
export const normalizePhone = (v = '') => {
  let d = String(v).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
};
export const isPhone = (v) => /^[6-9]\d{9}$/.test(v || '');
export const isPincode = (v) => /^[1-9]\d{5}$/.test(v || '');
export const isAadhaar = (v) => /^[2-9]\d{11}$/.test(String(v || '').replace(/\s|-/g, ''));
export const isPAN = (v) => /^[A-Z]{5}\d{4}[A-Z]$/.test(v || '');
export const isPassport = (v) => /^[A-Z][0-9]{7}$/.test(v || '');
export const isAnyPhone = (v) => /^\d{7,15}$/.test(v || ''); // Indian or foreign (agents)
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');

// ---------- Money ----------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
const three = (n) => (n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n));
function words(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(words(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thousand) parts.push(two(thousand) + ' Thousand');
  if (n) parts.push(three(n));
  return parts.join(' ');
}
export function amountInWords(amount) {
  const total = Math.round(Number(amount || 0) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  return `Rupees ${words(rupees)}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}
export const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
