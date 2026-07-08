import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@zorviz/ui";
import { useAuthStore } from "./stores/auth";
import { useAppConfigStore } from "./stores/app-config";
import { useLicenseStore } from "./stores/license";
import { LicenseArea } from "./components/license-area";
import { Toaster } from "./components/toaster";
import { ConfirmProvider } from "./components/confirm";
import { CloudSyncManager } from "./components/cloud-sync-manager";
import SetupPage from "./pages/setup";
import LoginPage from "./pages/login";
import DashboardPage from "./pages/dashboard";
import RepairPage from "./pages/repair";
import JobTicketPage from "./pages/job-ticket";
import AssetDetailPage from "./pages/asset-detail";
import JobsPage from "./pages/jobs";
import UsersPage from "./pages/users";
import SettingsPage from "./pages/settings";
import BookingsPage from "./pages/bookings";
import InventoryPage from "./pages/inventory";
import "@zorviz/ui/src/styles.css";
import "./dyslexia.css";
import "./stores/dyslexia"; // applies the persisted .dyslexic class at startup

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { isChecked, isSetup, fetchConfig } = useAppConfigStore();
  const fetchLicense = useLicenseStore((s) => s.fetchLicense);

  useEffect(() => {
    fetchConfig();
    fetchLicense();
  }, [fetchConfig, fetchLicense]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {!isChecked ? (
        <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
          Loading…
        </div>
      ) : (
        <ConfirmProvider>
          {isSetup && <LicenseArea />}
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
                  path="/repair/asset/:id"
                  element={isAuthenticated ? <AssetDetailPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/jobs"
                  element={isAuthenticated ? <JobsPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/users"
                  element={isAuthenticated ? <UsersPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/settings"
                  element={isAuthenticated ? <SettingsPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/bookings"
                  element={isAuthenticated ? <BookingsPage /> : <Navigate to="/login" />}
                />
                <Route
                  path="/inventory"
                  element={isAuthenticated ? <InventoryPage /> : <Navigate to="/login" />}
                />
                <Route path="*" element={<Navigate to="/" />} />
              </>
            )}
          </Routes>
          </HashRouter>
          <Toaster />
          <CloudSyncManager />
        </ConfirmProvider>
      )}
    </ThemeProvider>
  );
}

export default App;
