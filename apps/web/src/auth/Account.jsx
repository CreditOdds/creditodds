import React, { createContext, useEffect, useState } from "react";
import { CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";
import Pool from "./UserPool";

const AccountContext = createContext();

const Account = (props) => {
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
  });

  const getSession = async () =>
    new Promise((resolve, reject) => {
      const user = Pool.getCurrentUser();
      if (user) {
        user.getSession((err, session) => {
          if (err) {
            reject();
          } else {
            setAuthState({
              isAuthenticated: true,
            });
            resolve(session);
          }
        });
      } else {
        reject();
      }
    });

  useEffect(() => {
    getSession().catch(() => {
      // No active session - user is not logged in, which is expected
    });
  }, []);

  

  const authenticate = async (Username, Password) =>
    new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username,
        Pool,
      });
      const authDetails = new AuthenticationDetails({
        Username,
        Password,
      });
      user.authenticateUser(authDetails, {
        onSuccess: (data) => {
          setAuthState({
            isAuthenticated: true,
          });
          resolve(data);
        },
        onFailure: (err) => {
          reject(err);
        },
        newPasswordRequired: (data) => {
          resolve(data);
        },
      });
    });

  const logout = () => {
    const user = Pool.getCurrentUser();
    if (user) {
      setAuthState({
        isAuthenticated: false,
      });
      user.signOut();
    }
  };

  const forgot = async (email) =>
    new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: email,
        Pool,
      });
      user.forgotPassword({
        onSuccess: function (data) {
          // successfully initiated reset password request
          resolve(data);
        },
        onFailure: function (err) {
          alert(err.message || JSON.stringify(err));
          reject(err);
        },
      });
    });

  const reset = async (email, verificationCode, newPassword) =>
    new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: email,
        Pool: Pool,
      });
      user.confirmPassword(verificationCode, newPassword, {
        onSuccess(data) {
          resolve(data);
        },
        onFailure(err) {
          reject(err);
        },
      });
    });

  return (
    <AccountContext.Provider
      value={{ authenticate, getSession, logout, forgot, reset, authState }}
    >
      {props.children}
    </AccountContext.Provider>
  );
};
export { Account, AccountContext };
