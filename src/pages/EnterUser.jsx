import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { persistLoginSession } from '../authSession.js'
import { SEARCH_API_ORIGIN } from '../searchNavigation.js'
import COUNTRIES from './countries.json'

/** Same-origin in Vite dev (see vite.config proxy); absolute when served from file/production build. */
function userApiBase() {
  return import.meta.env.DEV ? '' : SEARCH_API_ORIGIN
}

const OTP_WINDOW_S = 60

const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

/**
 * @param {string} pw
 * @returns {string | null}
 */
function validatePassword(pw) {
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`
  if (pw.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.'
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.'
  if (!/[0-9]/.test(pw)) return 'Password must include a number.'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include a symbol (for example ! @ # $).'
  return null
}

/**
 * @param {string} pw
 */
function passwordRuleChecks(pw) {
  return {
    len: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  }
}

/**
 * @param {{ maximumAge?: number, timeout?: number }} [opts]
 * @returns {Promise<{ latitude: number, longitude: number } | null>}
 */
function fetchCoordsOnce(opts = {}) {
  const { maximumAge = 120_000, timeout = 15_000 } = opts
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge, timeout },
    )
  })
}

/**
 * @param {{ open: boolean, onClose: () => void, onLoginSuccess?: () => void }} props
 */
export default function EnterUser({ open, onClose, onLoginSuccess }) {
  const titleId = useId()
  const dialogRef = useRef(null)

  const [tab, setTab] = useState(/** @type {'signup' | 'login'} */ ('signup'))

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [country, setCountry] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileFile, setProfileFile] = useState(/** @type {File | null} */ (null))
  const [profilePreview, setProfilePreview] = useState(/** @type {string | null} */ (null))

  const [lat, setLat] = useState(/** @type {number | null} */ (null))
  const [lng, setLng] = useState(/** @type {number | null} */ (null))

  const [signupStep, setSignupStep] = useState(/** @type {'form' | 'otp'} */ ('form'))
  const [expectedOtp, setExpectedOtp] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(OTP_WINDOW_S)
  const [otpExpired, setOtpExpired] = useState(false)
  const [lastSignupPayload, setLastSignupPayload] = useState(/** @type {Record<string, unknown> | null} */ (null))

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(/** @type {string | null} */ (null))
  const [otpError, setOtpError] = useState(/** @type {string | null} */ (null))
  const [infoMessage, setInfoMessage] = useState(/** @type {string | null} */ (null))

  const resetAll = useCallback(() => {
    setTab('signup')
    setEmail('')
    setUsername('')
    setCountry('')
    setPassword('')
    setConfirmPassword('')
    setProfileFile(null)
    setProfilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setLat(null)
    setLng(null)
    setSignupStep('form')
    setExpectedOtp('')
    setOtpInput('')
    setOtpSecondsLeft(OTP_WINDOW_S)
    setOtpExpired(false)
    setLastSignupPayload(null)
    setBusy(false)
    setFormError(null)
    setOtpError(null)
    setInfoMessage(null)
    setLoginEmail('')
    setLoginPassword('')
  }, [])

  useEffect(() => {
    if (!open) return
    resetAll()
  }, [open, resetAll])

  useEffect(() => {
    if (!open || signupStep !== 'otp') return
    setOtpSecondsLeft(OTP_WINDOW_S)
    setOtpExpired(false)
    const id = window.setInterval(() => {
      setOtpSecondsLeft((s) => {
        if (s <= 1) {
          setOtpExpired(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [open, signupStep, expectedOtp])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const c = await fetchCoordsOnce()
      if (!cancelled && c) {
        setLat(c.latitude)
        setLng(c.longitude)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || (lat != null && lng != null)) return
    const id = window.setInterval(() => {
      void (async () => {
        const c = await fetchCoordsOnce({ maximumAge: 0, timeout: 12_000 })
        if (c) {
          setLat(c.latitude)
          setLng(c.longitude)
        }
      })()
    }, 10_000)
    return () => window.clearInterval(id)
  }, [open, lat, lng])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const el = dialogRef.current
    if (!el) return
    const prev = document.activeElement
    el.focus()
    return () => {
      try {
        prev?.focus?.()
      } catch {
        /* ignore */
      }
    }
  }, [open])

  const onProfileChange = (e) => {
    const f = e.target.files?.[0] ?? null
    setProfileFile(f)
    if (profilePreview) URL.revokeObjectURL(profilePreview)
    setProfilePreview(f ? URL.createObjectURL(f) : null)
  }

  const readProfileAsDataUrl = () =>
    new Promise((resolve, reject) => {
      if (!profileFile) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => reject(new Error('Could not read profile image'))
      reader.readAsDataURL(profileFile)
    })

  const submitLogin = async (e) => {
    e.preventDefault()
    setFormError(null)
    setInfoMessage(null)

    const em = loginEmail.trim()
    if (!em || !loginPassword) {
      setFormError('Enter your email and password.')
      return
    }

    setBusy(true)
    try {
      const url = `${userApiBase()}/user/login`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, password: loginPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = typeof data?.error === 'string' ? data.error : `Login failed (${res.status})`
        throw new Error(err)
      }
      if (!data?.success || typeof data?.token !== 'string' || !data?.user || typeof data.user !== 'object') {
        throw new Error('Unexpected response from server')
      }
      persistLoginSession(data.token, data.user)
      setLoginPassword('')
      onLoginSuccess?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const postSignup = async (payload) => {
    const url = `${userApiBase()}/user/singup`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`
      throw new Error(err)
    }
    if (!data?.success || typeof data?.otp !== 'string') {
      throw new Error('Unexpected response from server')
    }
    return String(data.otp)
  }

  const submitSignup = async (e) => {
    e.preventDefault()
    setFormError(null)
    setInfoMessage(null)

    const em = email.trim()
    const un = username.trim()
    const ctry = country.trim()
    if (!em || !un || !ctry || !password || !confirmPassword) {
      setFormError('Please fill in every required field.')
      return
    }
    const pwErr = validatePassword(password)
    if (pwErr) {
      setFormError(pwErr)
      return
    }
    if (password !== confirmPassword) {
      setFormError('Password and confirmation do not match.')
      return
    }
    let useLat = lat
    let useLng = lng
    if (useLat == null || useLng == null) {
      const c = await fetchCoordsOnce({ maximumAge: 0, timeout: 5000 })
      if (c) {
        useLat = c.latitude
        useLng = c.longitude
        setLat(useLat)
        setLng(useLng)
      }
    }
    if (useLat == null || useLng == null) {
      useLat = 0
      useLng = 0
      setLat(0)
      setLng(0)
    }

    setBusy(true)
    try {
      let profilePicture = null
      try {
        profilePicture = await readProfileAsDataUrl()
      } catch {
        setFormError('Could not read the profile image.')
        setBusy(false)
        return
      }

      const payload = {
        email: em,
        username: un,
        country: ctry,
        password,
        latitude: useLat,
        longitude: useLng,
        ...(profilePicture ? { profilePicture } : {}),
      }

      const otp = await postSignup(payload)
      setLastSignupPayload(payload)
      setExpectedOtp(otp)
      setOtpInput('')
      setOtpError(null)
      setSignupStep('otp')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setBusy(false)
    }
  }

  const verifyOtp = (e) => {
    e.preventDefault()
    setOtpError(null)
    setInfoMessage(null)
    if (otpExpired) {
      setOtpError('This code has expired. Resend a new code or start over.')
      return
    }
    const entered = otpInput.trim()
    if (!entered) {
      setOtpError('Enter the verification code from your email.')
      return
    }
    if (entered !== expectedOtp) {
      setOtpError('That code does not match. Check the message in your inbox and try again.')
      return
    }
    setInfoMessage('Email verified. You can sign in below.')
    setSignupStep('form')
    setTab('login')
    setLoginEmail(email.trim())
    setPassword('')
    setConfirmPassword('')
    setOtpInput('')
    setExpectedOtp('')
    setLastSignupPayload(null)
  }

  const resendOtp = async () => {
    if (!lastSignupPayload) {
      setOtpError('Please go back and submit the signup form again.')
      return
    }
    setOtpError(null)
    setBusy(true)
    try {
      const otp = await postSignup(lastSignupPayload)
      setExpectedOtp(otp)
      setOtpInput('')
      setOtpExpired(false)
      setOtpSecondsLeft(OTP_WINDOW_S)
      setInfoMessage('A new code was sent. Check your email.')
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not resend the code')
    } finally {
      setBusy(false)
    }
  }

  const passwordChecks = useMemo(() => passwordRuleChecks(password), [password])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-5 backdrop-blur-md"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[1.35rem] border border-white/10 bg-slate-900/97 p-7 text-slate-100 shadow-2xl shadow-black/55 outline-none ring-1 ring-white/[0.06]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight text-white">
              Account
            </h2>
            <p className="mt-1.5 text-sm text-slate-400">Secure access to your synced sessions.</p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-6 flex gap-1 rounded-xl border border-white/[0.08] bg-black/25 p-1 text-sm">
          <button
            type="button"
            className={`flex-1 rounded-lg px-3 py-2.5 font-medium transition ${
              tab === 'signup' ? 'bg-blue-600 text-white shadow-md shadow-black/25' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
            onClick={() => {
              setTab('signup')
              setFormError(null)
              setInfoMessage(null)
            }}
          >
            Sign up
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-3 py-2.5 font-medium transition ${
              tab === 'login' ? 'bg-blue-600 text-white shadow-md shadow-black/25' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
            onClick={() => {
              setTab('login')
              setFormError(null)
              setInfoMessage(null)
            }}
          >
            Log in
          </button>
        </div>

        {infoMessage ? (
          <p className="mb-4 rounded-xl border border-blue-500/20 bg-blue-950/35 px-3.5 py-2.5 text-sm leading-relaxed text-blue-100/95">
            {infoMessage}
          </p>
        ) : null}

        {tab === 'login' ? (
          <form className="space-y-4" onSubmit={submitLogin}>
            {formError ? (
              <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200/90">
                {formError}
              </p>
            ) : null}
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="eu-login-email">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              id="eu-login-email"
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-blue-500/25 focus:border-blue-500 focus:ring-2"
              autoComplete="username"
            />
            <label className="mb-1 block text-xs text-slate-400" htmlFor="eu-login-pass">
              Password <span className="text-red-400">*</span>
            </label>
            <input
              id="eu-login-pass"
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-blue-500/25 focus:border-blue-500 focus:ring-2"
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-black/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <svg
                    className="h-4 w-4 shrink-0 animate-spin text-white/95"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-95"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Signing in…</span>
                </>
              ) : (
                'Log in'
              )}
            </button>
          </form>
        ) : signupStep === 'form' ? (
          <form className="space-y-3" onSubmit={submitSignup}>
            {formError ? (
              <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200/90">
                {formError}
              </p>
            ) : null}
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="eu-email">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                id="eu-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-blue-500/25 focus:border-blue-500 focus:ring-2"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="eu-user">
                Username <span className="text-red-400">*</span>
              </label>
              <input
                id="eu-user"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-blue-500/25 focus:border-blue-500 focus:ring-2"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="eu-country">
                Country <span className="text-red-400">*</span>
              </label>
              <select
                id="eu-country"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500/25 focus:border-blue-500 focus:ring-2"
                autoComplete="country-name"
              >
                <option value="">Select country…</option>
                {COUNTRIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="eu-pass">
                Password <span className="text-red-400">*</span>
              </label>
              <input
                id="eu-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-blue-500/25 focus:border-blue-500 focus:ring-2"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
              />
              <ul className="mt-2 space-y-1 text-[11px] leading-snug text-slate-500">
                <li className={passwordChecks.len ? 'text-emerald-400/95' : ''}>
                  {passwordChecks.len ? '✓' : '○'} {PASSWORD_MIN}–{PASSWORD_MAX} characters
                </li>
                <li className={passwordChecks.upper ? 'text-emerald-400/95' : ''}>
                  {passwordChecks.upper ? '✓' : '○'} One uppercase letter
                </li>
                <li className={passwordChecks.lower ? 'text-emerald-400/95' : ''}>
                  {passwordChecks.lower ? '✓' : '○'} One lowercase letter
                </li>
                <li className={passwordChecks.digit ? 'text-emerald-400/95' : ''}>
                  {passwordChecks.digit ? '✓' : '○'} One number
                </li>
                <li className={passwordChecks.symbol ? 'text-emerald-400/95' : ''}>
                  {passwordChecks.symbol ? '✓' : '○'} One symbol (not a letter or digit)
                </li>
              </ul>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="eu-pass2">
                Confirm password <span className="text-red-400">*</span>
              </label>
              <input
                id="eu-pass2"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-blue-500/25 focus:border-blue-500 focus:ring-2"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="eu-avatar">
                Profile picture (optional)
              </label>
              <input
                id="eu-avatar"
                type="file"
                accept="image/*"
                onChange={onProfileChange}
                className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-blue-100"
              />
              <div
                className="relative mt-2 w-20 shrink-0 overflow-hidden rounded-sm border border-slate-600 bg-slate-800/95 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-slate-700/80 aspect-[35/45]"
                role="img"
                aria-label={profilePreview ? 'Profile preview' : 'No profile photo — passport-style placeholder'}
              >
                {profilePreview ? (
                  <img src={profilePreview} alt="" className="h-full w-full object-cover object-top" />
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-black/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={verifyOtp}>
            <p className="text-sm text-slate-300">
              Enter the verification code we sent to <span className="font-medium text-blue-100">{email.trim()}</span>.
            </p>
            {otpError ? (
              <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200/90">
                {otpError}
              </p>
            ) : null}
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="eu-otp">
                Verification code
              </label>
              <input
                id="eu-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                className="w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-sm tracking-widest outline-none ring-blue-500/25 focus:border-blue-500 focus:ring-2"
                placeholder="6-digit code"
              />
            </div>
            <p className="text-xs text-slate-400">
              {otpExpired ? (
                <span className="text-amber-200/90">This code has expired.</span>
              ) : (
                <span>
                  Time remaining: <span className="font-mono tabular-nums text-blue-200">{otpSecondsLeft}s</span> of{' '}
                  {OTP_WINDOW_S}s
                </span>
              )}
            </p>
            <button
              type="submit"
              disabled={busy || otpExpired}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-black/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Verify email
            </button>
            {otpExpired ? (
              <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3">
                <p className="mb-2 text-sm text-slate-300">Would you like us to resend the code?</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void resendOtp()}
                  className="w-full rounded-xl border border-blue-500/40 bg-blue-950/40 py-2.5 text-sm font-medium text-blue-50 transition hover:bg-blue-900/35 disabled:opacity-50"
                >
                  {busy ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="w-full text-center text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
              onClick={() => {
                setSignupStep('form')
                setOtpInput('')
                setOtpError(null)
              }}
            >
              Back to form
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
