import { Route, Routes } from "react-router-dom";
import { HardwareProvider } from "./hooks/useHardwareForm";
import { CalculatorPage } from "./pages/CalculatorPage";
import { ModelReport } from "./features/report/ModelReport";

export function App() {
  return (
    <HardwareProvider>
      <Routes>
        <Route path="/" element={<CalculatorPage />} />
        <Route path="/model/:id" element={<ModelReport />} />
      </Routes>
    </HardwareProvider>
  );
}
