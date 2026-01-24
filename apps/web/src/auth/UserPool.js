import { CognitoUserPool } from "amazon-cognito-identity-js";
import config from "../config";

const poolData = {
  UserPoolId: config.cognito.userPoolId,
  ClientId: config.cognito.clientId,
};

export default new CognitoUserPool(poolData);
