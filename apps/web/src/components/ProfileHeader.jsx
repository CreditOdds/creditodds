import React from 'react';

const ProfileHeader = ({ user, profile, referralSubmitted }) => {
  return (
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
                src="https://d3ay3etzd1512y.cloudfront.net/other/profile_pic.svg"
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
          </span>{' '}
          <span className='text-gray-600'>
            {profile[0]} days
          </span>
        </div>
        <div className='px-6 py-5 text-sm font-medium text-center'>
          <span className='text-gray-900'>Referrals</span>{' '}
          <span className='text-gray-600'>
            {referralSubmitted.length}
          </span>
        </div>
        <div className='px-6 py-5 text-sm font-medium text-center'>
          <span className='text-gray-900'>Referral Clicks</span>{' '}
          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800'>
            COMING SOON
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProfileHeader;
