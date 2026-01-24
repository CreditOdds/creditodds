import React, { useState, useContext, useEffect } from "react";
import { Link, useHistory } from "react-router-dom";
import { AccountContext } from "../auth/Account";
import { XCircleIcon } from "@heroicons/react/solid";
import { Helmet } from "react-helmet-async";
import { toast } from "react-toastify";
import { useFormik, Field, Form } from "formik";
import * as Yup from "yup";

const Forgot = () => {
  const { forgot, reset } = useContext(AccountContext);
  // const [resetCode, setResetCode] = useState("");
  // const [resetPass, setResetPass] = useState("");
  const [codeSent, setcodeSent] = useState(false);
  const [errorMessage, seterrorMessage] = useState("");
  const history = useHistory();

  const formiktwo = useFormik({
    initialValues: {
      resetCode: "",
      newPassword: ""
    },
    validationSchema: Yup.object({
      resetCode: Yup.string().required(),
      newPassword: Yup.string().required()
    }),
    onSubmit: async(values) => {
      reset(formik.values.emailAddress, formiktwo.values.resetCode, formiktwo.values.newPassword)
      .then((data) => {
        history.push("/login");
        toast.success("Your password was reset!", {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        });
      })
      .catch((err) => {
        seterrorMessage(err.message);
      });
    },
  })
  const formik = useFormik({
    initialValues: {
      emailAddress: "",
    },
    validationSchema: Yup.object({
      emailAddress: Yup.string().email('Invalid Email').required("Required"),
    }),
    onSubmit: async(values) => {
      forgot(values.emailAddress)
        .then((data) => {
          setcodeSent(true);
        })
        .catch((err) => {
          seterrorMessage(err.message);
        });
    },
  });

  const onResetSubmit = (event) => {
    event.preventDefault();
    
  };

  return (
    <>
      <Helmet>
        <title>{"Reset Password | CreditOdds"}</title>
        <meta name='description' content='Reset Password' />
      </Helmet>
      <div className='min-h-screen bg-gray-50 flex flex-col justify-center sm:px-6 lg:px-8'>
        <div className='sm:mx-auto sm:w-full sm:max-w-md'>
          <h2 className='mt-6 text-center text-3xl font-extrabold text-gray-900'>
            Reset your password
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
            {!codeSent ? (
              <form className='space-y-6' onSubmit={formik.handleSubmit}>
                <div>
                  <label
                    htmlFor='emailAddress'
                    className='block text-sm font-medium text-gray-700'
                  >
                    Email address
                  </label>
                  <div className='mt-1'>
                    <input
                      id='emailAddress'
                      autoComplete='email'
                      onBlur={formik.handleBlur}
                      onChange={formik.handleChange}
                      value={formik.values.emailAddress}
                      //className='appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
                      className={
                        formik.errors.emailAddress &&
                        formik.touched.emailAddress
                          ? "appearance-none px-3 py-2 block w-full pr-10 border border-red-300 text-red-900 placeholder-red-300 shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                          : "appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      }
                    ></input>
                  </div>
                </div>
                {formik.errors.emailAddress ? (
                  <p className='mt-2 text-sm text-red-600' id='email-error'>
                    {formik.errors.emailAddress}
                  </p>
                ) : null}

                <div>
                  <button
                    type='submit'
                    className='w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                  >
                    Request reset
                  </button>
                </div>
              </form>
            ) : (
              <form className='space-y-6' onSubmit={formiktwo.handleSubmit}>
                <div>
                  <label className='block text-sm font-medium text-gray-700'>
                    Reset Code
                  </label>
                  <div className='mt-1'>
                    <input
                      id='resetCode'
                      onBlur={formiktwo.handleBlur}
                      onChange={formiktwo.handleChange}
                      value={formiktwo.values.resetCode}
                      className='appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
                    ></input>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor='password'
                    className='block text-sm font-medium text-gray-700'
                  >
                    New Password
                  </label>
                  <div className='mt-1'>
                    <input
                      id='newPassword'
                      type='password'
                      autoComplete='new-password'
                      required
                      className='appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
                      onBlur={formiktwo.handleBlur}
                      onChange={formiktwo.handleChange}
                      value={formiktwo.values.newPassword}
                    ></input>
                  </div>
                </div>

                <div>
                  <button
                    type='submit'
                    className='w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                  >
                    Change password
                  </button>
                </div>
              </form>
            )}

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
    </>
  );
};

export default Forgot;
