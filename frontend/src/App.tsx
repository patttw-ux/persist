import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { CaseDetailPlaceholder } from "@/pages/CaseDetailPlaceholder";
import { Dashboard } from "@/pages/Dashboard";

function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/case/:case_id" element={<CaseDetailPlaceholder />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
