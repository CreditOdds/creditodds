import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  Auth,
} from 'firebase/auth';
import { getAnalytics, Analytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Lazy initialization to ensure it only runs on the client
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let analytics: Analytics | undefined;

// getAuth() puts IndexedDB first in the persistence hierarchy, and on iOS
// Safari that is a wedge risk. WebKit tears the page's IndexedDB connection
// down whenever the tab is backgrounded or hidden, so an open during that
// window rejects with "InvalidStateError: Database is closing/hidden". Firebase
// retries four times with no backoff, then lets the rejection escape from
// initializeCurrentUser -> _initializationPromise. Nothing in the SDK holds a
// handler for that promise, so two things happen: Sentry records an unhandled
// rejection (CREDITODDS-JAVASCRIPT-NEXTJS-1G), and — worse — every
// onAuthStateChanged callback is chained off that same promise and therefore
// never fires. AuthProvider's isLoading would stay true for the rest of the
// page's life.
//
// localStorage first avoids the whole path: the selected persistence is read
// synchronously and cannot reject. IndexedDB stays in the hierarchy so an
// existing session stored there is still found and migrated to localStorage on
// first load (PersistenceUserManager.create wraps those reads in try/catch), so
// nobody gets signed out by this change. If localStorage is unavailable —
// Safari with "Block all cookies" — Firebase drops it from the hierarchy and
// falls back to IndexedDB, matching the previous behaviour.
//
// browserPopupRedirectResolver has to be passed explicitly: getAuth() supplies
// it by default, and signInWithPopup throws auth/operation-not-supported
// without it.
function createAuth(firebaseApp: FirebaseApp): Auth {
  try {
    return initializeAuth(firebaseApp, {
      persistence: [browserLocalPersistence, indexedDBLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // auth/already-initialized — another module (or a Fast Refresh reload)
    // got here first. Reuse whatever instance exists.
    return getAuth(firebaseApp);
  }
}

function getFirebaseAuth(): Auth | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  if (!firebaseConfig.apiKey) {
    console.error('Firebase config missing - API key not found. Check NEXT_PUBLIC_FIREBASE_API_KEY environment variable.');
    return undefined;
  }

  if (!app) {
    try {
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      auth = createAuth(app);

      // Initialize Analytics (only in browser, if supported, and not in development)
      if (process.env.NODE_ENV === 'production') {
        isSupported().then((supported) => {
          if (supported && app && !analytics) {
            analytics = getAnalytics(app);
            console.log('Firebase Analytics initialized');
          }
        });
      }

      console.log('Firebase initialized successfully');
    } catch (error) {
      console.error('Firebase initialization error:', error);
      return undefined;
    }
  }

  return auth;
}

// Get analytics instance (may be undefined if not yet initialized)
function getFirebaseAnalytics(): Analytics | undefined {
  return analytics;
}

// Export a getter function that initializes on first access
export { app, getFirebaseAuth, getFirebaseAnalytics };

// For backwards compatibility, also export auth but it will be initialized lazily
export const getAuth_lazy = getFirebaseAuth;
