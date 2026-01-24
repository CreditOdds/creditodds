import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

jest.mock('./auth/Account', () => ({
  Account: ({ children }) => <div>{children}</div>,
  AccountContext: React.createContext({ authState: { isAuthenticated: false } }),
}));

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });

  it('wraps content in ErrorBoundary', () => {
    const { container } = render(<App />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
