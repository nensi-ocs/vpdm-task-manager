import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { SidebarLayout } from "./layout/SidebarLayout";
import { LoginPage } from "./pages/LoginPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { FollowupClientsPage } from "./pages/FollowupClientsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TaskBoard } from "./TaskBoard";
import { AddTaskPage } from "./pages/AddTaskPage";

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="auth-page">
        <p style={{ color: "var(--text-muted)" }}>Loading session...</p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <SidebarLayout />;
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedLayout />}>
            <Route index element={<TaskBoard />} />
            <Route path="add-task" element={<AddTaskPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="followup-clients" element={<FollowupClientsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
