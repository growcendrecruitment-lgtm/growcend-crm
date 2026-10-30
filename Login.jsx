import React, { useState } from 'react';
import { Globe, Plane, Lock } from 'lucide-react';
import { api, setToken } from './api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
      setToken(token);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-8 space-y-5">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-blue-900 flex flex-col items-center justify-center relative overflow-hidden border-4 border-blue-200">
            <Globe className="w-8 h-8 text-blue-200 absolute opacity-40" />
            <span className="z-10 text-[9px] font-bold text-white tracking-tighter">GROWCEND</span>
            <Plane className="w-3 h-3 text-amber-400 z-10 -rotate-45" />
          </div>
          <h1 className="text-lg font-extrabold text-blue-900">GROWCEND INDIA PVT LTD</h1>
          <p className="text-xs text-slate-500">Employee Login – Enterprise CRM</p>
        </div>

        <div className="space-y-3">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username"
            className="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password"
            className="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" required />
        </div>

        {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{error}</p>}

        <button disabled={loading} className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
          <Lock className="w-4 h-4" /> {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}
