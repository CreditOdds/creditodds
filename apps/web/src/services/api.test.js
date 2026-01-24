import api from './api';
import axiosInstance from './CustomAxios';

jest.mock('./CustomAxios');

describe('API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cards', () => {
    it('should call getAll endpoint', () => {
      api.cards.getAll();
      expect(axiosInstance.get).toHaveBeenCalled();
    });

    it('should call getByName with correct params', () => {
      const cardName = 'Test Card';
      api.cards.getByName(cardName);
      expect(axiosInstance.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: { card_name: cardName }
        })
      );
    });
  });

  describe('records', () => {
    it('should call getAll with authorization header', () => {
      const token = 'test-token';
      api.records.getAll(token);
      expect(axiosInstance.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Authorization: `Bearer ${token}` }
        })
      );
    });

    it('should call create with data and authorization header', () => {
      const token = 'test-token';
      const data = { test: 'data' };
      api.records.create(data, token);
      expect(axiosInstance.post).toHaveBeenCalledWith(
        expect.any(String),
        data,
        expect.objectContaining({
          headers: { Authorization: `Bearer ${token}` }
        })
      );
    });
  });
});
