import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { I18nProvider } from "./contexts/I18nContext";
import ProtectedRoute from "./components/ProtectedRoute";

const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const SuperAdminDashboard = lazy(() => import("./pages/super-admin/Dashboard"));
const SuperAdminQuestions = lazy(() => import("./pages/super-admin/Questions"));
const SuperAdminTests = lazy(() => import("./pages/super-admin/Tests"));
const SuperAdminClients = lazy(() => import("./pages/super-admin/Clients"));
const SuperAdminSettings = lazy(() => import("./pages/super-admin/Settings"));
const SuperAdminMessages = lazy(() => import("./pages/super-admin/Messages"));
const SuperAdminResponses = lazy(() => import("./pages/super-admin/Responses"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminTests = lazy(() => import("./pages/admin/Tests"));
const AdminEmployees = lazy(() => import("./pages/admin/Employees"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminMessages = lazy(() => import("./pages/admin/Messages"));
const ParticipantDashboard = lazy(() => import("./pages/participant/Dashboard"));
const ParticipantTests = lazy(() => import("./pages/participant/Tests"));
const ParticipantProfile = lazy(() => import("./pages/participant/Profile"));
const ParticipantMessages = lazy(() => import("./pages/participant/Messages"));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">
      Chargement...
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrandingProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />

              <Route path="/super-admin/dashboard" element={<ProtectedRoute role="SUPER_ADMIN"><SuperAdminDashboard /></ProtectedRoute>} />
              <Route path="/super-admin/questions"  element={<ProtectedRoute role="SUPER_ADMIN"><SuperAdminQuestions /></ProtectedRoute>} />
              <Route path="/super-admin/tests"      element={<ProtectedRoute role="SUPER_ADMIN"><SuperAdminTests /></ProtectedRoute>} />
              <Route path="/super-admin/clients"    element={<ProtectedRoute role="SUPER_ADMIN"><SuperAdminClients /></ProtectedRoute>} />
              <Route path="/super-admin/settings"   element={<ProtectedRoute role="SUPER_ADMIN"><SuperAdminSettings /></ProtectedRoute>} />
              <Route path="/super-admin/messages"   element={<ProtectedRoute role="SUPER_ADMIN"><SuperAdminMessages /></ProtectedRoute>} />
              <Route path="/super-admin/responses"  element={<ProtectedRoute role="SUPER_ADMIN"><SuperAdminResponses /></ProtectedRoute>} />

              <Route path="/admin/dashboard"  element={<ProtectedRoute role="CLIENT_ADMIN"><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/tests"      element={<ProtectedRoute role="CLIENT_ADMIN"><AdminTests /></ProtectedRoute>} />
              <Route path="/admin/employees"  element={<ProtectedRoute role="CLIENT_ADMIN"><AdminEmployees /></ProtectedRoute>} />
              <Route path="/admin/settings"   element={<ProtectedRoute role="CLIENT_ADMIN"><AdminSettings /></ProtectedRoute>} />
              <Route path="/admin/messages"   element={<ProtectedRoute role="CLIENT_ADMIN"><AdminMessages /></ProtectedRoute>} />

              <Route path="/participant/dashboard" element={<ProtectedRoute role="EMPLOYEE"><ParticipantDashboard /></ProtectedRoute>} />
              <Route path="/participant/tests"     element={<ProtectedRoute role="EMPLOYEE"><ParticipantTests /></ProtectedRoute>} />
              <Route path="/participant/profile"   element={<ProtectedRoute role="EMPLOYEE"><ParticipantProfile /></ProtectedRoute>} />
              <Route path="/participant/messages"  element={<ProtectedRoute role="EMPLOYEE"><ParticipantMessages /></ProtectedRoute>} />

              <Route path="/"  element={<Navigate to="/login" replace />} />
              <Route path="*"  element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrandingProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
