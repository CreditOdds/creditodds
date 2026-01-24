import React from 'react';
import { TrendingUpIcon, CurrencyDollarIcon, CalendarIcon } from '@heroicons/react/solid';

const RecordsTable = ({ records }) => {
  return (
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
        <div className='border-t border-gray-200'>
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
                                  Submitted:{' '}
                                  {new Date(
                                    record.submit_datetime
                                  ).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className='px-6 py-4 whitespace-nowrap'>
                            <span className='flex flex-row h-6'>
                              <TrendingUpIcon className='text-sm text-gray-500 h-5 mr-2' />
                              <p className='text-sm text-gray-500'>
                                {record.credit_score}
                              </p>
                            </span>
                            <span className='flex flex-row h-6'>
                              <CurrencyDollarIcon className='text-sm text-gray-500 h-4 mr-2' />
                              <p className='text-sm text-gray-500'>
                                ${record.listed_income?.toLocaleString()}
                              </p>
                            </span>
                            <span className='flex flex-row h-6'>
                              <CalendarIcon className='text-sm text-gray-500 h-4 mr-2' />
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
                          </td>
                          <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium'>
                            <a
                              href='#'
                              className='text-indigo-600 hover:text-indigo-900'
                            >
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
  );
};

export default RecordsTable;
