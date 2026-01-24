import config from './index';

describe('Config', () => {
  it('should have api configuration', () => {
    expect(config.api).toBeDefined();
    expect(config.api.baseURL).toBeDefined();
  });

  it('should have cognito configuration', () => {
    expect(config.cognito).toBeDefined();
    expect(config.cognito.userPoolId).toBeDefined();
    expect(config.cognito.clientId).toBeDefined();
  });

  it('should use environment variables when available', () => {
    const originalEnv = process.env.REACT_APP_API_BASE_URL;
    process.env.REACT_APP_API_BASE_URL = 'https://test-api.example.com';

    delete require.cache[require.resolve('./index')];
    const testConfig = require('./index').default;

    expect(testConfig.api.baseURL).toBe('https://test-api.example.com');

    process.env.REACT_APP_API_BASE_URL = originalEnv;
  });
});
