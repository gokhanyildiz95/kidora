import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import type { Role } from '@kidora/shared';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { AttendancePage } from './pages/Attendance';
import { ChildrenPage } from './pages/Children';
import { ChildDetailPage } from './pages/ChildDetail';
import { ClassroomsPage } from './pages/Classrooms';
import { PeoplePage } from './pages/People';
import { DailyPage } from './pages/Daily';
import { DailyReportPage } from './pages/DailyReport';
import { CalendarPage } from './pages/Calendar';
import { MessagesPage } from './pages/Messages';

function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;

  return (
    <BrowserRouter>
      {user ? (
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route
              path="attendance"
              element={
                <RoleGate roles={['ADMIN', 'TEACHER']}>
                  <AttendancePage />
                </RoleGate>
              }
            />
            <Route
              path="daily"
              element={
                <RoleGate roles={['ADMIN', 'TEACHER']}>
                  <DailyPage />
                </RoleGate>
              }
            />
            <Route path="children" element={<ChildrenPage />} />
            <Route path="children/:id/report" element={<DailyReportPage />} />
            <Route path="children/:id" element={<ChildDetailPage />} />
            <Route
              path="classrooms"
              element={
                <RoleGate roles={['ADMIN', 'TEACHER']}>
                  <ClassroomsPage />
                </RoleGate>
              }
            />
            <Route
              path="people"
              element={
                <RoleGate roles={['ADMIN']}>
                  <PeoplePage />
                </RoleGate>
              }
            />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="messages/:childId" element={<MessagesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      ) : (
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
