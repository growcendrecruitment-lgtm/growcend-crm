// Creates the first Super Admin account.
// Usage:  npm run seed -- <username> <password> "<Full Name>"
// Example: npm run seed -- director MyStrongPass@123 "Director Growcend"
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const [, , username, password, name = 'Director'] = process.argv;
if (!username || !password) {
  console.log('Usage: npm run seed -- <username> <password> "<Full Name>"');
  process.exit(1);
}
if (password.length < 8) {
  console.log('❌ Password must be at least 8 characters');
  process.exit(1);
}

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: String,
  role: String,
  department: String,
  active: { type: Boolean, default: true }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/growcend_crm');
const hash = await bcrypt.hash(password, 10);
await User.findOneAndUpdate(
  { username: username.toLowerCase() },
  { username: username.toLowerCase(), password: hash, name, role: 'super_admin', department: 'Management', active: true },
  { upsert: true, new: true }
);
console.log(`✅ Super Admin "${username}" ready. Ab is username/password se login karein.`);
await mongoose.disconnect();
