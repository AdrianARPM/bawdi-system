// src/App.jsx  — v3
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './context/authStore';

import LoginPage        from './pages/LoginPage';
import DashboardPage    from './pages/DashboardPage';
import SubmissionsPage  from './pages/SubmissionsPage';
import DetailPage       from './pages/DetailPage';
import NewFormPage      from './pages/NewFormPage';
import UsersPage        from './pages/UsersPage';
import DraftPage        from './pages/DraftPage';
import AnalyticsPage    from './pages/AnalyticsPage';
import Layout           from './components/Layout';

function PrivateRoute({ children, roles }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: 12, fontFamily: '"Figtree", sans-serif', fontSize: 14 },
          success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index                  element={<DashboardPage />} />
          <Route path="submissions"     element={<SubmissionsPage />} />
          <Route path="submissions/:id" element={<DetailPage />} />
          <Route path="new"             element={<PrivateRoute roles={['Operasional','Admin']}><NewFormPage /></PrivateRoute>} />
          <Route path="users"           element={<PrivateRoute roles={['Admin']}><UsersPage /></PrivateRoute>} />
          <Route path="draft"           element={<DraftPage />} />
          <Route path="analytics"       element={<PrivateRoute roles={['Admin','Verifikator','Approval','Operasional']}><AnalyticsPage /></PrivateRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
