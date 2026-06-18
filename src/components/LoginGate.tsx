/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import db from '../db';
import { Profile, UserRole } from '../types';
import { Lock, User, KeyRound, Sparkles, AlertCircle, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, firestore } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface LoginGateProps {
  onLoginSuccess: (user: Profile) => void;
}

export default function LoginGate({ onLoginSuccess }: LoginGateProps) {
  const [activeMode, setActiveMode] = useState<'signin' | 'signup'>('signin');
  
  // Sign In inputs
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Register inputs
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('issue_dept');
  const [regPassword, setRegPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper: map standard username to domain email for secure Firebase Auth
  const mapUsernameToEmail = (uname: string): string => {
    const trimmed = uname.trim();
    if (trimmed.includes('@')) {
      return trimmed;
    }
    return `${trimmed.toLowerCase()}@harryfashion.com`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setError('Please provide your System User ID and Access Password.');
      setIsSubmitting(false);
      return;
    }

    try {
      const email = mapUsernameToEmail(trimmedUser);
      // Firebase Auth attempt
      const userCredential = await signInWithEmailAndPassword(auth, email, trimmedPass);
      const fbUser = userCredential.user;

      // Fetch official user profile from Firestore to confirm role & active status
      const profileRef = doc(firestore, 'profiles', fbUser.uid);
      const profileDoc = await getDoc(profileRef);

      if (profileDoc.exists()) {
        const data = profileDoc.data();
        if (data.active === false) {
          setError('This system profile is inactive. Please contact your manager.');
          setIsSubmitting(false);
          return;
        }

        const matchedProfile: Profile = {
          uid: data.uid || fbUser.uid,
          id: data.uid || fbUser.uid,
          displayName: data.displayName || data.name || email.split('@')[0],
          name: data.displayName || data.name || email.split('@')[0],
          email: data.email || fbUser.email || email,
          role: data.role || 'issue_dept',
          username: data.username || email.split('@')[0],
          active: data.active !== undefined ? data.active : true,
          createdAt: data.createdAt || data.created_at || new Date().toISOString(),
          updatedAt: data.updatedAt || data.updated_at || new Date().toISOString()
        };

        // Cache session
        localStorage.setItem('hf_session_logged_in', 'true');
        localStorage.setItem('hf_session_user_id', matchedProfile.id);
        db.setCurrentUser(matchedProfile);

        onLoginSuccess(matchedProfile);
      } else {
        // Fallback: create profile if it is a fresh auth user but no doc
        let computedRole: UserRole = 'issue_dept';
        if (
          email.toLowerCase() === 'k64561148@gmail.com' ||
          email.toLowerCase() === 'admin@harryfashion.com' ||
          email.toLowerCase().includes('admin') ||
          email.toLowerCase().includes('owner')
        ) {
          computedRole = 'admin';
        } else if (email.toLowerCase().includes('billing')) {
          computedRole = 'billing';
        }

        const fallbackProfile: Profile = {
          uid: fbUser.uid,
          id: fbUser.uid,
          displayName: trimmedUser,
          name: trimmedUser,
          email: email,
          role: computedRole,
          username: trimmedUser,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await setDoc(profileRef, fallbackProfile);
        
        localStorage.setItem('hf_session_logged_in', 'true');
        localStorage.setItem('hf_session_user_id', fallbackProfile.id);
        db.setCurrentUser(fallbackProfile);
        
        onLoginSuccess(fallbackProfile);
      }
    } catch (err: any) {
      console.error('Login authentication rejected:', err);
      // Secure, generic error message to safeguard against credentials discovery
      setError('Incorrect username or password. This internal system is secured.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const trimmedName = regDisplayName.trim();
    const trimmedUser = regUsername.trim();
    const trimmedPass = regPassword.trim();

    if (!trimmedName || !trimmedUser || !trimmedPass) {
      setError('Please complete all file fields to register.');
      setIsSubmitting(false);
      return;
    }

    if (trimmedPass.length < 6) {
      setError('Access password must be at least 6 characters long.');
      setIsSubmitting(false);
      return;
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(trimmedUser)) {
      setError('System User ID can only contain letters, numbers, hyphens, and underscores.');
      setIsSubmitting(false);
      return;
    }

    try {
      localStorage.setItem('hf_registration_in_progress', 'true');
      const email = mapUsernameToEmail(trimmedUser);
      // Create account in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, trimmedPass);
      const fbUser = userCredential.user;

      const profilePayload: Profile = {
        uid: fbUser.uid,
        id: fbUser.uid,
        displayName: trimmedName,
        name: trimmedName,
        email: email,
        role: regRole,
        username: trimmedUser.toLowerCase(),
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store security metadata in Firestore
      const profileRef = doc(firestore, 'profiles', fbUser.uid);
      await setDoc(profileRef, profilePayload);

      setSuccessMsg('Employee registered successfully! Automatically checking in...');
      
      setTimeout(() => {
        localStorage.setItem('hf_session_logged_in', 'true');
        localStorage.setItem('hf_session_user_id', profilePayload.id);
        db.setCurrentUser(profilePayload);
        onLoginSuccess(profilePayload);
      }, 1000);

    } catch (err: any) {
      localStorage.removeItem('hf_registration_in_progress');
      console.error('Registration failed:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This System User ID is already occupied by another employee.');
      } else {
        setError(err.message || 'Verification rejected. Unable to register profile.');
      }
    } finally {
      localStorage.removeItem('hf_registration_in_progress');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col justify-center py-12 sm:px-6 lg:px-8 select-none font-sans relative overflow-hidden">
      
      {/* Abstract geometric background accents */}
      <div className="absolute top-[-25%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#1A2E4A]/5 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-15%] w-[50%] h-[50%] rounded-full bg-blue-600/5 blur-3xl" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1A2E4A] flex items-center justify-center shadow-md">
            <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#1A2E4A] tracking-wider">HARRY FASHION</h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Internal Workshop Ledger</p>
          </div>
        </div>
        <h2 className="mt-5 text-center text-xs font-bold tracking-tight text-slate-500 uppercase tracking-widest">
          Secure Multi-Privilege Access Gateway
        </h2>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4 sm:px-0">
        
        {/* Toggle mode buttons */}
        <div className="flex bg-slate-200/75 p-1 rounded-xl mb-3 border border-slate-300/40">
          <button
            type="button"
            onClick={() => { setActiveMode('signin'); setError(null); setSuccessMsg(null); }}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition ${
              activeMode === 'signin' 
                ? 'bg-[#1A2E4A] text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            Sign In Access
          </button>
          <button
            type="button"
            onClick={() => { setActiveMode('signup'); setError(null); setSuccessMsg(null); }}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition ${
              activeMode === 'signup' 
                ? 'bg-[#1A2E4A] text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            Register Employee
          </button>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200/60 space-y-6">
          
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-xs text-rose-700 font-semibold animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="leading-snug">{error}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-xs text-emerald-700 font-semibold">
              <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="leading-snug">{successMsg}</p>
              </div>
            </div>
          )}

          {activeMode === 'signin' ? (
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
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-[#1A2E4A]"
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
                {isSubmitting ? 'Authenticating...' : 'Unlock System Access'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                  Employee Display Name
                </label>
                <div className="mt-1.5 relative rounded-lg shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    placeholder="e.g. Kevin Billing, Sundar Dept"
                    className="block w-full py-2.5 pl-10 pr-3.5 text-xs font-semibold rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1A2E4A] focus:border-[#1A2E4A] focus:bg-white transition"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                  Choose System User ID (Username)
                </label>
                <div className="mt-1.5 relative rounded-lg shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value.toLowerCase())}
                    placeholder="e.g. kevin, sundar, harry"
                    className="block w-full py-2.5 pl-10 pr-3.5 text-xs font-semibold rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1A2E4A] focus:border-[#1A2E4A] focus:bg-white transition"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                  Assigned Team Privilege Role
                </label>
                <div className="mt-1.5">
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as UserRole)}
                    className="block w-full py-2.5 px-3 text-xs font-semibold rounded-lg bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1A2E4A] focus:border-[#1A2E4A] focus:bg-white transition"
                    disabled={isSubmitting}
                  >
                    <option value="issue_dept">📦 Issue Dept (Material Issue + Inwards)</option>
                    <option value="billing">💼 Billing Dept (General Invoices + summary)</option>
                    <option value="admin">👑 Owner Admin (Unlimited operations & controls)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                  Set Access Password
                </label>
                <div className="mt-1.5 relative rounded-lg shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="block w-full py-2.5 pl-10 pr-10 text-xs font-semibold rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1A2E4A] focus:border-[#1A2E4A] focus:bg-white transition"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-[#1A2E4A]"
                    disabled={isSubmitting}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-750 to-blue-800 hover:from-blue-800 hover:to-blue-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-800 shadow-md hover:shadow-lg active:scale-98 transition disabled:opacity-55 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                {isSubmitting ? 'Registering employee...' : 'Register & Unlock System'}
              </button>
            </form>
          )}

          {/* Secure System Details Notice */}
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-3 font-sans">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-extrabold text-[#1A2E4A] tracking-wider uppercase">System Security Status</span>
            </div>
            
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Every staff member gets credentials verified in real time against encrypted Firestore records. To transition, simple log out from the workbench taskbar and log in with standard credentials.
            </p>
          </div>

        </div>
      </div>

      <div className="mt-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        HARRY FASHION SYSTEM LABS • REGIONAL PORT: 3000 • SECURED
      </div>
    </div>
  );
}
