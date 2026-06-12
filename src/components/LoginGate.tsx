/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import db from '../db';
import { Profile } from '../types';
import { Lock, User, KeyRound, Sparkles, AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';

interface LoginGateProps {
  onLoginSuccess: (user: Profile) => void;
}

export default function LoginGate({ onLoginSuccess }: LoginGateProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Dynamic delay to feel authentic and prevent brute-force feeling
    setTimeout(() => {
      const trimmedUser = username.trim().toLowerCase();
      const trimmedPass = password.trim();

      if (!trimmedUser || !trimmedPass) {
        setError('Please enter both User ID and Secret Password.');
        setIsSubmitting(false);
        return;
      }

      // Fetch official current profiles list (which includes usernames + passwords synchronised in real time)
      const profiles = db.getProfiles();
      const matchedUser = profiles.find(p => 
        p.username?.toLowerCase() === trimmedUser && 
        p.password === trimmedPass
      );

      if (matchedUser) {
        // Save session locally to persist state on refresh
        localStorage.setItem('hf_session_logged_in', 'true');
        localStorage.setItem('hf_session_user_id', matchedUser.id);
        
        // Update DB current user
        db.setCurrentUser(matchedUser);
        
        // Success callback
        onLoginSuccess(matchedUser);
      } else {
        setError('Unauthorized credentials. This internal system is secured.');
        setIsSubmitting(false);
      }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col justify-center py-12 sm:px-6 lg:px-8 select-none font-sans relative overflow-hidden">
      
      {/* Abstract geometric background accents */}
      <div className="absolute top-[-25%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#1A2E4A]/5 blur-3xl rounded-full" />
      <div className="absolute bottom-[-20%] right-[-15%] w-[50%] h-[50%] rounded-full bg-blue-600/5 blur-3xl rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1A2E4A] flex items-center justify-center shadow-md">
            <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#1A2E4A] tracking-wider font-sans">HARRY FASHION</h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Internal Workshop Ledger</p>
          </div>
        </div>
        <h2 className="mt-6 text-center text-sm font-bold tracking-tight text-slate-700">
          Enter Authorized Credentials to Unlock System
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200/60 space-y-6">
          
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-xs text-rose-700 font-semibold animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                <p className="text-[10px] text-rose-500/85 mt-1 font-medium font-sans">Only exactly 3 system clearance keys are registered.</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                System User ID
              </label>
              <div className="mt-1.5 relative rounded-lg shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin, billing, issue"
                  autoComplete="username"
                  className="block w-full py-2.5 pl-10 pr-3.5 text-xs font-semibold rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1A2E4A] focus:border-[#1A2E4A] focus:bg-white transition"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                Secret Access Password
              </label>
              <div className="mt-1.5 relative rounded-lg shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="block w-full py-2.5 pl-10 pr-10 text-xs font-semibold rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1A2E4A] focus:border-[#1A2E4A] focus:bg-white transition"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-[#1A2E4A] cursor-pointer"
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#1A2E4A] to-[#2D3E5D] hover:from-[#14233a] hover:to-[#22304d] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1A2E4A] shadow-md hover:shadow-lg active:scale-98 transition disabled:opacity-55 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {isSubmitting ? 'Authenticating Terminal Key...' : 'Unlock System Access'}
            </button>
          </form>

          {/* Secure System Details Notice */}
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-3.5">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-extrabold text-[#1A2E4A] tracking-wider uppercase">System Security Status</span>
            </div>
            
            <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
              Only three global roles are permitted. If you are an employee on duty, sign in with your role-specific credentials. Passwords can be changed by the Owner in the Administrator Panel.
            </p>

            {/* Quick reference guide for staging/demo login review as requested for testing */}
            <hr className="border-slate-200/60" />
            
            <details className="group cursor-pointer select-none">
              <summary className="text-[9px] text-[#1A2E4A] font-bold uppercase tracking-wider hover:underline flex items-center justify-between list-none">
                <span>View Authorized Keys (Internal Reference Only)</span>
                <span className="transition duration-200 group-open:rotate-180">▼</span>
              </summary>
              <div className="mt-3 text-[10px] space-y-2 bg-white p-3 rounded-lg border border-slate-200/60 font-mono text-slate-650">
                <div className="flex justify-between border-b pb-1">
                  <span><strong>Owner:</strong> admin</span>
                  <span className="text-blue-600">admin789</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span><strong>Billing:</strong> billing</span>
                  <span className="text-blue-600">billing456</span>
                </div>
                <div className="flex justify-between">
                  <span><strong>Issue:</strong> issue</span>
                  <span className="text-blue-600">issue123</span>
                </div>
              </div>
            </details>
          </div>

        </div>
      </div>

      <div className="mt-8 text-center text-[10px] font-bold text-slate-450 uppercase tracking-widest">
        HARRY FASHION SYSTEM LABS • REGIONAL PORT: 3000 • SECURED
      </div>
    </div>
  );
}
