'use client';

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disclosure, Menu, Transition } from "@headlessui/react";
import { Bars3Icon, XMarkIcon, WalletIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/auth/AuthProvider";
import Image from "next/image";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Navbar() {
  const { logout, authState } = useAuth();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <Disclosure as="nav" className="bg-white shadow">
      {({ open, close }) => (
        <>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <Link href="/">
                    <Image
                      className="h-12 w-auto"
                      src="/assets/CreditOdds_LogoText_with Icon-01.svg"
                      alt="CreditOdds"
                      width={150}
                      height={48}
                    />
                  </Link>
                </div>
                <nav className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link
                    href="/explore"
                    className={classNames(
                      isActive('/explore')
                        ? 'border-indigo-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                      'inline-flex items-center px-1 pt-1 border-b-2 text-md font-medium'
                    )}
                  >
                    Explore Cards
                  </Link>
                  <Link
                    href="/check-odds"
                    className={classNames(
                      isActive('/check-odds')
                        ? 'border-indigo-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                      'inline-flex items-center px-1 pt-1 border-b-2 text-md font-medium'
                    )}
                  >
                    Check Your Odds
                  </Link>
                  <Link
                    href="/news"
                    className={classNames(
                      isActive('/news')
                        ? 'border-indigo-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                      'inline-flex items-center px-1 pt-1 border-b-2 text-md font-medium'
                    )}
                  >
                    Card News
                  </Link>
                  <Link
                    href="/tools"
                    className={classNames(
                      isActive('/tools')
                        ? 'border-indigo-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                      'inline-flex items-center px-1 pt-1 border-b-2 text-md font-medium'
                    )}
                  >
                    Tools
                  </Link>
                </nav>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:items-center">
                {authState.isAuthenticated ? (
                  <>
                    <Link
                      href="/profile"
                      className={classNames(
                        isActive('/profile')
                          ? 'text-indigo-600'
                          : 'text-gray-500 hover:text-gray-700',
                        'flex items-center gap-1.5 px-3 py-2 text-sm font-medium'
                      )}
                    >
                      <WalletIcon className="h-5 w-5" aria-hidden="true" />
                      Your Wallet
                    </Link>
                    <Menu as="div" className="ml-3 relative z-10">
                    {({ open: menuOpen }) => (
                      <>
                        <div>
                          <Menu.Button className="bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            <span className="sr-only">Open user menu</span>
                            <Image
                              className="h-8 w-8 rounded-full"
                              src="https://d3ay3etzd1512y.cloudfront.net/other/profile_pic.svg"
                              alt=""
                              width={32}
                              height={32}
                            />
                          </Menu.Button>
                        </div>
                        <Transition
                          show={menuOpen}
                          as={Fragment}
                          enter="transition ease-out duration-200"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items
                            static
                            className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none cursor-pointer"
                          >
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/profile"
                                  className={classNames(
                                    active ? "bg-gray-100" : "",
                                    "block px-4 py-2 text-sm text-gray-700"
                                  )}
                                >
                                  Profile
                                </Link>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={logout}
                                  className={classNames(
                                    active ? "bg-gray-100" : "",
                                    "block w-full text-left px-4 py-2 text-sm text-gray-700"
                                  )}
                                >
                                  Sign Out
                                </button>
                              )}
                            </Menu.Item>
                          </Menu.Items>
                        </Transition>
                      </>
                    )}
                  </Menu>
                  </>
                ) : (
                  <Link href="/login">
                    <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-500 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                      Sign In
                    </button>
                  </Link>
                )}
              </div>
              <div className="-mr-2 flex items-center sm:hidden">
                <Disclosure.Button className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500">
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>
            </div>
          </div>

          <Disclosure.Panel className="sm:hidden">
            <nav className="pt-2 pb-3 space-y-1">
              <Link
                href="/explore"
                onClick={() => close()}
                className={classNames(
                  isActive('/explore')
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700',
                  'block pl-3 pr-4 py-2 border-l-4 text-base font-medium'
                )}
              >
                Explore Cards
              </Link>
              <Link
                href="/check-odds"
                onClick={() => close()}
                className={classNames(
                  isActive('/check-odds')
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700',
                  'block pl-3 pr-4 py-2 border-l-4 text-base font-medium'
                )}
              >
                Check Your Odds
              </Link>
              <Link
                href="/news"
                onClick={() => close()}
                className={classNames(
                  isActive('/news')
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700',
                  'block pl-3 pr-4 py-2 border-l-4 text-base font-medium'
                )}
              >
                Card News
              </Link>
              <Link
                href="/tools"
                onClick={() => close()}
                className={classNames(
                  isActive('/tools')
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700',
                  'block pl-3 pr-4 py-2 border-l-4 text-base font-medium'
                )}
              >
                Tools
              </Link>
            </nav>
            <div className="pb-3 border-t border-gray-200">
              <div className="mt-3 space-y-1">
                {authState.isAuthenticated ? (
                  <>
                    <Link
                      href="/profile"
                      onClick={() => close()}
                      className={classNames(
                        isActive('/profile')
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                          : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700',
                        'flex items-center gap-2 pl-3 pr-4 py-2 border-l-4 text-base font-medium'
                      )}
                    >
                      <WalletIcon className="h-5 w-5" aria-hidden="true" />
                      Your Wallet
                    </Link>
                    <button
                      onClick={() => { close(); logout(); }}
                      className="block w-full text-left px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => close()}
                    className="block px-4 py-2 text-base font-medium text-indigo-600 hover:text-indigo-800 hover:bg-gray-100"
                  >
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}
