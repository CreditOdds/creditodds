import "./tailwind.output.css";
import React, { useContext, Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { HelmetProvider } from "react-helmet-async";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ErrorBoundary from "./components/ErrorBoundary";
import { Account, AccountContext } from "./auth/Account";
import "react-toastify/dist/ReactToastify.css";

// Lazy load page components for code splitting
const Landing = lazy(() => import("./pages/Landing"));
const Card = lazy(() => import("./pages/Card"));
const Terms = lazy(() => import("./pages/Terms"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Privacy = lazy(() => import("./pages/Privacy"));
const How = lazy(() => import("./pages/How"));
const Contact = lazy(() => import("./pages/Contact"));
const About = lazy(() => import("./pages/About"));
const Forgot = lazy(() => import("./pages/Forgot"));
const Profile = lazy(() => import("./pages/Profile"));

// Loading component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <Account>
          <ToastContainer />
          <Router>
            <Navbar />
            <Suspense fallback={<LoadingFallback />}>
              <Switch>
                <Route path='/login' component={Login} />
                <Route path='/register' component={Register} />
                <Route exact path='/' component={Landing} />
                <Route path='/card/:name' component={Card} />
                <Route exact path='/how' component={How} />
                <Route path='/about' component={About} />
                <Route path='/terms' component={Terms} />
                <Route path='/privacy' component={Privacy} />
                <Route path='/contact' component={Contact} />
                <Route path='/forgot' component={Forgot} />
                <PrivateRoute path='/profile'>
                  <Profile />
                </PrivateRoute>
                <Route path='*'>
                  <Redirect to='/' />
                </Route>
              </Switch>
            </Suspense>
            <Footer />
          </Router>
        </Account>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

function PrivateRoute({ children, ...rest }) {
  const { authState } = useContext(AccountContext);

  return (
    <Route
      {...rest}
      render={() => (
        authState.isAuthenticated === true ? (
          children
        ) : (
          <Redirect to='/login' />
        )
      )}
    />
  );
}

export default App;
