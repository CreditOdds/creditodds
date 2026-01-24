'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { CognitoUser, AuthenticationDetails, CognitoUserSession } from "amazon-cognito-identity-js";
import Pool from "./user-pool";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType {
  authState: AuthState;
  authenticate: (email: string, password: string) => Promise<CognitoUserSession>;
  logout: () => void;
  getSession: () => Promise<CognitoUserSession>;
  forgot: (email: string) => Promise<unknown>;
  reset: (email: string, code: string, newPassword: string) => Promise<unknown>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
  });

  const getSession = useCallback(async (): Promise<CognitoUserSession> => {
    return new Promise((resolve, reject) => {
      const user = Pool.getCurrentUser();
      if (user) {
        user.getSession((err: Error | null, session: CognitoUserSession | null) => {
          if (err || !session) {
            setAuthState({ isAuthenticated: false, isLoading: false });
            reject(err);
          } else {
            setAuthState({ isAuthenticated: true, isLoading: false });
            resolve(session);
          }
        });
      } else {
        setAuthState({ isAuthenticated: false, isLoading: false });
        reject(new Error('No user'));
      }
    });
  }, []);

  useEffect(() => {
    getSession().catch(() => {
      // No active session - user is not logged in, which is expected
    });
  }, [getSession]);

  const authenticate = async (Username: string, Password: string): Promise<CognitoUserSession> => {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username,
        Pool,
      });
      const authDetails = new AuthenticationDetails({
        Username,
        Password,
      });
      user.authenticateUser(authDetails, {
        onSuccess: (data) => {
          setAuthState({ isAuthenticated: true, isLoading: false });
          resolve(data);
        },
        onFailure: (err) => {
          reject(err);
        },
        newPasswordRequired: (data) => {
          resolve(data);
        },
      });
    });
  };

  const logout = () => {
    const user = Pool.getCurrentUser();
    if (user) {
      setAuthState({ isAuthenticated: false, isLoading: false });
      user.signOut();
    }
  };

  const forgot = async (email: string): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: email,
        Pool,
      });
      user.forgotPassword({
        onSuccess: function (data) {
          resolve(data);
        },
        onFailure: function (err) {
          reject(err);
        },
      });
    });
  };

  const reset = async (email: string, verificationCode: string, newPassword: string): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: email,
        Pool: Pool,
      });
      user.confirmPassword(verificationCode, newPassword, {
        onSuccess(data) {
          resolve(data);
        },
        onFailure(err) {
          reject(err);
        },
      });
    });
  };

  return (
    <AuthContext.Provider value={{ authState, authenticate, logout, getSession, forgot, reset }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
