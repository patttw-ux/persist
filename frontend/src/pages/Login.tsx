import { Lock, Loader2, Shield, ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

const VALID_EMAIL = "admin@persisthealth.com";
const VALID_PASSWORD = "persist2026";

type LoginProps = {
  onLogin: () => void;
};

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      sessionStorage.setItem("persist_auth", "true");
      sessionStorage.setItem("persist_user", email);
      onLogin();
    } else {
      setError("Invalid credentials. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8">
          <div className="flex items-center">
            <Shield className="h-8 w-8 text-blue-500" aria-hidden />
            <span className="ml-2 text-2xl font-bold text-white">Persist</span>
            <span className="text-2xl font-bold text-blue-500">Health</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Autonomous Prior Authorization Agent
          </p>
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-800 bg-green-950 px-3 py-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-green-400" aria-hidden />
          <p className="text-xs text-green-400">
            HIPAA Compliant — All PHI encrypted at rest and in transit
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            className="mb-1 block text-xs text-slate-400"
            htmlFor="login-email"
          >
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="admin@persisthealth.com"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
            disabled={loading}
          />

          <label
            className="mb-1 mt-4 block text-xs text-slate-400"
            htmlFor="login-password"
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
            disabled={loading}
          />

          {error ? (
            <p className="mt-2 text-xs text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                Sign in to Persist
              </>
            ) : (
              "Sign in to Persist"
            )}
          </button>
        </form>

        <div className="mt-4 rounded-lg bg-slate-800 p-3 text-xs text-slate-400">
          <p>Demo credentials:</p>
          <p className="mt-2 text-slate-300 font-mono">Email: admin@persisthealth.com</p>
          <p className="mt-0.5 font-mono text-slate-300">
            Password: persist2026
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          <Lock className="mr-1 inline h-3 w-3 align-text-bottom text-slate-600" aria-hidden />
          Protected by HIPAA-compliant infrastructure
        </p>
      </div>
    </div>
  );
}
