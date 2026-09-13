import { Route, Routes } from "react-router-dom";
import { Nav } from "./components/Nav";
import { HardwareProvider } from "./hooks/useHardwareForm";
import { BrowsePage } from "./pages/BrowsePage";
import { CalculatorPage } from "./pages/CalculatorPage";
import { ModelReport } from "./features/report/ModelReport";
import { WelcomePage } from "./pages/WelcomePage";

export function App() {
  return (
    <HardwareProvider>
      <Nav />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/calculator" element={<CalculatorPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/model/:id" element={<ModelReport />} />
      </Routes>
    </HardwareProvider>
  );
}
