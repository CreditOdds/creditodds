'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

// Key for storing email in localStorage for email link sign-in
const EMAIL_FOR_SIGN_IN_KEY = 'emailForSignIn';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
}

interface AuthContextType {
  authState: AuthState;
  signInWithGoogle: () => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  completeEmailLinkSignIn: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Action code settings for email link sign-in
const actionCodeSettings = {
  url: typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://creditodds.com/login',
  handleCodeInApp: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  });

  // Listen for auth state changes
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      console.warn('Firebase auth not available');
      setAuthState({ isAuthenticated: false, isLoading: false, user: null });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState({
        isAuthenticated: !!user,
        isLoading: false,
        user,
      });
    });

    return () => unsubscribe();
  }, []);

  // Check for email link sign-in on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const auth = getFirebaseAuth();
    if (!auth) return;

    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);

      if (!email) {
        // User opened the link on a different device, prompt for email
        email = window.prompt('Please provide your email for confirmation');
      }

      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
            // Clean up the URL
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((error) => {
            console.error('Error signing in with email link:', error);
          });
      }
    }
  }, []);

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase not initialized. Please check your environment variables.');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, []);

  // Send email link for passwordless sign-in
  const sendEmailLink = useCallback(async (email: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase not initialized. Please check your environment variables.');
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    // Save the email locally to complete sign-in if user opens link on same device
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
    }
  }, []);

  // Complete email link sign-in (for manual completion)
  const completeEmailLinkSignIn = useCallback(async (email: string) => {
    if (typeof window === 'undefined') return;
    const auth = getFirebaseAuth();
    if (!auth) return;

    if (isSignInWithEmailLink(auth, window.location.href)) {
      await signInWithEmailLink(auth, email, window.location.href);
      window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Sign out
  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
  }, []);

  // Get ID token for API calls
  const getToken = useCallback(async (): Promise<string | null> => {
    const auth = getFirebaseAuth();
    if (!auth) return null;
    const user = auth.currentUser;
    if (user) {
      return user.getIdToken();
    }
    return null;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authState,
        signInWithGoogle,
        sendEmailLink,
        completeEmailLinkSignIn,
        logout,
        getToken,
      }}
    >
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
