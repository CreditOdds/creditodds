import React from "react";
import { Helmet } from "react-helmet-async";
import howImage from "../assets/Graphic-03.svg";

const How = () => {
  return (
    <>
      <Helmet>
        <title>{"How it works | CreditOdds"}</title>
        <meta name='description' content='How CreditOdds works' />
      </Helmet>
      <div className='relative py-16 bg-white overflow-hidden'>
        <div className='hidden lg:block lg:absolute lg:inset-y-0 lg:h-full lg:w-full'>
          <div
            className='relative h-full text-lg max-w-prose mx-auto'
            aria-hidden='true'
          >
            <svg
              className='absolute top-12 left-full transform translate-x-32'
              width={404}
              height={384}
              fill='none'
              viewBox='0 0 404 384'
            >
              <defs>
                <pattern
                  id='74b3fd99-0a6f-4271-bef2-e80eeafdf357'
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
                height={384}
                fill='url(#74b3fd99-0a6f-4271-bef2-e80eeafdf357)'
              />
            </svg>
            <svg
              className='absolute top-1/2 right-full transform -translate-y-1/2 -translate-x-32'
              width={404}
              height={384}
              fill='none'
              viewBox='0 0 404 384'
            >
              <defs>
                <pattern
                  id='f210dbf6-a58d-4871-961e-36d5016a0f49'
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
                height={384}
                fill='url(#f210dbf6-a58d-4871-961e-36d5016a0f49)'
              />
            </svg>
            <svg
              className='absolute bottom-12 left-full transform translate-x-32'
              width={404}
              height={384}
              fill='none'
              viewBox='0 0 404 384'
            >
              <defs>
                <pattern
                  id='d3eb07ae-5182-43e6-857d-35c643af9034'
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
                height={384}
                fill='url(#d3eb07ae-5182-43e6-857d-35c643af9034)'
              />
            </svg>
          </div>
        </div>
        <div className='relative px-4 sm:px-6 lg:px-8'>
          <div className='text-lg max-w-prose mx-auto'>
            <h1>
              <span className='block text-base text-center text-indigo-600 font-semibold tracking-wide uppercase'>
                HOW
              </span>
              <span className='mt-2 block text-3xl text-center leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl'>
                Our approach to credit card odds
              </span>
            </h1>
            <p className='mt-8 text-xl text-gray-500 leading-8'>
              CreditOdds is very much a work in progress.
              The goal of this site is to highlight the metrics required to get
              approved for any given credit card. Initially, I sourced this data
              from reddit (shout out /r/CreditCards) and other credit card
              forums. This approach isn't scalable and I am hoping that this
              site provides a medium for collecting this information at scale.
              While I have a backlog of features I'd like to achieve, this early
              version of CreditOdds{" "}
              <strong>will rely heavily on the good will of you</strong> to
              report your results to help others.
            </p>
          </div>
          <div className='mt-6 prose prose-indigo prose-lg text-gray-500 mx-auto'>
            <p>
              When a user signs up they have the ability to report a result on
              any card. We ask for a few pieces of important information when
              submiting a result:
            </p>
            <ul>
              <li>Credit Score</li>
              <li>Income</li>
              <li>Application Date</li>
              <li>Age of Oldest Account (Length of Credit)</li>
              <li>Existing Account with Bank</li>
              <li>Approved?</li>
            </ul>
            <p>If approved:</p>
            <ul>
              <li>Starting Credit Limit</li>
            </ul>
            <p>If rejected:</p>
            <ul>
              <li>Reason provided</li>
            </ul>
            <p>
              There are many other questions I'd like to ask, but this is the
              baseline that I feel people will answer. I selected these fields
              because it is what you will likely see on most card applications.
              Additionally your credit score gives a good high level analysis of
              what the bank sees when they pull your credit.
            </p>
            <figure>
            <img
              className="w-full rounded-lg"
              src={howImage}
              alt=""
              width={660}
              height={438}
            />
          </figure>
            <p>
              This is by no means an exact science. As I've mentioned before,
              there are special exceptions which I don't currently account for
              in my reporting template. If you have questions, comments, or
              concerns I invite you to start a discussion with me on{" "}
              <a href='https://twitter.com/MaxwellMelcher' target='_blank'>
                twitter
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
export default How;
