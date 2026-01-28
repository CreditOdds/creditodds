import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
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
      auth = getAuth(app);

      // Initialize Analytics (only in browser and if supported)
      isSupported().then((supported) => {
        if (supported && app && !analytics) {
          analytics = getAnalytics(app);
          console.log('Firebase Analytics initialized');
        }
      });

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
