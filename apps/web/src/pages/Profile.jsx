import React, { Fragment, useEffect, useState, useContext } from "react";
import { Menu, Popover, Transition } from "@headlessui/react";
import { AccountContext } from "../auth/Account";
import { Helmet } from "react-helmet-async";
import {
  ArrowNarrowLeftIcon,
  CheckIcon,
  HomeIcon,
  PaperClipIcon,
  QuestionMarkCircleIcon,
  SearchIcon,
  ThumbUpIcon,
  UserIcon,
  TrendingUpIcon,
} from "@heroicons/react/solid";
import { CurrencyDollarIcon, CalendarIcon } from "@heroicons/react/outline";
import axiosInstance from "../services/CustomAxios";
import ReferralModal from "../components/ReferralModal";
import config from "../config";
const eventTypes = {
  applied: { icon: UserIcon, bgColorClass: "bg-gray-400" },
  advanced: { icon: ThumbUpIcon, bgColorClass: "bg-blue-500" },
  completed: { icon: CheckIcon, bgColorClass: "bg-green-500" },
};

const user = {
  name: "Rebecca Nicholas",
  role: "Product Designer",
  imageUrl:
    "https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
};

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

const Profile = () => {
  const [records, setRecords] = useState([]);
  const [referralSubmitted, setReferralSubmitted] = useState([]);
  const [referralOpen, setReferralOpen] = useState([]);
  const [user, setUser] = useState({});
  const [profile, setProfile] = useState([]);
  const [show, setShow] = useState(false);
  const [tabs, setTabs] = useState([]);
  const [tabRecords, setTabRecords] = useState([]);

  const accountContext = useContext(AccountContext);

  const hideModal = () => {
    setShow(false);
  };

  const showModal = () => {
    setShow(true);
  };

  useEffect(() => {
    const fetchData = async () => {
      const session = await accountContext.getSession();
      const idToken = session.idToken.jwtToken;
      setUser(session.idToken.payload);

      await Promise.all([
        axiosInstance
          .get(
            `${config.api.baseURL}/records`,
            {
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
            }
          )
          .then((response) => {
            setRecords(response.data);
          })
          .catch((error) => {
          }),
        axiosInstance
          .get(
            `${config.api.baseURL}/referrals`,
            {
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
            }
          )
          .then((response) => {
            setReferralSubmitted(response.data[0]);
            setReferralOpen(response.data[1]);
          })
          .catch((error) => {
          }),
        axiosInstance
          .get(
            `${config.api.baseURL}/profile`,
            {
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
            }
          )
          .then((response) => {
            setProfile(response.data);
            setTabs([
              { name: "Applied", count: "52", current: true },
              { name: "Accepted", count: "6", current: false },
              { name: "Rejected", count: "4", current: false },
            ]);
          })
          .catch((error) => {
          }),
      ]);
    };

    fetchData();
  }, [accountContext]);

  return (
    <div className='min-h-screen '>
      <Helmet>
        <title>Profile | CreditOdds</title>
        <meta name='description' content='User Profile' />
      </Helmet>
      <ReferralModal show={show} handleClose={hideModal}>
        {referralOpen}
      </ReferralModal>
      <main className='py-4'>
        {/* Page header */}
        <div className='mt-8 max-w-3xl mx-auto gap-6 sm:px-6 lg:max-w-7xl '>
          <div className='space-y-6 lg:col-start-1 lg:col-span-2'>
            <div className='rounded-lg bg-white overflow-hidden shadow'>
              <h2 className='sr-only' id='profile-overview-title'>
                Profile Overview
              </h2>
              <div className='bg-white p-6'>
                <div className='sm:flex sm:items-center sm:justify-between'>
                  <div className='sm:flex sm:space-x-5'>
                    <div className='flex-shrink-0'>
                      <img
                        className='mx-auto h-20 w-20 rounded-full'
                        src={
                          "https://d3ay3etzd1512y.cloudfront.net/other/profile_pic.svg"
                        }
                        alt=''
                      />
                    </div>
                    <div className='mt-4 text-center sm:mt-0 sm:pt-1 sm:text-left'>
                      <p className='text-sm font-medium text-gray-600'>
                        Welcome back,
                      </p>
                      <p className='text-xl font-bold text-gray-900 sm:text-2xl'>
                        {user.preferred_username}
                      </p>
                    </div>
                  </div>
                  <div className='mt-5 flex justify-center sm:mt-0'>
                    <a
                      href='#'
                      className='flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50'
                    >
                      Edit profile
                    </a>
                  </div>
                </div>
              </div>
              <div className='border-t border-gray-200 bg-gray-50 grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-3 sm:divide-y-0 sm:divide-x'>
                <div className='px-6 py-5 text-sm font-medium text-center'>
                  <span className='text-gray-900'>
                    Average Age of Accounts
                  </span>{" "}
                  <span className='text-gray-600'>
                    {profile[0]}{" "}days
                  </span>
                </div>
                <div className='px-6 py-5 text-sm font-medium text-center'>
                  <span className='text-gray-900'>Referrals</span>{" "}
                  <span className='text-gray-600'>
                    {referralSubmitted.length}
                  </span>
                </div>
                <div className='px-6 py-5 text-sm font-medium text-center'>
                  <span className='text-gray-900'>Referral Clicks</span>{" "}
                  <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800'>
                    COMING SOON
                  </span>
                </div>
              </div>
            </div>
            {/* Description list*/}
            <section aria-labelledby='applicant-information-title'>
              <div className='bg-white shadow sm:rounded-lg'>
                <div className='px-4 py-5 sm:px-6'>
                  <h2
                    id='applicant-information-title'
                    className='text-lg leading-6 font-medium text-gray-900'
                  >
                    Submitted Records
                  </h2>
                  <p className='mt-1 max-w-2xl text-sm text-gray-500'>
                    Credit Card application records you've submitted
                  </p>
                </div>
                {/* {tabs != [] ? (
                  <div className='px-4 sm:px-6'>
                    <div className='sm:hidden'>
                      <label htmlFor='tabs' className='sr-only'>
                        Select a tab
                      </label>
                      <select
                        id='tabs'
                        name='tabs'
                        className='block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md'
                        //defaultValue={tabs.find((tab) => tab.current).name}
                        //onChange={setFilter()}
                      >
                        {tabs.map((tab) => (
                          <option key={tab.name}>{tab.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className='hidden sm:block'>
                      <div className='border-b border-gray-200'>
                        <nav
                          className='-mb-px flex space-x-8'
                          aria-label='Tabs'
                        >
                          {tabs.map((tab) => (
                            <button
                              key={tab.name}
                              onClick={() => setFilter(tab.name)}
                              className={classNames(
                                tab.current
                                  ? "border-indigo-500 text-indigo-600"
                                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200",
                                "whitespace-nowrap flex py-4 px-1 border-b-2 font-medium text-sm"
                              )}
                              aria-current={tab.current ? "page" : undefined}
                            >
                              {tab.name}
                              {tab.count ? (
                                <span
                                  className={classNames(
                                    tab.current
                                      ? "bg-indigo-100 text-indigo-600"
                                      : "bg-gray-100 text-gray-900",
                                    "hidden ml-3 py-0.5 px-2.5 rounded-full text-xs font-medium md:inline-block"
                                  )}
                                >
                                  {tab.count}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </nav>
                      </div>
                    </div>
                  </div>
                ) : null} */}
                <div className='border-t border-gray-200 '>
                  <div className='flex flex-col'>
                    <div className='-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8'>
                      <div className='py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8'>
                        <div className='shadow overflow-hidden border-b border-gray-200 sm:rounded-lg'>
                          <table className='min-w-full divide-y divide-gray-200'>
                            <thead className='bg-gray-50'>
                              <tr>
                                <th
                                  scope='col'
                                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                                >
                                  Card
                                </th>
                                <th
                                  scope='col'
                                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                                >
                                  Metrics
                                </th>
                                <th
                                  scope='col'
                                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                                >
                                  Result
                                </th>
                                <th
                                  scope='col'
                                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                                >
                                  Status
                                </th>
                                <th
                                  scope='col'
                                  className='relative px-6 py-3'
                                >
                                  <span className='sr-only'>Edit</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className='bg-white divide-y divide-gray-200'>
                              {records.map((record) => (
                                <tr key={record.record_id}>
                                  <td className='px-6 py-4 whitespace-nowrap'>
                                    <div className='flex items-center'>
                                      <div className='flex-shrink-0 h-10 w-16'>
                                        <img
                                          className='h-10 w-16'
                                          src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${record.card_image_link}`}
                                          alt=''
                                        />
                                      </div>
                                      <div className='ml-4'>
                                        <div className='text-sm font-medium text-gray-900'>
                                          {record.card_name}
                                        </div>
                                        <div className='text-sm text-gray-500'>
                                          Submitted:{" "}
                                          {new Date(
                                            record.submit_datetime
                                          ).toLocaleDateString()}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className='px-6 py-4 whitespace-nowrap'>
                                    <span className='flex flex-row h-6'>
                                      <TrendingUpIcon className='text-sm text-gray-500 h-5 mr-2'></TrendingUpIcon>
                                      <p className='text-sm text-gray-500'>
                                        {record.credit_score}
                                      </p>
                                    </span>
                                    <span className='flex flex-row h-6'>
                                      <CurrencyDollarIcon className='text-sm text-gray-500 h-4 mr-2'></CurrencyDollarIcon>
                                      <p className='text-sm text-gray-500'>
                                        $
                                        {record.listed_income?.toLocaleString()}
                                      </p>
                                    </span>

                                    <span className='flex flex-row h-6'>
                                      <CalendarIcon className='text-sm text-gray-500 h-4 mr-2'></CalendarIcon>
                                      <p className='text-sm text-gray-500'>
                                        {record.length_credit} years
                                      </p>
                                    </span>
                                  </td>
                                  <td className='px-6 py-4 whitespace-nowrap'>
                                    {record.result ? (
                                      <span className='px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800'>
                                        Accepted
                                      </span>
                                    ) : (
                                      <span className='px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800'>
                                        Rejected
                                      </span>
                                    )}
                                  </td>
                                  <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                                    {/* {record.card_name} */}
                                  </td>
                                  <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium'>
                                    <a
                                      href='#'
                                      className='text-indigo-600 hover:text-indigo-900'
                                    >
                                      {/* Edit */}
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {/* Description list*/}
            <section aria-labelledby='applicant-information-title'>
              <div className='bg-white shadow sm:rounded-lg'>
                <div className='px-4 py-5 sm:px-6'>
                  <h2
                    id='applicant-information-title'
                    className='text-lg leading-6 font-medium text-gray-900'
                  >
                    Referrals
                  </h2>
                  <p className='mt-1 max-w-2xl text-sm text-gray-500'>
                    Your card referrals
                  </p>
                </div>
                <div className='border-t border-gray-200 '>
                  <div className='flex flex-col'>
                    <div className='-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8'>
                      <div className='py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8'>
                        <div className='shadow overflow-hidden border-b border-gray-200 sm:rounded-lg'>
                          <table className='min-w-full divide-y divide-gray-200'>
                            <thead className='bg-gray-50'>
                              <tr>
                                <th
                                  scope='col'
                                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                                >
                                  Card
                                </th>
                                <th
                                  scope='col'
                                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                                >
                                  Referral Link
                                </th>
                                <th
                                  scope='col'
                                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                                >
                                  Status
                                </th>
                                <th
                                  scope='col'
                                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                                >
                                  Impressions
                                </th>
                                <th
                                  scope='col'
                                  className='relative px-6 py-3'
                                >
                                  <span className='sr-only'>Edit</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className='bg-white divide-y divide-gray-200'>
                              {referralSubmitted.map((record) => (
                                <tr key={record.referral_id}>
                                  <td className='px-6 py-4 whitespace-nowrap'>
                                    <div className='flex items-center'>
                                      <div className='flex-shrink-0 h-10 w-16'>
                                        <img
                                          className='h-10 w-16'
                                          src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${record.card_image_link}`}
                                          alt=''
                                        />
                                      </div>
                                      <div className='ml-4'>
                                        <div className='text-sm font-medium text-gray-900'>
                                          {record.card_name}
                                        </div>
                                        <div className='text-sm text-gray-500'>
                                          {/* Applied: {(new Date(record.submit_datetime)).getUTCDate()} */}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className='px-6 py-4 whitespace-nowrap'>
                                    <div className='text-sm text-gray-500'>
                                      {record.card_referral_link}
                                      {record.referral_link}
                                    </div>
                                  </td>
                                  <td className='px-6 py-4 whitespace-nowrap'>
                                    {record.admin_approved ? (
                                      <span className='px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800'>
                                        Approved
                                      </span>
                                    ) : (
                                      <span className='px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800'>
                                        Awaiting Approval
                                      </span>
                                    )}
                                  </td>
                                  <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                                    {/* {record.card_name} */}Coming soon...
                                  </td>
                                  <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium'>
                                    <a
                                      href='#'
                                      className='text-indigo-600 hover:text-indigo-900'
                                    >
                                      Edit
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <a
                    onClick={(e) => {
                      showModal();
                    }}
                    className='block bg-gray-50 text-sm font-medium text-gray-500 text-center px-4 py-4 hover:text-gray-700 sm:rounded-b-lg cursor-pointer'
                  >
                    Submit a referral
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;
