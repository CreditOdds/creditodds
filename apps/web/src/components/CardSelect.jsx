import React from "react";
import Downshift from "downshift";
import { useHistory } from "react-router-dom";

function CardSelect(props) {
  const history = useHistory();

  return (
    <Downshift
      onChange={(selection) => history.push(`/card/${selection.card_name}`)}
      itemToString={(item) => (item ? item.card_name : "")}
    >
      {({
        getInputProps,
        getItemProps,
        getLabelProps,
        getMenuProps,
        isOpen,
        inputValue,
        highlightedIndex,
        selectedItem,
        getRootProps,
      }) => (
        <div className='mt-1'>
          <label htmlFor='search' className='sr-only' {...getLabelProps()}>
            Select a Credit Card
          </label>
          <div
            //   style={{display: 'inline-block'}}

            {...getRootProps({}, { suppressRefError: true })}
          >
            <input
              {...getInputProps()}
              id='search'
              name='search'
              className='shadow-sm text-xl border focus:ring-indigo-500 focus:border-indigo-500 block w-full border-gray-300 rounded-md h-12'
              placeholder='Search a Credit Card'
              type='search'
            />
            <ul
              {...getMenuProps()}
              className='absolute mt-1  bg-white shadow-lg max-h-56 rounded-lg py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm'
              tabIndex='-1'
              role='listbox'
              aria-labelledby='listbox-label'
              aria-activedescendant='listbox-option-3'
            >
              {isOpen
                ? props.allCards
                    .filter(
                      (item) =>
                        !inputValue ||
                        item.card_name
                          .toLowerCase()
                          .includes(inputValue.toLowerCase())
                    )
                    .map((item, index) => (
                      <li
                        className='text-gray-900 cursor-default select-none relative py-2 pl-3 pr-9 z-10 text-xl h-14'
                        {...getItemProps({
                          key: item.card_name,
                          index,
                          item,
                          style: {
                            backgroundColor:
                              highlightedIndex === index
                                ? "lightgray"
                                : "white",
                            fontWeight:
                              selectedItem === item ? "bold" : "normal",
                          },
                        })}
                      >
                        <div className='flex items-center'>
                          <img
                            src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${item.card_image_link}`}
                            alt=''
                            className='flex-shrink-0 h-8 w-12'
                          />
                          <span className='font-normal ml-3 block truncate'>
                            {item.card_name}
                          </span>
                        </div>
                      </li>
                    ))
                : null}
            </ul>
          </div>
        </div>
      )}
    </Downshift>
  );
}

export default CardSelect;
