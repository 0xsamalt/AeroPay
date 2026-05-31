/// <reference types="jest" />
import { Request, Response } from 'express';
import { flashOr402 } from '../flashOr402';
import { FlashMiddlewareConfig } from '../types';

// Mock response object
const createMockResponse = () => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Mock request object
const createMockRequest = (headers: Record<string, string> = {}, body: any = {}): any => {
  return {
    headers,
    body,
  };
};

describe('flashOr402 Middleware', () => {
  const config: FlashMiddlewareConfig = {
    merchantAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    settlementAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    token: '0x0000000000000000000000000000000000000000',
    chainId: 25,
    price: '50000',
    gatewayUrl: 'http://localhost:3000',
    description: 'Test API',
    skipValidation: true, // Skip validation for tests
  };

  const mockHandler = jest.fn(async (req, res) => {
    res.json({ success: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 402 when no Flash payment header is present', async () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn();

    const middleware = flashOr402(config, mockHandler);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      amount: '50000',
      token: config.token,
      recipient: config.settlementAddress,
      chainId: config.chainId,
      description: 'Test API',
    });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('should call handler when valid Flash payment header is present', async () => {
    const flashHeader = JSON.stringify({
      user: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      merchant: config.merchantAddress,
      amount: '50000',
      token: config.token,
      nonce: '1',
      deadline: '9999999999',
      signature: '0x1234',
      gatewayUrl: config.gatewayUrl,
    });

    const req = createMockRequest({
      'x-flash-payment': flashHeader,
    });
    const res = createMockResponse();
    const next = jest.fn();

    const middleware = flashOr402(config, mockHandler);
    await middleware(req, res, next);

    expect(mockHandler).toHaveBeenCalled();
    expect(req.isPaidViaFlash).toBe(true);
    expect(req.flashPayment).toBeDefined();
  });

  test('should return 400 when Flash header is malformed', async () => {
    const req = createMockRequest({
      'x-flash-payment': 'invalid-json',
    });
    const res = createMockResponse();
    const next = jest.fn();

    const middleware = flashOr402(config, mockHandler);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid Flash payment header format',
    });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('should return 402 when Flash header is missing required fields', async () => {
    const flashHeader = JSON.stringify({
      user: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      // Missing other required fields
    });

    const req = createMockRequest({
      'x-flash-payment': flashHeader,
    });
    const res = createMockResponse();
    const next = jest.fn();

    const middleware = flashOr402(config, mockHandler);
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('should attach payment info to request object', async () => {
    const flashHeader = JSON.stringify({
      user: '0xUSER123',
      merchant: config.merchantAddress,
      amount: '50000',
      token: config.token,
      nonce: '5',
      deadline: '9999999999',
      signature: '0xSIG',
      gatewayUrl: config.gatewayUrl,
    });

    const req = createMockRequest({
      'x-flash-payment': flashHeader,
    });
    const res = createMockResponse();
    const next = jest.fn();

    const middleware = flashOr402(config, mockHandler);
    await middleware(req, res, next);

    expect(req.flashPayment?.user).toBe('0xUSER123');
    expect(req.flashPayment?.nonce).toBe('5');
    expect(req.isPaidViaFlash).toBe(true);
  });
});