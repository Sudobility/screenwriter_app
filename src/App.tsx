import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "@sudobility/screenwriter_lib";
import { DashboardPage } from "./pages/DashboardPage";
import { EditorPage } from "./pages/EditorPage";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  const { status } = useAuth();
  if (status !== "signedIn") return <LoginPage />;
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/p/:projectId" element={<DashboardPage />} />
      <Route path="/d/:documentId" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
