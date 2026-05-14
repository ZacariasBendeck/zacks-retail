import type { Request } from 'express';
import {
  createRequestContext,
  getRequestContext,
  getTraceId,
  normalizeRequestId,
  normalizeTraceId,
  parseTraceparent,
  runWithRequestContext,
  setRequestActor,
  traceStep,
} from '../../src/observability/requestContext';

function req(headers: Record<string, string>): Request {
  return {
    method: 'GET',
    originalUrl: '/health',
    url: '/health',
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

describe('request context', () => {
  it('parses W3C traceparent and safe request ids', () => {
    expect(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'))
      .toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeNull();
    expect(normalizeTraceId('4BF92F3577B34DA6A3CE929D0E0E4736')).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(normalizeRequestId('req_123-abc:xyz')).toBe('req_123-abc:xyz');
    expect(normalizeRequestId('bad id with spaces')).toBeNull();
  });

  it('creates a context from request headers', () => {
    const context = createRequestContext(req({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      'x-request-id': 'req-123',
    }));

    expect(context.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(context.requestId).toBe('req-123');
    expect(context.method).toBe('GET');
    expect(context.originalUrl).toBe('/health');
  });

  it('propagates through async work and records redacted timing metadata', async () => {
    const context = createRequestContext(req({ 'x-request-id': 'req-456' }));

    await runWithRequestContext(context, async () => {
      setRequestActor({ actorUserId: 'user-1', sessionId: 'session-1' });
      const result = await traceStep('test.step', async () => {
        await Promise.resolve();
        return 42;
      }, { password: 'secret', filter: 'sku' });

      expect(result).toBe(42);
      expect(getTraceId()).toBe(context.traceId);
      expect(getRequestContext()?.actorUserId).toBe('user-1');
    });

    expect(context.timings).toHaveLength(1);
    expect(context.timings[0]).toEqual(
      expect.objectContaining({
        name: 'test.step',
        metadata: { password: '[redacted]', filter: 'sku' },
      }),
    );
  });

  it('records failed step type without persisting raw exception text', async () => {
    const context = createRequestContext(req({ 'x-request-id': 'req-error-step' }));

    await runWithRequestContext(context, async () => {
      await expect(traceStep('test.failure', async () => {
        throw new TypeError('raw sensitive detail');
      })).rejects.toThrow('raw sensitive detail');
    });

    expect(context.timings[0]).toEqual(
      expect.objectContaining({
        name: 'test.failure',
        error: 'TypeError',
      }),
    );
  });
});
