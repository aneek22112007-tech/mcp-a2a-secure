import React, { useState, useEffect } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { AuthLayout } from './AuthLayout';
import { register, googleLogin } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

/* ---------- Shared style tokens ---------- */
const inputWrapStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  padding: '0.9rem 1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.65rem',
  fontWeight: 500,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: 'rgba(255,255,255,0.45)',
  marginBottom: '0.4rem',
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: '#fff',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  width: '100%',
};

const tagStyle: React.CSSProperties = {
  fontSize: '0.55rem',
  fontWeight: 600,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: '#FE6E44',
  padding: '0.2rem 0.5rem',
  border: '1px solid rgba(254,110,68,0.3)',
  borderRadius: '3px',
  background: 'rgba(254,110,68,0.06)',
  fontFamily: 'var(--font-body)',
  whiteSpace: 'nowrap' as const,
};

const oauthBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.6rem',
  width: '100%',
  padding: '0.8rem 1rem',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  color: 'rgba(255,255,255,0.75)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.2s, border-color 0.2s',
};

export const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [entropy, setEntropy] = useState(0);

  // Focus states
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const checks = {
    length: password.length >= 10,
    casing: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };

  useEffect(() => {
    if (!password) { setEntropy(0); return; }
    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/[0-9]/.test(password)) pool += 10;
    if (/[^A-Za-z0-9]/.test(password)) pool += 32;
    setEntropy(pool > 0 ? Math.floor(Math.log2(Math.pow(pool, password.length))) : 0);
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!checks.length || !checks.casing || !checks.number || !checks.symbol) {
      setError('Password must meet all cryptographic requirements.');
      return;
    }
    if (!agreed) { setError('You must agree to the Terms of Service.'); return; }
    setLoading(true);
    try {
      const response = await register(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError('Google sign-in failed: no credential returned.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await googleLogin(credentialResponse.credential);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google sign-in was cancelled or failed.');
  };

  const checkItem = (ok: boolean, label: string) => (
    <span style={{
      display: 'flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.65rem', fontFamily: 'var(--font-body)', letterSpacing: '0.06em',
      color: ok ? '#FE6E44' : 'rgba(255,255,255,0.3)',
      transition: 'color 0.2s',
    }}>
      <span>{ok ? '●' : '○'}</span> {label}
    </span>
  );

  return (
    <AuthLayout isSignUp>
      {/* Heading */}
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(1.5rem, 4vw, 2rem)',
        fontWeight: 900,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        color: '#fff',
        lineHeight: 1.05,
        marginBottom: '0.5rem',
      }}>
        Create your<br/>Account
      </h1>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.8rem',
        color: 'rgba(255,255,255,0.45)',
        marginBottom: '2rem',
        letterSpacing: '0.02em',
      }}>
        Start securing agent tool executions in seconds.
      </p>

      {/* OAuth Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '2rem' }}>
        <button type="button" style={oauthBtnStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
          </svg>
          Continue with GitHub
        </button>
        {/* Official Google Sign-In button — powered by @react-oauth/google */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            useOneTap={false}
            theme="filled_black"
            shape="rectangular"
            size="large"
            text="continue_with"
            logo_alignment="left"
          />
        </div>
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
          Or continue with work email
        </span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {error && (
          <div style={{
            background: 'rgba(254,110,68,0.08)', border: '1px solid rgba(254,110,68,0.3)',
            borderRadius: '6px', padding: '0.75rem 1rem', color: '#FE6E44',
            fontFamily: 'var(--font-body)', fontSize: '0.8rem',
          }}>
            {error}
          </div>
        )}

        {/* Full Name */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label htmlFor="name" style={labelStyle}>Full Name</label>
            <span style={{ ...tagStyle, color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.1)', background: 'transparent' }}>Author_ID</span>
          </div>
          <div style={{ ...inputWrapStyle, borderColor: nameFocused ? 'rgba(254,110,68,0.5)' : 'rgba(255,255,255,0.1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <input id="name" type="text" required placeholder="Ada Lovelace"
              value={fullName} onChange={e => setFullName(e.target.value)}
              onFocus={() => setNameFocused(true)} onBlur={() => setNameFocused(false)}
              style={inputStyle} />
          </div>
        </div>

        {/* Work Email */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label htmlFor="email" style={labelStyle}>Work Email</label>
            <span style={tagStyle}>Enterprise_Domain</span>
          </div>
          <div style={{ ...inputWrapStyle, borderColor: emailFocused ? 'rgba(254,110,68,0.5)' : 'rgba(255,255,255,0.1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            <input id="email" type="email" required placeholder="name@company.io"
              value={email} onChange={e => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)} onBlur={() => setEmailFocused(false)}
              style={inputStyle} />
          </div>
        </div>

        {/* Password */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <span style={{ ...tagStyle, color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.1)', background: 'transparent' }}>
              Entropy: {entropy} bits
            </span>
          </div>
          <div style={{ ...inputWrapStyle, borderColor: passFocused ? 'rgba(254,110,68,0.5)' : 'rgba(255,255,255,0.1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input id="password" type={showPassword ? 'text' : 'password'} required placeholder="Create secure password"
              value={password} onChange={e => setPassword(e.target.value)}
              onFocus={() => setPassFocused(true)} onBlur={() => setPassFocused(false)}
              style={{ ...inputStyle, letterSpacing: showPassword ? '0.02em' : '0.15em' }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'rgba(255,255,255,0.35)' }}>
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          {/* Password checks */}
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.6rem', paddingLeft: '0.25rem' }}>
            {checkItem(checks.length, '10+ chars')}
            {checkItem(checks.casing, 'Upper + Lower')}
            {checkItem(checks.number, 'Number')}
            {checkItem(checks.symbol, 'Symbol')}
          </div>
        </div>

        {/* Terms */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <input type="checkbox" id="terms" checked={agreed} onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: '2px', width: '14px', height: '14px', accentColor: '#FE6E44', flexShrink: 0 }} />
          <label htmlFor="terms" style={{ ...labelStyle, marginBottom: 0, textTransform: 'none', letterSpacing: '0.02em', fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
            I agree to the <a href="#" style={{ color: '#fff', textDecoration: 'underline' }}>Terms of Service</a>,{' '}
            <a href="#" style={{ color: '#fff', textDecoration: 'underline' }}>Privacy Policy</a>, and cryptographic sandbox attestation requirements.
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit" disabled={loading}
          style={{
            width: '100%',
            padding: '0.95rem',
            background: loading ? 'rgba(254,110,68,0.5)' : '#FE6E44',
            border: 'none',
            borderRadius: '6px',
            color: '#000',
            fontFamily: 'var(--font-display)',
            fontSize: '0.75rem',
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            marginTop: '0.25rem',
            transition: 'background 0.2s',
            boxShadow: '0 0 24px rgba(254,110,68,0.2)',
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#FF7C56'; }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#FE6E44'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          {loading ? 'Initializing Enclave...' : 'Create Account'}
        </button>
      </form>
    </AuthLayout>
  );
};
