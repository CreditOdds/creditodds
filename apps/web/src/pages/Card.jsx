import React, { useState, useEffect, useContext } from "react";
import axiosInstance from "../services/CustomAxios";
import { Helmet } from "react-helmet-async";
import SubmitRecords from "../components/SubmitRecord";
import ScatterPlot from "../components/charts/ScatterPlot";
import { AccountContext } from "../auth/Account";
import { LibraryIcon, CalendarIcon } from "@heroicons/react/solid";
import { ExclamationIcon, XIcon, ArchiveIcon } from "@heroicons/react/outline";
import Breadcrumbs from "../components/BreadCrumbs";
import config from "../config";

const Card = (props) => {
  const [card, setCard] = useState({});
  const [cardId, setCardId] = useState(0);
  const [chartOne, setChartOne] = useState([]);
  const [chartTwo, setChartTwo] = useState([]);
  const [chartThree, setChartThree] = useState([]);
  const [show, setShow] = useState(false);

  const context = useContext(AccountContext);

  const showModal = () => {
    if (context.authState.isAuthenticated) {
      setShow(true);
    } else {
    }
  };

  const hideModal = () => {
    setShow(false);
  };

  useEffect(() => {
    axiosInstance
      .get(`${config.api.baseURL}/card`, {
        params: {
          card_name: props.match.params.name,
        },
      })
      .then((response) => {
        setCard(response.data);
      })
      .catch((error) => {
        // Error handling via axios interceptor
      });
    axiosInstance
      .get(
        `${config.api.baseURL}/graphs`,
        {
          params: {
            card_name: props.match.params.name,
          },
        }
      )
      .then((response) => {
        setChartOne(response.data[0]);
        setChartTwo(response.data[1]);
        setChartThree(response.data[2]);
      })
      .catch((error) => {
        // Error handling via axios interceptor
      });
  }, [props.match.params.name]);

  return (
    <div className='bg-gray-50'>
      <Helmet>
        <title>{card.card_name + ` | CreditOdds`}</title>
        <meta name='description' content={card} />
      </Helmet>
      <SubmitRecords show={show} handleClose={hideModal}>
        {card}
      </SubmitRecords>
      <Breadcrumbs>
      {{pages : [
  { name: card.card_name , href: '#', current: true },
]}}
      </Breadcrumbs>
      <div className='mx-auto px-4 sm:px-6 lg:px-8'>
        {!card.accepting_applications && card.accepting_applications != undefined ? (
          <div className='bg-yellow-50 border-l-4 border-yellow-400 p-4'>
            <div className='flex'>
              <div className='flex-shrink-0'>
                <ExclamationIcon
                  className='h-5 w-5 text-yellow-400'
                  aria-hidden='true'
                />
              </div>
              <div className='ml-3'>
                <p className='text-sm text-yellow-700'>
                  This credit card is no longer accepting applications and has
                  been archived.
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <div className='max-w-7xl mx-auto'>
          <div className='text-center pt-6 pb-6 sm:pt-14 sm:pb-10'>
            <h1 className='text-4xl font-extrabold text-gray-900 sm:text-4xl tracking-wide'>
              {card.card_name}
            </h1>
            <div className='flex justify-center pt-2'>
              <LibraryIcon
                className='h-5 w-5 text-gray-400'
                aria-hidden='true'
              />
              <p className='pl-2 pr-2 tracking-wide text-sm text-gray-500'>
                {card.bank}
              </p>
              {/* <CalendarIcon
                className='h-5 w-5 text-gray-400'
                aria-hidden='true'
              />
              <p className='pl-2 tracking-wide text-sm text-gray-500'>2017</p> */}
            </div>
          </div>

          <div className='sm:flex pb-6'>
            {card.card_image_link ? (
              <div className='mb-4 flex-shrink-0 sm:mb-0 sm:mr-4'>
                <img
                  src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`}
                  alt=''
                  className='h-30 w-45 md:h-56 md:w-94 mx-auto'
                />
              </div>
            ) : null}

            <div className='w-full px-12'>
              <div className='items-stretch'>
                <h3 className='text-lg leading-6 font-medium text-gray-900 text-center'>
                  On average people who got <b>accepted</b> for the card
                  had...
                </h3>

                <dl className='mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3 text-center'>
                  <div
                    key='CreditScore'
                    className='py-5 bg-white shadow rounded-lg overflow-hidden sm:min-w-min'
                  >
                    <dt className='text-sm font-medium text-gray-500 truncate'>
                      Credit Score
                    </dt>
                    <dd className='mt-1 text-3xl font-semibold text-gray-900'>
                      {card.approved_median_credit_score}
                    </dd>
                  </div>
                  <div
                    key='Income'
                    className=' py-5 bg-white shadow rounded-lg overflow-hidden  sm:min-w-min'
                  >
                    <dt className='text-sm font-medium text-gray-500 truncate'>
                      Income
                    </dt>
                    <dd className='mt-1 text-3xl font-semibold text-gray-900'>
                      $
                      {card.approved_median_income?.toLocaleString()}
                    </dd>
                  </div>
                  <div
                    key='LengthofCredit'
                    className=' py-5 bg-white shadow rounded-lg overflow-hidden sm:min-w-min'
                  >
                    <dt className='text-sm font-medium text-gray-500 truncate'>
                      Length of Credit
                    </dt>
                    <dd className='mt-1 text-3xl font-semibold text-gray-900'>
                      {card.approved_median_length_credit}
                    </dd>
                  </div>
                </dl>
                <p className='mt-2 text-center text-xs text-gray-400 pt-6'>
                  Median based on{" "}
                  {card.rejected_count +
                    card.approved_count}{" "}
                  records with {card.approved_count} approved and{" "}
                  {card.rejected_count} rejected
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className='bg-indigo-50'>
        <div className='max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-24 lg:px-8 lg:flex lg:items-center lg:justify-between'>
          <h2 className='text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl'>
            <span className='block'>Have you applied for this card?</span>
            <span className='block text-indigo-600'>
              Let others know your experience.
            </span>
          </h2>
          <div className='mt-8 flex lg:mt-0 lg:flex-shrink-0'>
            <div className='inline-flex rounded-md shadow'>
              {context.authState.isAuthenticated ? (
                <button
                  onClick={(e) => {
                    showModal();
                  }}
                  className='inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700'
                >
                  Submit
                </button>
              ) : (
                <>
                  <button
                    disabled
                    className='cursor-not-allowed inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-300 '
                  >
                    Log In to Submit
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className='py-12 '>
        <div className='max-w-full mx-auto sm:px-6 lg:px-8'>
          <div className='lg:text-center'>
            <h2 className='text-base text-indigo-600 font-semibold tracking-wide uppercase'>
              DATA POINTS
            </h2>
            <p className='mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl'>
              How other people did
            </p>
            <p className='mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto'>
              User reported results when applying for the{" "}
              {card.card_name} over the past year.
            </p>
          </div>
          <div className='mt-10 mb-10 flex flex-wrap'>
            {chartOne.length > 0 ? (
              <>
                <div className='sm:mx-2 bg-white shadow overflow-hidden sm:rounded-lg sm:min-w-0 sm:w-5/12 min-w-full flex-auto '>
                  {/* <h2 className="text-base font-medium text-gray-900">Test Title</h2> */}
                  <div className='px-1 py-5 sm:px-6 '>
                    <ScatterPlot>
                      {{
                        title: "Credit Score vs Income",
                        Yaxis: "Income (USD)",
                        Xaxis: "Credit Score",
                        series: [
                          {
                            name: "Accepted",
                            color: "#71AC49",
                            data: chartOne[0],
                          },
                          {
                            name: "Rejected",
                            color: "#e53936",
                            data: chartOne[1],
                          },
                        ],
                      }}
                    </ScatterPlot>
                  </div>
                </div>
                <div className='sm:mx-2 bg-white shadow overflow-hidden sm:rounded-lg sm:min-w-0  sm:w-5/12 min-w-full flex-auto'>
                  <div className='px-4 py-5 sm:px-6'>
                    <ScatterPlot>
                      {{
                        title: "Length of Credit vs Credit Score",
                        Yaxis: "Credit Score",
                        Xaxis: "Length of Credit (Year)",
                        series: [
                          {
                            name: "Accepted",
                            color: "#71AC49",
                            data: chartTwo[0],
                          },
                          {
                            name: "Rejected",
                            color: "#e53936",
                            data: chartTwo[1],
                          },
                        ],
                      }}
                    </ScatterPlot>
                  </div>
                </div>
              </>
            ) : (
              <div></div>
            )}
          </div>
        </div>
        <div className='bg-gray-50 overflow-hidden'>
          <div className='relative max-w-7xl mx-auto py-12 sm:px-6 lg:px-8'>
            <svg
              className='absolute top-0 left-full transform -translate-x-1/2 -translate-y-3/4 lg:left-auto lg:right-full lg:translate-x-2/3 lg:translate-y-1/4'
              width={404}
              height={784}
              fill='none'
              viewBox='0 0 404 784'
              aria-hidden='true'
            >
              <defs>
                <pattern
                  id='8b1b5f72-e944-4457-af67-0c6d15a99f38'
                  x={0}
                  y={0}
                  width={20}
                  height={20}
                  patternUnits='userSpaceOnUse'
                >
                  <rect
                    x={0}
                    y={0}
                    width={4}
                    height={4}
                    className='text-gray-200'
                    fill='currentColor'
                  />
                </pattern>
              </defs>
              <rect
                width={404}
                height={784}
                fill='url(#8b1b5f72-e944-4457-af67-0c6d15a99f38)'
              />
            </svg>
            {chartThree.length > 0 ? (
              <div className='relative lg:grid lg:grid-cols-3 lg:gap-x-8'>
                <div className='lg:col-span-1'>
                  <h2 className='text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl'>
                    For people who got approved...
                  </h2>
                </div>
                <div className='mt-10 sm:mx-2 bg-white shadow overflow-hidden sm:rounded-lg  lg:col-span-2'>
                  <div className='sm:px-6 py-5'>
                    <ScatterPlot>
                      {{
                        title: "Starting Credit Limit vs Income",
                        Yaxis: "Starting Credit Limit (USD)",
                        Xaxis: "Income (USD)",
                        series: [
                          {
                            name: "Accepted",
                            color: "rgba(76, 74, 220, .5)",
                            data: chartThree,
                          },
                        ],
                      }}
                    </ScatterPlot>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Card;
