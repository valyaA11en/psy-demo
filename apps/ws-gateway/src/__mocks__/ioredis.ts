type Listener = (...args: any[]) => void;

const listeners = new Map<string, Listener>();

const mockRedisInstance: any = {
  on: jest.fn((event: string, handler: Listener) => {
    listeners.set(event, handler);
    return mockRedisInstance;
  }),
  quit: jest.fn().mockResolvedValue("OK"),
  exists: jest.fn().mockResolvedValue(0),
  subscribe: jest.fn().mockResolvedValue(1),
  set: jest.fn().mockResolvedValue("OK"),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  publish: jest.fn().mockResolvedValue(1),
  lpush: jest.fn().mockResolvedValue(1),
  pipeline: jest.fn(() => ({
    set: jest.fn().mockReturnThis(),
    publish: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  })),
};

const Redis = jest.fn().mockImplementation(() => mockRedisInstance);

export const __getRedisMock = () => mockRedisInstance;

export const __emitRedisEvent = (event: string, ...args: any[]) => {
  listeners.get(event)?.(...args);
};

export const __resetRedisMock = () => {
  listeners.clear();
  mockRedisInstance.on.mockClear().mockImplementation((event: string, handler: Listener) => {
    listeners.set(event, handler);
    return mockRedisInstance;
  });
  mockRedisInstance.quit.mockClear().mockResolvedValue("OK");
  mockRedisInstance.exists.mockClear().mockResolvedValue(0);
  mockRedisInstance.subscribe.mockClear().mockResolvedValue(1);
  mockRedisInstance.set.mockClear().mockResolvedValue("OK");
  mockRedisInstance.get.mockClear().mockResolvedValue(null);
  mockRedisInstance.del.mockClear().mockResolvedValue(1);
  mockRedisInstance.publish.mockClear().mockResolvedValue(1);
  mockRedisInstance.lpush.mockClear().mockResolvedValue(1);
  mockRedisInstance.pipeline.mockClear().mockImplementation(() => ({
    set: jest.fn().mockReturnThis(),
    publish: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  }));
  (Redis as jest.Mock).mockClear().mockImplementation(() => mockRedisInstance);
};

export default Redis;
