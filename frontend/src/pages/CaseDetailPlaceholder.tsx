import { AppHeader } from "@/components/AppHeader";
import { Link, useParams } from "react-router-dom";

export function CaseDetailPlaceholder() {
  const { case_id } = useParams<{ case_id: string }>();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <AppHeader />
      <main className="pt-14">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Link
            to="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Back to queue
          </Link>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            Case detail
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Case detail is coming soon.
            {case_id ? (
              <span className="ml-1 font-mono text-slate-600">{case_id}</span>
            ) : null}
          </p>
        </div>
      </main>
    </div>
  );
}
