import { LogOut, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function AppHeader() {
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="fixed top-0 z-50 w-full border-t-2 border-[#4F46E5] border-b border-[#E2E8F0] bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Persist"
            className="h-8 w-8 rounded-lg object-cover shrink-0"
          />
          <span className="font-semibold text-slate-900">Persist</span>
          <span className="h-4 w-px bg-slate-200" aria-hidden />
          <span className="text-sm text-slate-400">
            Autonomous Prior Authorization
          </span>
        </div>
        <motion.div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {currentTime.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            {" · "}
            {currentTime.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt(
                "Update display name:",
                sessionStorage.getItem("persist_user") ?? ""
              );
              if (name && name.trim()) {
                sessionStorage.setItem("persist_user", name.trim());
                window.location.reload();
              }
            }}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-700"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem("persist_auth");
              sessionStorage.removeItem("persist_user");
              window.location.reload();
            }}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-700"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </motion.div>
      </div>
    </header>
  );
}
