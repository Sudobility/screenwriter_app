import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "@sudobility/screenwriter_lib";
import { DashboardPage } from "./pages/DashboardPage";
import { EditorPage } from "./pages/EditorPage";
import { KeysPage } from "./pages/KeysPage";
import { LoginPage } from "./pages/LoginPage";

function NotFoundPage() { return <main className="mx-auto max-w-2xl px-4 py-16 text-center"><h1>404</h1><p>Page Not Found</p><a href="/">Go to Home</a></main>; }

export function App() {
  const { status } = useAuth();
  if (status !== "signedIn") return <LoginPage />;
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/p/:projectId" element={<DashboardPage />} />
      <Route path="/settings/keys" element={<KeysPage />} />
      <Route path="/d/:documentId" element={<EditorPage />} />
      <Route path="404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
