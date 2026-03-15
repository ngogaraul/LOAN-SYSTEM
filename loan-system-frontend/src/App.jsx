import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Applications from "./pages/Applications";
import ApplicationDetails from "./pages/ApplicationDetails";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import NewClient from "./pages/NewClient";
import EditFinancials from "./pages/EditFinancials";
import NewApplication from "./pages/NewApplication";
import Clients from "./pages/Clients";
import ClientDetails from "./pages/ClientDetails";
import Admin from "./pages/admin";

export default function App({ colorMode, onToggleColorMode }) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell colorMode={colorMode} onToggleColorMode={onToggleColorMode}><Dashboard /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/applications"
          element={
            <ProtectedRoute>
              <AppShell colorMode={colorMode} onToggleColorMode={onToggleColorMode}><Applications /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/applications/:id"
          element={
            <ProtectedRoute>
              <AppShell colorMode={colorMode} onToggleColorMode={onToggleColorMode}><ApplicationDetails /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/clients"
          element={
            <ProtectedRoute>
              <AppShell colorMode={colorMode} onToggleColorMode={onToggleColorMode}><Clients /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/clients/:id"
          element={
            <ProtectedRoute>
              <AppShell colorMode={colorMode} onToggleColorMode={onToggleColorMode}><ClientDetails /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/clients/new"
          element={
            <ProtectedRoute>
              <AppShell colorMode={colorMode} onToggleColorMode={onToggleColorMode}><NewClient /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/applications/new"
          element={
            <ProtectedRoute>
              <AppShell colorMode={colorMode} onToggleColorMode={onToggleColorMode}><NewApplication /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AppShell colorMode={colorMode} onToggleColorMode={onToggleColorMode}><Admin /></AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
