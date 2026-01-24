import axiosInstance from './CustomAxios';
import config from '../config';

const api = {
  // Card endpoints
  cards: {
    getAll: () => axiosInstance.get(`${config.api.baseURL}/cards`),
    getByName: (cardName) => axiosInstance.get(`${config.api.baseURL}/card`, {
      params: { card_name: cardName }
    }),
    getGraphs: (cardName) => axiosInstance.get(`${config.api.baseURL}/graphs`, {
      params: { card_name: cardName }
    }),
  },

  // Record endpoints
  records: {
    getAll: (token) => axiosInstance.get(`${config.api.baseURL}/records`, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    create: (data, token) => axiosInstance.post(`${config.api.baseURL}/records`, data, {
      headers: { Authorization: `Bearer ${token}` }
    }),
  },

  // Referral endpoints
  referrals: {
    getAll: (token) => axiosInstance.get(`${config.api.baseURL}/referrals`, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    create: (data, token) => axiosInstance.post(`${config.api.baseURL}/referrals`, data, {
      headers: { Authorization: `Bearer ${token}` }
    }),
  },

  // Profile endpoint
  profile: {
    get: (token) => axiosInstance.get(`${config.api.baseURL}/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    }),
  },
};

export default api;
