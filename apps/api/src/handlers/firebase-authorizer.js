/**
 * Firebase Token Authorizer for API Gateway
 *
 * This Lambda function verifies Firebase ID tokens and returns an IAM policy
 * that allows or denies access to API Gateway endpoints.
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Using application default credentials or environment variable
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'creditodds',
  });
}

/**
 * Generate an IAM policy document
 */
function generatePolicy(principalId, effect, resource, context = {}) {
  const policy = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      }],
    },
  };

  // Add context (claims) that will be available in the Lambda handler
  if (Object.keys(context).length > 0) {
    policy.context = context;
  }

  return policy;
}

/**
 * Lambda authorizer handler
 */
exports.firebaseAuthorizerHandler = async (event) => {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));

  // Get the authorization token from the header
  const authHeader = event.authorizationToken || event.headers?.Authorization || event.headers?.authorization;

  if (!authHeader) {
    console.log('No authorization header');
    throw new Error('Unauthorized');
  }

  // Extract the token (remove "Bearer " prefix if present)
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    console.log('No token found');
    throw new Error('Unauthorized');
  }

  try {
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('Token verified successfully for user:', decodedToken.uid);

    // Build the resource ARN for the policy
    // Use a wildcard to allow access to all methods/paths under this API
    const resourceArn = event.methodArn
      ? event.methodArn.split('/').slice(0, 2).join('/') + '/*'
      : '*';

    // Create context with user claims (flattened for API Gateway)
    // API Gateway only supports string values in context
    const context = {
      sub: decodedToken.uid,
      email: decodedToken.email || '',
      email_verified: String(decodedToken.email_verified || false),
      name: decodedToken.name || '',
      picture: decodedToken.picture || '',
      // Include Firebase-specific claims
      firebase_sign_in_provider: decodedToken.firebase?.sign_in_provider || '',
      // For compatibility with existing code expecting cognito:username
      'cognito:username': decodedToken.uid,
      preferred_username: decodedToken.name || decodedToken.email?.split('@')[0] || '',
    };

    console.log('Returning Allow policy for:', decodedToken.uid);
    return generatePolicy(decodedToken.uid, 'Allow', resourceArn, context);

  } catch (error) {
    console.error('Token verification failed:', error.message);

    // Return Deny policy for invalid tokens
    // This is better than throwing an error as it provides clearer feedback
    throw new Error('Unauthorized');
  }
};
