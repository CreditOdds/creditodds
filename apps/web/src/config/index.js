const config = {
  api: {
    baseURL: process.env.REACT_APP_API_BASE_URL || 'https://c301gwdbok.execute-api.us-east-2.amazonaws.com/Prod',
  },
  cognito: {
    userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || 'us-east-2_YsAXahdbM',
    clientId: process.env.REACT_APP_COGNITO_CLIENT_ID || '7g0sssglmevghirvr9oid50afm',
  },
};

export default config;
