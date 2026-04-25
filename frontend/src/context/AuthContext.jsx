import { createContext, useContext, useState, useEffect } from "react";
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getToken,
  getStoredUser,
  setStoredUser,
} from "../services/authService.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      if (!getToken()) {
        setLoading(false);
        return;
      }

      const cachedUser = getStoredUser();
      if (cachedUser) {
        setUser(cachedUser);
      }

      try {
        const data = await getMe();
        setUser(data.user);
        setStoredUser(data.user);
      } catch (error) {
        if (error?.status === 401) {
          apiLogout();
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []);

  async function login(email, password) {
    const data = await apiLogin(email, password);
    setUser(data.user);
    setStoredUser(data.user);
    return data;
  }

  async function register(name, email, password) {
    const data = await apiRegister(name, email, password);
    setUser(data.user);
    setStoredUser(data.user);
    return data;
  }

  function logout() {
    apiLogout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
