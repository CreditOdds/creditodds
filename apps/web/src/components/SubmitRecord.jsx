import { Fragment, useContext } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XIcon, ExclamationCircleIcon } from "@heroicons/react/solid";
import { useFormik } from "formik";
import * as Yup from "yup";
import NumberFormat from "react-number-format";
import axiosInstance from "../services/CustomAxios";
import { Switch } from "@headlessui/react";
import { AccountContext } from "../auth/Account";
import config from "../config";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function SubmitRecordModal({ handleClose, show, children }) {
  const { getSession } = useContext(AccountContext);
  const formik = useFormik({
    initialValues: {
      card_id: 0,
      credit_score: 500,
      credit_score_source: "0",
      listed_income: 35000,
      date_applied:
        new Date().getFullYear() +
        "-" +
        ("0" + (new Date().getMonth() + 1)).slice(-2),
      //length_credit: 0,
      bank_customer: false,
      //starting_credit_limit: null,
      result: true,
    },
    validationSchema: Yup.object({
      credit_score: Yup.number()
        .integer("Credit Score must be a whole number")
        .min(300, "Credit Score must be at least 300")
        .max(850, "Credit Score cannot be more than 850")
        .required("Required"),
      listed_income: Yup.number()
        .integer("Listed Income must be a whole number")
        .min(0, "Listed Income must be a positive number")
        .max(1000000, "Listed Income cannot be higher than $1 MIL")
        .required("Required"),
      starting_credit_limit: Yup.number()
        .integer("Starting credit limit must be a whole number")
        .min(0, "Starting credit limit must be a positive number")
        .max(1000000, "Starting credit limit cannot be higher than $1 MIL"),
      inquiries_3: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be a positive number")
        .max(50, "Inquiries cannot be higher than 50"),
      inquiries_12: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be a positive number")
        .max(50, "Inquiries cannot be higher than 50"),
      inquiries_24: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be a positive number")
        .max(50, "Inquiries cannot be higher than 50"),
      length_credit: Yup.number()
        .integer("Length of credit must be a whole number")
        .min(0, "Length of credit must be a positive number")
        .max(50, "Length of credit cannot be greater than 50 years")
        .required("Required"),
    }),
    onSubmit: async (values) => {
      values.card_id = children.card_id;
      const session = await getSession();
      const idToken = session.idToken.jwtToken;
      await axiosInstance.post(
        `${config.api.baseURL}/records`,
        values,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      handleClose();
    },
  });

  return (
    <Transition.Root show={show} as={Fragment}>
      <Dialog
        as='div'
        static
        className='fixed inset-0 overflow-hidden z-20'
        open={show}
        onClose={handleClose}
      >
        <div className='absolute inset-0 overflow-hidden'>
          <Transition.Child
            as={Fragment}
            enter='ease-in-out duration-500'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-in-out duration-500'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <Dialog.Overlay className='absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity' />
          </Transition.Child>
          <div className='fixed inset-y-0 right-0 pl-10 max-w-full flex'>
            <Transition.Child
              as={Fragment}
              enter='transform transition ease-in-out duration-500 sm:duration-700'
              enterFrom='translate-x-full'
              enterTo='translate-x-0'
              leave='transform transition ease-in-out duration-500 sm:duration-700'
              leaveFrom='translate-x-0'
              leaveTo='translate-x-full'
            >
              <div className='relative w-96'>
                <Transition.Child
                  as={Fragment}
                  enter='ease-in-out duration-500'
                  enterFrom='opacity-0'
                  enterTo='opacity-100'
                  leave='ease-in-out duration-500'
                  leaveFrom='opacity-100'
                  leaveTo='opacity-0'
                >
                  <div className='absolute top-0 left-0 -ml-8 pt-4 pr-2 flex sm:-ml-10 sm:pr-4'>
                    <button
                      className='rounded-md text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-white'
                      onClick={handleClose}
                    >
                      <span className='sr-only'>Close panel</span>
                      <XIcon className='h-6 w-6' aria-hidden='true' />
                    </button>
                  </div>
                </Transition.Child>

                <div className='h-full bg-white p-8 overflow-y-auto'>
                  <div className='pb-16 space-y-6'>
                    <div>
                      <div className='block w-full  rounded-lg overflow-hidden'>
                        <img
                          src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${children.card_image_link}`}
                          alt=''
                          className='object-cover'
                        />
                      </div>
                      <div className='mt-4 flex items-start justify-between'>
                        <div>
                          <h2 className='text-lg font-medium text-gray-900'>
                            <span className='sr-only'>Details for </span>
                            {children.card_name}
                          </h2>
                          {/* <p className='text-sm font-medium text-gray-500'>
                            3.9 MB
                          </p> */}
                        </div>
                      </div>
                    </div>
                    <div>
                      {/* <h3 className='font-medium text-gray-900'>Information</h3> */}
                      <form
                        className='space-y-6'
                        onSubmit={formik.handleSubmit}
                      >
                        <div>
                          <label
                            htmlFor='credit_score'
                            className='block text-sm font-medium text-gray-700'
                          >
                            Credit Score
                          </label>
                          <div className='mt-1 relative rounded-md shadow-sm'>
                            <input
                              id='credit_score'
                              name='credit_score'
                              className={
                                formik.errors.credit_score &&
                                formik.touched.credit_score
                                  ? "appearance-none px-3 py-2 block w-full pr-10 border border-red-300 text-red-900 placeholder-red-300 shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                  : "appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              }
                              autoComplete='off'
                              onChange={formik.handleChange}
                              onBlur={formik.handleBlur}
                              value={formik.values.credit_score}
                            />

                            {formik.errors.credit_score &&
                            formik.touched.credit_score ? (
                              <div className='absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none'>
                                <ExclamationCircleIcon
                                  className='h-5 w-5 text-red-500'
                                  aria-hidden='true'
                                />
                              </div>
                            ) : (
                              <div className='absolute inset-y-0 right-0 flex items-center'>
                                <label htmlFor='currency' className='sr-only'>
                                  Currency
                                </label>
                                <select
                                  id='credit_score_source'
                                  name='credit_score_source'
                                  className='focus:ring-indigo-500 focus:border-indigo-500 h-full py-0 pl-2 pr-7 border-transparent bg-transparent text-gray-500 sm:text-sm rounded-md'
                                  value={formik.values.credit_score_source}
                                  onChange={formik.handleChange}
                                >
                                  <option value='0' label='FICO: *' />
                                  <option value='1' label='FICO: Experian' />
                                  <option value='2' label='FICO: Transunion' />
                                  <option value='3' label='FICO: Equifax' />
                                </select>
                              </div>
                            )}
                          </div>
                          {formik.errors.credit_score ? (
                            <p
                              className='mt-2 text-sm text-red-600'
                              id='email-error'
                            >
                              {formik.errors.credit_score}
                            </p>
                          ) : (
                            <p className='mt-2 text-sm text-gray-500'>
                              FICO credit score at the time of application.
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor='listed_income'
                            className='block text-sm font-medium text-gray-700'
                          >
                            Income
                          </label>
                          <div className='mt-1 relative rounded-md shadow-sm'>
                            <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                              <span className='text-gray-500 sm:text-sm'>
                                $
                              </span>
                            </div>
                            <NumberFormat
                              thousandSeparator={true}
                              // name='listed_income'
                              id='listed_income'
                              autoComplete='off'
                              className={
                                formik.errors.listed_income
                                  ? "w-full pl-7 pr-12 block border-red-300 text-red-900 placeholder-red-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                  : "focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                              }
                              aria-describedby='listed_income'
                              // onChange={formik.handleChange}
                              onBlur={formik.handleBlur}
                              value={formik.values.listed_income}
                              onValueChange={(val) =>
                                formik.setFieldValue(
                                  "listed_income",
                                  val.floatValue
                                )
                              }
                            />

                            <div className='absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none'>
                              <span
                                className='text-gray-500 sm:text-sm'
                                id='price-currency'
                              >
                                USD
                              </span>
                            </div>
                          </div>
                          {formik.errors.listed_income ? (
                            <p
                              className='mt-2 text-sm text-red-600'
                              id='email-error'
                            >
                              {formik.errors.listed_income}
                            </p>
                          ) : (
                            <p className='mt-2 text-sm text-gray-500'>
                              Income you listed on your application.
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor='creditscore'
                            className='block text-sm font-medium text-gray-700'
                          >
                            Application Time
                          </label>
                          <div className='mt-1'>
                            <input
                              id='date_applied'
                              name='date_applied'
                              type='month'
                              required
                              min='2019-01'
                              onChange={formik.handleChange}
                              onBlur={formik.handleBlur}
                              value={formik.values.date_applied}
                              className='appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'
                            />
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor='length_credit'
                            className='block text-sm font-medium text-gray-700'
                          >
                            Age of Oldest Account
                          </label>
                          <div className='mt-1 relative rounded-md shadow-sm'>
                            <input
                              name='length_credit'
                              id='length_credit'
                              // type='number'
                              className={
                                formik.errors.length_credit
                                  ? "appearance-none px-3 py-2 block w-full pr-10 border border-red-300 text-red-900 placeholder-red-300 shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                  : "appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              }
                              // aria-describedby='length_credit'
                              autoComplete='off'
                              onChange={formik.handleChange}
                              onBlur={formik.handleBlur}
                              value={formik.values.length_credit}
                            />
                            <div className='absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none'>
                              <span
                                className='text-gray-500 sm:text-sm'
                                id='price-currency'
                              >
                                Years
                              </span>
                            </div>
                          </div>
                          <p
                            className='mt-2 text-sm text-red-600'
                            id='email-error'
                          >
                            {formik.errors.length_credit}
                          </p>
                        </div>
                        <div className='flex'>
                          <label className='block text-sm font-medium text-gray-700 pr-4'>
                            Did you already have an account with{" "}
                            <strong>{children.bank}</strong>?
                          </label>
                          <Switch
                            checked={formik.values.bank_customer}
                            onChange={() =>
                              formik.setFieldValue(
                                "bank_customer",
                                !formik.values.bank_customer
                              )
                            }
                            className={classNames(
                              formik.values.bank_customer
                                ? "bg-indigo-600"
                                : "bg-gray-200",
                              "relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            )}
                          >
                            <span className='sr-only'>Use setting</span>
                            <span
                              className={classNames(
                                formik.values.bank_customer
                                  ? "translate-x-5"
                                  : "translate-x-0",
                                "pointer-events-none relative inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200"
                              )}
                            >
                              <span
                                className={classNames(
                                  formik.values.bank_customer
                                    ? "opacity-0 ease-out duration-100"
                                    : "opacity-100 ease-in duration-200",
                                  "absolute inset-0 h-full w-full flex items-center justify-center transition-opacity"
                                )}
                                aria-hidden='true'
                              >
                                <svg
                                  className='bg-white h-3 w-3 text-gray-400'
                                  fill='none'
                                  viewBox='0 0 12 12'
                                >
                                  <path
                                    d='M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2'
                                    stroke='currentColor'
                                    strokeWidth={2}
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                  />
                                </svg>
                              </span>
                              <span
                                className={classNames(
                                  formik.values.bank_customer
                                    ? "opacity-100 ease-in duration-200"
                                    : "opacity-0 ease-out duration-100",
                                  "absolute inset-0 h-full w-full flex items-center justify-center transition-opacity"
                                )}
                                aria-hidden='true'
                              >
                                <svg
                                  className='bg-white h-3 w-3 text-indigo-600'
                                  fill='currentColor'
                                  viewBox='0 0 12 12'
                                >
                                  <path d='M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z' />
                                </svg>
                              </span>
                            </span>
                          </Switch>
                        </div>
                        <div>
                          <label
                            htmlFor='inquiries_3'
                            className='block text-sm font-medium text-gray-700'
                          >
                            Number of Credit Inquiries in the last
                          </label>
                          <div className='mt-1 flex rounded-md shadow-sm'>
                            <span className='inline-flex w-40 items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm'>
                              3 months
                            </span>
                            <input
                              name='inquiries_3'
                              id='inquiries_3'
                              type='text'
                              onChange={formik.handleChange}
                              onBlur={formik.handleBlur}
                              value={formik.values.inquiries_3}
                              className={
                                formik.errors.inquiries_3
                                  ? "appearance-none px-3 py-2 block w-full pr-10 border border-red-300 text-red-900 placeholder-red-300 shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                  : "flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border-gray-300"
                              }
                            />
                          </div>
                          <div className='mt-1 flex rounded-md shadow-sm'>
                            <span className='inline-flex w-40 items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm'>
                              12 months
                            </span>
                            <input
                              name='inquiries_12'
                              id='inquiries_12'
                              type='text'
                              onChange={formik.handleChange}
                              onBlur={formik.handleBlur}
                              value={formik.values.inquiries_12}
                              className={
                                formik.errors.inquiries_12
                                  ? "appearance-none px-3 py-2 block w-full pr-10 border border-red-300 text-red-900 placeholder-red-300 shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                  : "flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border-gray-300"
                              }
                            />
                          </div>
                          <div className='mt-1 flex rounded-md shadow-sm'>
                            <span className='inline-flex w-40 items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm'>
                              24 months
                            </span>
                            <input
                              name='inquiries_24'
                              id='inquiries_24'
                              type='text'
                              onChange={formik.handleChange}
                              onBlur={formik.handleBlur}
                              value={formik.values.inquiries_24}
                              className={
                                formik.errors.inquiries_24
                                  ? "appearance-none px-3 py-2 block w-full  border border-red-300 text-red-900 placeholder-red-300 shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                  : "flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border-gray-300"
                              }
                            />
                          </div>
                        </div>
                        {formik.values.result ? (
                          <>
                            <div className='flex'>
                              <button
                                type='button'
                                className='flex-1 bg-green-500 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-green-600 focus:outline-none'
                              >
                                Approved
                              </button>
                              <button
                                type='button'
                                onClick={() =>
                                  formik.setFieldValue("result", false)
                                }
                                className='flex-1 ml-3 bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none'
                              >
                                Rejected
                              </button>
                            </div>
                            <div>
                              <label
                                htmlFor='price'
                                className='block text-sm font-medium text-gray-700'
                              >
                                Starting Credit Limit
                              </label>
                              <div className='mt-1 relative rounded-md shadow-sm'>
                                <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                                  <span className='text-gray-500 sm:text-sm'>
                                    $
                                  </span>
                                </div>
                                <NumberFormat
                                  thousandSeparator={true}
                                  // name='listed_income'
                                  id='starting_credit_limit'
                                  autoComplete='off'
                                  className={
                                    formik.errors.starting_credit_limit
                                      ? "w-full pl-7 pr-12 block border-red-300 text-red-900 placeholder-red-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                      : "focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                                  }
                                  aria-describedby='listed_income'
                                  // onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  value={formik.values.starting_credit_limit}
                                  onValueChange={(val) =>
                                    formik.setFieldValue(
                                      "starting_credit_limit",
                                      val.floatValue
                                    )
                                  }
                                />
                                <div className='absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none'>
                                  <span
                                    className='text-gray-500 sm:text-sm'
                                    id='price-currency'
                                  >
                                    USD
                                  </span>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className='flex'>
                            <button
                              type='button'
                              onClick={() =>
                                formik.setFieldValue("result", true)
                              }
                              className='flex-1 bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none'
                            >
                              Approved
                            </button>
                            <button
                              type='button'
                              className='flex-1 ml-3 bg-red-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-red-700 focus:outline-none '
                            >
                              Rejected
                            </button>
                          </div>
                        )}
                        <div>
                          <button
                            type='submit'
                            className='w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                          >
                            Submit Record
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
