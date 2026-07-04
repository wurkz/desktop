import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@zorviz/ui";
import { useAuthStore } from "./stores/auth";
import { useAppConfigStore } from "./stores/app-config";
import SetupPage from "./pages/setup";
import LoginPage from "./pages/login";
import DashboardPage from "./pages/dashboard";
import RepairPage from "./pages/repair";
import JobTicketPage from "./pages/job-ticket";
import JobsPage from "./pages/jobs";
import "@zorviz/ui/src/styles.css";

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { isChecked, isSetup, fetchConfig } = useAppConfigStore();

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {!isChecked ? (
        <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
          Loading…
        </div>
      ) : (
        <HashRouter>
          <Routes>
            {!isSetup ? (
              <>
                <Route path="/setup" element={<SetupPage />} />
                <Route path="*" element={<Navigate to="/setup" />} />
              </>
            ) : (
              <>
                <Route
                  path="/login"
                  element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />}
                />
                <Route
                  path="/"
                  element={isAuthenticated ? <DashboardPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/repair"
                  element={isAuthenticated ? <RepairPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/repair/ticket/:id"
                  element={isAuthenticated ? <JobTicketPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/jobs"
                  element={isAuthenticated ? <JobsPage /> : <Navigate to="/login" />}
                />
                <Route path="*" element={<Navigate to="/" />} />
              </>
            )}
          </Routes>
        </HashRouter>
      )}
    </ThemeProvider>
  );
}

export default App;
