import axios from 'axios';
import { toast } from 'react-toastify';

// axios instance for making requests 
const axiosInstance = axios.create();

// Add a response interceptor
axiosInstance.interceptors.response.use(function (response) {
    // Any status code that lie within the range of 2xx cause this function to trigger
    // Do something with response data
    return response;
  }, function (error) {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Do something with response error
    toast.error(`${error.response.data}`, {
      position: "top-right",
      autoClose: 10000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      });
    return Promise.reject(error);
  });
// request interceptor for adding token
axiosInstance.interceptors.request.use((config) => {
  // add token to request headers
//   config.headers['Authorization'] = localStorage.getItem('token');

  return config;
});

export default axiosInstance;