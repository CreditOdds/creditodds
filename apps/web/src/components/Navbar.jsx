import React, { useContext } from "react";
import { Link, NavLink } from "react-router-dom";
import { Fragment } from "react";
import { Disclosure, Menu, Transition } from "@headlessui/react";
import { MenuIcon, XIcon } from "@heroicons/react/outline";
import { AccountContext } from "../auth/Account";
import navLogo from '../assets/CreditOdds_LogoText_with Icon-01.svg'

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Navbar() {
  const { logout, authState } = useContext(AccountContext);

  return (
    <Disclosure as='nav' className='bg-white shadow'>
      {({ open }) => (
        <>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
            <div className='flex justify-between h-16'>
              <div className='flex'>
                <div className='flex-shrink-0 flex items-center'>
                  <Link to='/'>
                    <span>
                    <img className="mx-auto h-12 w-auto" src={process.env.PUBLIC_URL + navLogo} alt="Workflow" />
                      {/* <h1 className='font-bold text-3xl float-left'>
                        Credit
                      </h1>
                      <h1 className='font-bold text-3xl float-right text-indigo-600'>
                        Odds
                      </h1> */}
                    </span>
                  </Link>
                </div>
                <nav className='hidden sm:ml-6 sm:flex sm:space-x-8'>
                  <NavLink
                    exact
                    to='/how'
                    className='border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-md font-medium'
                    activeClassName='border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-md font-medium'
                  >
                    How it works
                  </NavLink>
                </nav>
              </div>
              <div className='hidden sm:ml-6 sm:flex sm:items-center'>
                {/* Profile dropdown or login depending on status*/}
                <div>
                  {authState.isAuthenticated ? (
                    <Menu as='div' className='ml-3 relative z-10'>
                      {({ open }) => (
                        <>
                          <div>
                            <Menu.Button className='bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'>
                              <span className='sr-only'>Open user menu</span>
                              <img
                                className='h-8 w-8 rounded-full'
                                src='https://d3ay3etzd1512y.cloudfront.net/other/profile_pic.svg'
                                alt=''
                              />
                            </Menu.Button>
                          </div>
                          <Transition
                            show={open}
                            as={Fragment}
                            enter='transition ease-out duration-200'
                            enterFrom='transform opacity-0 scale-95'
                            enterTo='transform opacity-100 scale-100'
                            leave='transition ease-in duration-75'
                            leaveFrom='transform opacity-100 scale-100'
                            leaveTo='transform opacity-0 scale-95'
                          >
                            <Menu.Items
                              static
                              className='origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none cursor-pointer'
                            >
                              <Menu.Item>
                                {({ active }) => (
                                  <Link
                                    to='/profile'
                                    className={classNames(
                                      active ? "bg-gray-100" : "",
                                      "block px-4 py-2 text-sm text-gray-700 "
                                    )}
                                  >
                                    Profile
                                  </Link>
                                )}
                              </Menu.Item>
                              <Menu.Item>
                                {({ active }) => (
                                  <a
                                    onClick={logout}
                                    className={classNames(
                                      active ? "bg-gray-100" : "",
                                      "block px-4 py-2 text-sm text-gray-700"
                                    )}
                                  >
                                    Sign Out
                                  </a>
                                )}
                              </Menu.Item>
                            </Menu.Items>
                          </Transition>
                        </>
                      )}
                    </Menu>
                  ) : (
                    <div>
                      <Link to='/login'>
                        <button className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'>
                          Log In
                        </button>
                      </Link>
                      <Link to='/register'>
                        <button className='ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-500 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'>
                          Register
                        </button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              <div className='-mr-2 flex items-center sm:hidden'>
                {/* Mobile menu button */}
                <Disclosure.Button className='inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500'>
                  <span className='sr-only'>Open main menu</span>
                  {open ? (
                    <XIcon className='block h-6 w-6' aria-hidden='true' />
                  ) : (
                    <MenuIcon className='block h-6 w-6' aria-hidden='true' />
                  )}
                </Disclosure.Button>
              </div>
            </div>
          </div>

          <Disclosure.Panel className='sm:hidden'>
            <nav className='pt-2 pb-3 space-y-1'>
              <NavLink
                exact
                to='/how'
                className='border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium'
                activeClassName='bg-indigo-50 border-indigo-500 text-indigo-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium'
              >
                How it works
              </NavLink>
            </nav>
            <div className='pb-3 border-t border-gray-200'>
              <div className='mt-3 space-y-1'>
                {authState.isAuthenticated ? (
                  <>
                  <NavLink
                exact
                to='/profile'
                className='border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium'
                activeClassName='bg-indigo-50 border-indigo-500 text-indigo-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium'
              >
                Profile
              </NavLink>
                    <a
                      onClick={logout}
                      className='block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                    >
                      Sign out
                    </a>
                  </>
                ) : (
                  <>
                    <Link
                      to='/login'
                      //onClick={logout}
                      className='block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                    >
                      Log In
                    </Link>
                    <Link
                      to='/register'
                      //onClick={logout}
                      className='block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                    >
                      Register
                    </Link>
                  </>
                )}
              </div>
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}

export default Navbar;
