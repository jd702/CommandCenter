import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

const authMode = process.env.REACT_APP_AUTH_MODE || "disabled";
const demoUsername = process.env.REACT_APP_DEMO_USERNAME || "";
const demoPassword = process.env.REACT_APP_DEMO_PASSWORD || "";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(
    authMode === "disabled" ? { username: "local-operator" } : null
  );

  const login = (username, password) => {
    if (
      authMode === "demo" &&
      demoUsername &&
      demoPassword &&
      username === demoUsername &&
      password === demoPassword
    ) {
      setUser({ username });
      return true;
    }
    return false;
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  return useContext(AuthContext);
}
