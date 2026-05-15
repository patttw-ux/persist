import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { CaseDetail } from "@/pages/CaseDetail";
import { Dashboard } from "@/pages/Dashboard";

function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/case/:case_id" element={<CaseDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
