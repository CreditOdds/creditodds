import { Fragment, useRef, useState, useContext } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { LinkIcon } from "@heroicons/react/outline";
import { Listbox } from "@headlessui/react";
import { CheckIcon, SelectorIcon } from "@heroicons/react/solid";
import { useFormik } from "formik";
import * as Yup from "yup";
import { AccountContext } from "../auth/Account";
import axiosInstance from "../services/CustomAxios";
import { ToastContainer, toast } from "react-toastify";
import config from "../config";

export default function Example({ handleClose, show, children }) {
  const [open, setOpen] = useState(true);
  const { getSession } = useContext(AccountContext);

  const cancelButtonRef = useRef();
  function classNames(...classes) {
    return classes.filter(Boolean).join(" ");
  }

  const formik = useFormik({
    initialValues: {
      card_id: 0,
      referral_link: "",
    },
    validationSchema: Yup.object({
      referral_link: Yup.string()
        .min(3, "Referral link must be at least 3 characters")
        .max(250, "Referral link cannot be more than 250 characters")
        .required("Required"),
    }),
    onSubmit: async (values) => {
      values.card_id = selected.card_id;
      const session = await getSession();
      const idToken = session.idToken.jwtToken;
      await axiosInstance.post(
        `${config.api.baseURL}/referrals`,
        values,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      toast.success("Your referral was submitted!", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
      handleClose();
    },
  });

  const people = [
    {
      id: 1,
      card_name: "Select a card...",
      avatar:
        "https://images.unsplash.com/photo-1491528323818-fdd1faba62cc?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
  ];

  const [selected, setSelected] = useState(people[0]);

  return (
    <Transition.Root show={show} as={Fragment}>
      <Dialog
        as='div'
        static
        className='fixed z-10 inset-0 overflow-y-auto'
        initialFocus={cancelButtonRef}
        open={open}
        onClose={handleClose}
      >
        <div className='flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0'>
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-300'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-in duration-200'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <Dialog.Overlay className='fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity' />
          </Transition.Child>

          {/* This element is to trick the browser into centering the modal contents. */}
          <span
            className='hidden sm:inline-block sm:align-middle sm:h-screen'
            aria-hidden='true'
          >
            &#8203;
          </span>
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-300'
            enterFrom='opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
            enterTo='opacity-100 translate-y-0 sm:scale-100'
            leave='ease-in duration-200'
            leaveFrom='opacity-100 translate-y-0 sm:scale-100'
            leaveTo='opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
          >
            <div className='inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left  shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6'>
              <div>
                <div className='mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100'>
                  <LinkIcon
                    className='h-6 w-6 text-indigo-600'
                    aria-hidden='true'
                  />
                </div>
                <div className='mt-3 text-center sm:mt-5'>
                  <Dialog.Title
                    as='h3'
                    className='text-lg leading-6 font-medium text-gray-900'
                  >
                    Submit a referral
                  </Dialog.Title>
                  <div className='mt-2'>
                    <Listbox value={selected} onChange={setSelected}>
                      {({ open }) => (
                        <>
                          <Listbox.Label className='block text-sm font-medium text-gray-700'>
                            Select card
                          </Listbox.Label>
                          <div className='mt-1 relative'>
                            <Listbox.Button className='relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm'>
                              <span className='flex items-center'>
                                <img
                                  src={`https://credit-card-data-site.s3.us-east-2.amazonaws.com/cardimages/${selected.card_image_link}`}
                                  alt=''
                                  className='flex-shrink-0 h-12 w-20'
                                />
                                <span className='ml-3 block truncate'>
                                  {selected.card_name}
                                </span>
                              </span>
                              <span className='ml-3 absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none'>
                                <SelectorIcon
                                  className='h-5 w-5 text-gray-400'
                                  aria-hidden='true'
                                />
                              </span>
                            </Listbox.Button>

                            <Transition
                              show={open}
                              as={Fragment}
                              leave='transition ease-in duration-100'
                              leaveFrom='opacity-100'
                              leaveTo='opacity-0'
                            >
                              <Listbox.Options
                                static
                                className='absolute z-10 mt-1 w-full bg-white shadow-lg max-h-56 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm'
                              >
                                {children.map((card) => (
                                  <Listbox.Option
                                    key={card.card_name}
                                    className={({ active }) =>
                                      classNames(
                                        active
                                          ? "text-white bg-indigo-600"
                                          : "text-gray-900",
                                        "cursor-default select-none relative py-2 pl-3 pr-9"
                                      )
                                    }
                                    value={card}
                                  >
                                    {({ selected, active }) => (
                                      <>
                                        <div className='flex items-center'>
                                          <img
                                            src={`https://credit-card-data-site.s3.us-east-2.amazonaws.com/cardimages/${card.card_image_link}`}
                                            alt=''
                                            className='flex-shrink-0 h-12 w-20'
                                          />
                                          <span
                                            className={classNames(
                                              selected
                                                ? "font-semibold"
                                                : "font-normal",
                                              "ml-3 block truncate"
                                            )}
                                          >
                                            {card.card_name}
                                          </span>
                                        </div>

                                        {selected ? (
                                          <span
                                            className={classNames(
                                              active
                                                ? "text-white"
                                                : "text-indigo-600",
                                              "absolute inset-y-0 right-0 flex items-center pr-4"
                                            )}
                                          >
                                            <CheckIcon
                                              className='h-5 w-5'
                                              aria-hidden='true'
                                            />
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </>
                      )}
                    </Listbox>
                  </div>
                </div>
              </div>
              <br></br>
              <form onSubmit={formik.handleSubmit}>
                <div className='mt-1 flex rounded-md shadow-sm'>
                  <span className='inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm'>
                    {selected.card_referral_link}
                  </span>
                  <input
                    type='text'
                    name='referral_link'
                    id='referral_link'
                    className='flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border-gray-300'
                    placeholder='(your code here)'
                    onChange={formik.handleChange}
                    value={formik.values.referral_link}
                  />
                </div>
                {formik.errors.referral_link ? (
                            <p
                              className='mt-2 text-sm text-red-600'
                              id='email-error'
                            >
                              {formik.errors.referral_link}
                            </p>
                          ) : (null)}
                <div className='mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense'>
                  <button
                    type='submit'
                    className='w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:col-start-2 sm:text-sm'
                    onClick={formik.handleSubmit}
                  >
                    Submit
                  </button>
                  <button
                    type='button'
                    className='mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm'
                    onClick={handleClose}
                    ref={cancelButtonRef}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
