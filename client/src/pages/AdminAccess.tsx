import { useState } from "react";
import { ShieldCheck, LockKeyhole, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function AccessCard({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#061527] px-5 py-10 text-white"><div className="w-full max-w-md"><div className="mb-8 flex items-center justify-center gap-3"><div className="logo-mark"><span>W</span></div><div className="text-xl font-black">web<span className="text-cyan-400">otp</span></div></div><section className="rounded-3xl border border-white/10 bg-white p-7 text-slate-950 shadow-2xl sm:p-9"><div className="feature-icon"><ShieldCheck size={20} /></div><h1 className="mt-5 text-2xl font-black tracking-tight">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>{children}</section></div></main>;
}

export function AdminSetup() {
  const utils = trpc.useUtils();
  const mutation = trpc.setup.createAdmin.useMutation({ onSuccess: async () => { toast.success("Akun admin berhasil dibuat"); await utils.setup.status.invalidate(); }, onError: error => toast.error(error.message) });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (password !== confirmPassword) return toast.error("Konfirmasi password tidak sama"); mutation.mutate({ username, password, confirmPassword }); };
  return <AccessCard title="Buat akun admin" subtitle="Ini adalah langkah instalasi wajib. Website tidak dapat digunakan sebelum akun admin pertama dibuat."><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm font-bold">Username<input className="input mt-2 w-full" value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" autoComplete="username" required /></label><label className="block text-sm font-bold">Password admin<input className="input mt-2 w-full tracking-[0.5em]" value={password} onChange={e => setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" minLength={6} maxLength={6} placeholder="••••••" autoComplete="new-password" required /><span className="mt-1 block text-xs font-normal text-slate-400">Harus tepat 6 digit angka.</span></label><label className="block text-sm font-bold">Ulangi password<input className="input mt-2 w-full tracking-[0.5em]" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" minLength={6} maxLength={6} placeholder="••••••" autoComplete="new-password" required /></label><button className="btn-primary mt-3 w-full justify-center" disabled={mutation.isPending || password.length !== 6 || confirmPassword.length !== 6}>{mutation.isPending ? <Loader2 className="animate-spin" size={17} /> : <LockKeyhole size={17} />} Buat akun & buka web</button></form></AccessCard>;
}

export function AdminLogin() {
  const utils = trpc.useUtils();
  const mutation = trpc.setup.login.useMutation({ onSuccess: async () => { toast.success("Login berhasil"); await utils.setup.status.invalidate(); }, onError: error => toast.error(error.message) });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const submit = (event: React.FormEvent) => { event.preventDefault(); mutation.mutate({ username, password }); };
  return <AccessCard title="Login admin" subtitle="Masukkan akun admin untuk membuka webotp."><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm font-bold">Username<input className="input mt-2 w-full" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></label><label className="block text-sm font-bold">Password 6 digit<input className="input mt-2 w-full tracking-[0.5em]" value={password} onChange={e => setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" minLength={6} maxLength={6} autoComplete="current-password" required /></label><button className="btn-primary mt-3 w-full justify-center" disabled={mutation.isPending || password.length !== 6}>{mutation.isPending ? <Loader2 className="animate-spin" size={17} /> : <LockKeyhole size={17} />} Masuk</button></form></AccessCard>;
}
