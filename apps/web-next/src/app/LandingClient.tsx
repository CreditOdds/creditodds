'use client';

import Link from "next/link";
import Image from "next/image";
import CardSelect from "@/components/ui/CardSelect";
import { useAuth } from "@/auth/AuthProvider";
import { UserGroupIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Card } from "@/lib/api";

interface LandingClientProps {
  initialCards: Card[];
}

export default function LandingClient({ initialCards }: LandingClientProps) {
  const { authState } = useAuth();

  return (
    <>
      <main className="lg:relative">
        <div className="mx-auto max-w-7xl w-full pt-16 pb-20 text-center lg:py-72 lg:text-left">
          <div className="px-4 lg:w-1/2 sm:px-8 xl:pr-16">
            <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl">
              <span className="block xl:inline">Can I get this </span>
              <span className="block text-indigo-600 xl:inline">card?</span>
            </h1>
            <p className="mt-3 max-w-md mx-auto text-lg text-gray-500 sm:text-xl md:mt-5 md:max-w-3xl">
              Explore what it takes to get approved.
            </p>
            <CardSelect allCards={initialCards} />
          </div>
        </div>
        <div className="relative w-full h-64 sm:h-72 md:h-96 lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 lg:h-full">
          <Image
            className="absolute inset-0 w-full h-full object-cover"
            src="/assets/Graphic-02.svg"
            alt=""
            fill
          />
        </div>
      </main>
      <div className="bg-indigo-900">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              Let data guide your decision on when to apply
            </h2>
            <p className="mt-3 text-xl text-indigo-200 sm:mt-4">
              Get rewarded with card referrals for reporting your results
            </p>
          </div>
          <dl className="mt-10 text-center sm:max-w-3xl sm:mx-auto sm:grid sm:grid-cols-3 sm:gap-8">
            <div className="flex flex-col">
              <dt className="order-2 mt-2 text-lg leading-6 font-medium text-indigo-200">
                Credit Cards
              </dt>
              <dd className="order-1 text-5xl font-extrabold text-white">
                73
              </dd>
            </div>
            <div className="flex flex-col mt-10 sm:mt-0">
              <dt className="order-2 mt-2 text-lg leading-6 font-medium text-indigo-200">
                Records
              </dt>
              <dd className="order-1 text-5xl font-extrabold text-white">
                500+
              </dd>
            </div>
            <div className="flex flex-col mt-10 sm:mt-0">
              <dt className="order-2 mt-2 text-lg leading-6 font-medium text-indigo-200">
                Referrals
              </dt>
              <dd className="order-1 text-5xl font-extrabold text-white">
                Free
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="relative bg-white pt-16 pb-32 overflow-hidden">
        <div className="relative">
          <div className="lg:mx-auto lg:max-w-7xl lg:px-8 lg:grid lg:grid-cols-2 lg:grid-flow-col-dense lg:gap-24">
            <div className="px-4 max-w-xl mx-auto sm:px-6 lg:py-16 lg:max-w-none lg:mx-0 lg:px-0">
              <div>
                <div>
                  <span className="h-12 w-12 rounded-md flex items-center justify-center bg-indigo-600">
                    <UserGroupIcon
                      className="h-6 w-6 text-white"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div className="mt-6">
                  <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
                    See how others did when they applied
                  </h2>
                  <p className="mt-4 text-lg text-gray-500">
                    Explore user submitted data to see how individuals with
                    different credit profiles faired when applying. Our
                    records display acceptance criteria based on factors such
                    as credit score, listed income, length of credit, and
                    more. Search a card to begin evaluating your chances at
                    getting approved.
                  </p>
                  <div className="mt-6">
                    <a
                      href="#"
                      className="inline-flex px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      Get started
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-12 sm:mt-16 lg:mt-0">
              <div className="pl-4 -mr-48 sm:pl-6 md:-mr-16 lg:px-0 lg:m-0 lg:relative lg:h-full">
                <Image
                  className="w-full rounded-xl shadow-xl ring-1 ring-black ring-opacity-5 lg:absolute lg:left-0 lg:h-full lg:w-auto lg:max-w-none"
                  src="https://d3ay3etzd1512y.cloudfront.net/other/Landing_Screen_Shot_Results.png"
                  alt="Inbox user interface"
                  width={800}
                  height={600}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-24">
          <div className="lg:mx-auto lg:max-w-7xl lg:px-8 lg:grid lg:grid-cols-2 lg:grid-flow-col-dense lg:gap-24">
            <div className="px-4 max-w-xl mx-auto sm:px-6 lg:py-32 lg:max-w-none lg:mx-0 lg:px-0 lg:col-start-2">
              <div>
                <div>
                  <span className="h-12 w-12 rounded-md flex items-center justify-center bg-indigo-600">
                    <SparklesIcon
                      className="h-6 w-6 text-white"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div className="mt-6">
                  <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
                    Get rewarded for your results
                  </h2>
                  <p className="mt-4 text-lg text-gray-500">
                    <strong>COMING SOON</strong> When you submit a record to
                    help others you will also have the ability to submit your
                    referral link for your credit cards. Referrals provide you
                    and sometimes the individual who applies an additional
                    bonus on approval. When new users visit the site we will
                    inject uploaded referral codes into the application link.
                    We&apos;ll also keep track of how many times your link has been
                    used.
                  </p>
                  <div className="mt-6">
                    {!authState.isAuthenticated && (
                      <Link href="/register">
                        <button className="inline-flex px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                          Sign Up
                        </button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-12 sm:mt-16 lg:mt-0 lg:col-start-1">
              <div className="pr-4 -ml-48 sm:pr-6 md:-ml-16 lg:px-0 lg:m-0 lg:relative lg:h-full">
                <Image
                  className="w-full rounded-xl shadow-xl ring-1 ring-black ring-opacity-5 lg:absolute lg:right-0 lg:h-full lg:w-auto lg:max-w-none"
                  src="https://d3ay3etzd1512y.cloudfront.net/other/Landing_Screen_Shot_Reward.png"
                  alt="Customer profile user interface"
                  width={800}
                  height={600}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
