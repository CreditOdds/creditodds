import React from 'react';
import { ExclamationIcon } from '@heroicons/react/outline';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <ExclamationIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Something went wrong
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>
                        We're sorry, but something unexpected happened. Please try refreshing the page.
                      </p>
                      {process.env.NODE_ENV === 'development' && this.state.error && (
                        <details className="mt-4">
                          <summary className="cursor-pointer font-medium">Error details</summary>
                          <pre className="mt-2 text-xs overflow-auto">
                            {this.state.error.toString()}
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Refresh page
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
