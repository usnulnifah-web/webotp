import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

type AuthMode = "login" | "register";
type AuthPageProps = { mode: AuthMode };

export default function AuthPage({ mode: initialMode }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(needsOtp ? "/api/auth/verify-email" : mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(needsOtp ? { email, otp } : mode === "register" ? { name, email, password } : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Permintaan tidak berhasil. Coba lagi.");
      if (mode === "login" && !needsOtp) { window.location.assign("/"); return; }
      if (mode === "register" && !needsOtp) { setNeedsOtp(true); setNotice("Jika email dapat diverifikasi, kode OTP telah dikirim. Periksa inbox dan folder spam."); return; }
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan jaringan. Coba lagi.");
    } finally { setBusy(false); }
  };

  const switchMode = (next: AuthMode) => { setMode(next); setNeedsOtp(false); setOtp(""); setError(""); setNotice(""); };

  return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-5"><div className="w-full max-w-md"><Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> Kembali ke webotp</Link><section className="panel p-7 sm:p-9"><div className="logo-mark"><span>W</span></div><div className="mt-6"><p className="section-kicker">Akun pelanggan WebOTP</p><h1 className="mt-2 text-3xl font-black tracking-tight">{needsOtp ? "Verifikasi email" : mode === "login" ? "Masuk dengan email" : "Buat akun pelanggan"}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{needsOtp ? `Masukkan kode enam digit yang dikirim ke ${email}. Kode berlaku 10 menit.` : "Login langsung ke WebOTP menggunakan email dan password. Tidak melalui login Manus."}</p></div>
    <form onSubmit={submit} className="mt-7 space-y-4">{mode === "register" && !needsOtp && <label className="block text-sm font-bold text-slate-700">Nama<input className="input mt-1.5 w-full" required autoComplete="name" minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder="Nama Anda" /></label>}<label className="block text-sm font-bold text-slate-700">Email<input className="input mt-1.5 w-full" required type="email" autoComplete="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} disabled={needsOtp} placeholder="nama@contoh.com" /></label>{mode === "register" && needsOtp ? <label className="block text-sm font-bold text-slate-700">Kode OTP<input className="input mt-1.5 w-full text-center font-mono text-xl tracking-[.4em]" required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" minLength={6} maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></label> : <label className="block text-sm font-bold text-slate-700">Password<input className="input mt-1.5 w-full" required type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" ? "Minimal 12 karakter" : "Password Anda"} /></label>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{notice && <div role="status" className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">{notice}</div>}
    <button className="btn-primary w-full" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : needsOtp ? <ShieldCheck size={16} /> : mode === "login" ? <KeyRound size={16} /> : <Mail size={16} />}{busy ? "Memproses…" : needsOtp ? "Verifikasi dan masuk" : mode === "login" ? "Masuk" : "Kirim kode OTP"}</button>
    </form>
    {mode === "register" && !needsOtp && <p className="mt-4 text-xs leading-5 text-slate-400">Gunakan password unik minimal 12 karakter. WebOTP menyimpan hash scrypt, bukan password yang bisa dibaca.</p>}
    <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">{mode === "login" ? <>Belum punya akun? <button className="font-bold text-cyan-800" onClick={() => switchMode("register")}>Daftar dengan email</button></> : <>Sudah punya akun? <button className="font-bold text-cyan-800" onClick={() => switchMode("login")}>Masuk</button></>}</div>
    {needsOtp && <button className="mt-3 w-full text-center text-xs font-bold text-slate-500" onClick={() => { setNeedsOtp(false); setOtp(""); setNotice(""); setError(""); }}>Kembali ke formulir pendaftaran</button>}
    </section><p className="mt-5 text-center text-xs text-slate-400">Sesi dilindungi cookie HttpOnly dan kedaluwarsa setelah 12 jam.</p></div></main>;
}
