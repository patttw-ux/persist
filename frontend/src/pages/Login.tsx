import { Check, Loader2 } from "lucide-react";

import type { FormEvent } from "react";

import { useState } from "react";



const VALID_EMAIL = "admin@persisthealth.com";

const VALID_PASSWORD = "persist2026";



type LoginProps = {

  onLogin: () => void;

};



const VALUE_PROPS = [

  "81.7% appeal overturn rate",

  "Zero physician time required",

  "HIPAA compliant — PHI encrypted at rest",

] as const;



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

    <div className="flex min-h-screen w-full">

      <aside className="relative hidden min-h-screen w-[480px] shrink-0 flex-col justify-between bg-[#3730A3] p-12 md:flex">

        <div className="flex flex-1 flex-col items-center justify-center">

          <img
            src="/logo.png"
            alt="Persist"
            className="h-20 w-20 rounded-2xl object-cover"
          />

          <h1 className="mt-6 text-4xl font-bold text-white">Persist</h1>

          <p className="mt-2 text-lg text-indigo-200">

            Autonomous Prior Authorization Agent

          </p>

          <ul className="mt-10 w-full max-w-sm space-y-4">

            {VALUE_PROPS.map((text) => (

              <li key={text} className="flex items-start gap-3">

                <Check className="h-5 w-5 shrink-0 text-white" aria-hidden />

                <span className="text-sm text-white">{text}</span>

              </li>

            ))}

          </ul>

          <div className="mt-10 w-full max-w-sm border-t border-white/10 pt-6">

            <p className="text-xs text-indigo-300 font-medium uppercase tracking-wider">

              Trusted by healthcare practices

            </p>

            <div className="mt-3 flex items-center gap-4">

              <span className="text-xs text-indigo-200">HIPAA Compliant</span>

              <span className="w-px h-3 bg-indigo-400/40" />

              <span className="text-xs text-indigo-200">SOC 2 Ready</span>

              <span className="w-px h-3 bg-indigo-400/40" />

              <span className="text-xs text-indigo-200">FHIR R4</span>

            </div>

          </div>

        </div>

        <p className="text-xs text-indigo-300">

          Powered by Jac Graph Intelligence

        </p>

      </aside>



      <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-16 bg-white">

        <div className="w-full max-w-sm">

          <div className="mb-8 flex items-center gap-2">

            <img
              src="/logo.png"
              alt="Persist"
              className="h-7 w-7 rounded-lg object-cover"
            />

            <span className="font-semibold text-slate-900">Persist</span>

          </div>

          <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>

          <p className="mt-1 text-sm text-slate-500">

            Sign in to your Persist workspace

          </p>



          <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm">

            <label

              className="block text-sm font-medium text-slate-700"

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

              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"

              disabled={loading}

            />



            <label

              className="mt-4 block text-sm font-medium text-slate-700"

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

              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"

              disabled={loading}

            />



            {error ? (

              <p className="mt-2 text-xs text-red-600" role="alert">

                {error}

              </p>

            ) : null}



            <button

              type="submit"

              disabled={loading}

              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-60"

            >

              {loading ? (

                <>

                  <Loader2

                    className="h-4 w-4 shrink-0 animate-spin"

                    aria-hidden

                  />

                  Sign in to Persist

                </>

              ) : (

                "Sign in to Persist"

              )}

            </button>

          </form>



          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-500">

            <p>Demo credentials:</p>

            <p className="mt-2">Email: admin@persisthealth.com</p>

            <p className="mt-0.5">Password: persist2026</p>

          </div>

        </div>

      </main>

    </div>

  );

}

