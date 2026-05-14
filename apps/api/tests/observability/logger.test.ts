import { PINO_REDACTION_PATHS, redactForLog } from '../../src/observability/logger';

describe('observability logger redaction', () => {
  it('redacts common credential fields without removing safe trace metadata', () => {
    const redacted = redactForLog({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      requestId: 'req-123',
      password: 'secret',
      nested: {
        authorization: 'Bearer token',
        apiKey: 'abc',
        sessionId: 'session-is-safe-metadata',
      },
    });

    expect(redacted).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      requestId: 'req-123',
      password: '[redacted]',
      nested: {
        authorization: '[redacted]',
        apiKey: '[redacted]',
        sessionId: 'session-is-safe-metadata',
      },
    });
  });

  it('configures pino redaction for raw request credentials', () => {
    expect(PINO_REDACTION_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
      ]),
    );
  });
});
