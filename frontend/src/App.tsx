import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { CaseDetail } from "@/pages/CaseDetail";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem("persist_auth") === "true"
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const sessionMs = 15 * 60 * 1000;
    const logout = () => {
      sessionStorage.removeItem("persist_auth");
      sessionStorage.removeItem("persist_user");
      setIsAuthenticated(false);
      toast.info("Session expired — signed out for HIPAA compliance");
    };

    let timeoutId = window.setTimeout(logout, sessionMs);
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logout, sessionMs);
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [isAuthenticated]);

  return (
    <>
      <Toaster richColors position="top-right" />
      {!isAuthenticated ? (
        <Login onLogin={() => setIsAuthenticated(true)} />
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/case/:caseId" element={<CaseDetail />} />
          </Routes>
        </BrowserRouter>
      )}
    </>
  );
}

export default App;
