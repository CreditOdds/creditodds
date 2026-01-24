import React, { useState, useContext, useEffect } from "react";
import { Link, useHistory } from "react-router-dom";
import { AccountContext } from "../auth/Account";
import { XCircleIcon } from "@heroicons/react/solid";
import creditcardoddslogo from '../assets/CreditOdds_LogoText_with Icon-01.svg'

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, seterrorMessage] = useState("");
  const history = useHistory();

  const { authenticate } = useContext(AccountContext);

  useEffect(() => {
    document.title = "Log In | CreditOdds";
  });

  const onSubmit = (event) => {
    event.preventDefault();

    authenticate(email, password)
      .then((data) => {
        history.push("/");
      })
      .catch((err) => {
        seterrorMessage(err.message);
      });
  };

  return (
    <div className='min-h-screen bg-gray-50 flex flex-col justify-center sm:px-6 lg:px-8'>
      <div className='sm:mx-auto sm:w-full sm:max-w-md'>
        <img className="mx-auto h-22 w-auto" src={process.env.PUBLIC_URL + creditcardoddslogo} alt="Workflow" />
        <h2 className='mt-6 text-center text-3xl font-extrabold text-gray-900'>
          Sign in to your account
        </h2>
        <p className='mt-2 text-center text-sm text-gray-600 max-w'>
          Don't have an account?{" "}
          <Link
            to='/register'
            className='font-medium text-indigo-600 hover:text-indigo-500'
          >
            Sign up here
          </Link>
        </p>
      </div>

      <div className='mt-8 sm:mx-auto sm:w-full sm:max-w-md'>
        <div className='bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10'>
          <form className='space-y-6' onSubmit={onSubmit}>
            <div>
              <label
                htmlFor='email'
                className='block text-sm font-medium text-gray-700'
              >
                Email address
              </label>
              <div className='mt-1'>
                <input
                  value={email}
                  autoComplete='email'
                  required
                  className='appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
                  onChange={(event) => setEmail(event.target.value)}
                ></input>
              </div>
            </div>

            <div>
              <label
                htmlFor='password'
                className='block text-sm font-medium text-gray-700'
              >
                Password
              </label>
              <div className='mt-1'>
                <input
                  value={password}
                  type='password'
                  autoComplete='current-password'
                  required
                  className='appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
                  onChange={(event) => setPassword(event.target.value)}
                ></input>
              </div>
            </div>

            <div className='flex items-center justify-between'>
              {/* <div className='flex items-center'>
                <input
                  id='remember_me'
                  name='remember_me'
                  type='checkbox'
                  className='h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded'
                />
                <label
                  htmlFor='remember_me'
                  className='ml-2 block text-sm text-gray-900'
                >
                  Remember me
                </label>
              </div> */}

              <div className='text-sm'>
                <Link
                  to='/forgot'
                  className='font-medium text-indigo-600 hover:text-indigo-500'
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            <div>
              <button
                type='submit'
                className='w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
              >
                Sign in
              </button>
            </div>
          </form>
          {errorMessage != "" ? (
            <div className='rounded-md bg-red-50 p-4 mt-2'>
              <div className='flex'>
                <div className='flex-shrink-0'>
                  <XCircleIcon
                    className='h-5 w-5 text-red-400'
                    aria-hidden='true'
                  />
                </div>
                <div className='ml-3'>
                  <h3 className='text-sm font-medium text-red-800'>
                    {errorMessage}
                  </h3>
                </div>
              </div>
            </div>
          ) : (
            <></>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
