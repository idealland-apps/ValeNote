import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, CircularProgress, Box } from '@mui/material';
import { getTheme } from './theme';
import { useAuthStore } from './stores/authStore';
import { useWebSocketStore } from './stores/websocketStore';
import { useSettingsStore } from './stores/settingsStore';
import { useSiteStore } from './stores/siteStore';
import LoginPage from './pages/LoginPage';
import MainPage from './pages/MainPage';
import PublicIndexPage from './pages/PublicIndexPage';
import PublicNotebookPage from './pages/PublicNotebookPage';
import NotificationBar from './components/NotificationBar';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, token } = useAuthStore();
  const { connect, disconnect } = useWebSocketStore();

  useEffect(() => {
    if (user && token) {
      connect(token);
    }
    return () => {
      disconnect();
    };
  }, [user, token, connect, disconnect]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <NotificationBar />
      {children}
    </>
  );
}

function App() {
  const { checkAuth } = useAuthStore();
  const { themeMode } = useSettingsStore();
  const { siteName, loadSiteName } = useSiteStore();
  const [systemDark, setSystemDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    checkAuth();
    loadSiteName();
  }, [checkAuth, loadSiteName]);

  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const effectiveMode = useMemo(() => {
    if (themeMode === 'system') {
      return systemDark ? 'dark' : 'light';
    }
    return themeMode;
  }, [themeMode, systemDark]);

  const theme = useMemo(() => getTheme(effectiveMode), [effectiveMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/public" element={<PublicIndexPage />} />
          <Route path="/public/:notebook/*" element={<PublicNotebookPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MainPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
