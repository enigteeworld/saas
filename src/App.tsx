import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from '@/routes/AppRoutes';
import { initializeAuthListener, useAuthStore } from '@/stores/authStore';
import './App.css';

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    void initializeAuth();
    const unsubscribe = initializeAuthListener();
    return () => unsubscribe();
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
