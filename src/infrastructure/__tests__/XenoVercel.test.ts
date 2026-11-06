import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { IXenoApplication, XenoIncomingRequest } from '@xeno-js/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { XenoVercel } from '../vercel.handler'

const coreMocks = vi.hoisted(() => ({
    isDefined: vi.fn((value: unknown) => value !== undefined && value !== null),
    normalizeHeaders: vi.fn((headers: object) => headers),
    dispatch: vi.fn(),
    generateId: vi.fn(),
}))

vi.mock('@xeno-js/core', () => ({
    ERROR_CODE_MESSAGES: { SYSTEM_ERROR: 'System error' },
    ERROR_CODES: { NOT_FOUND: 'NOT_FOUND', SYSTEM_ERROR: 'SYSTEM_ERROR' },
    Guards: { isDefined: coreMocks.isDefined },
    GuidHelper: { generate: coreMocks.generateId },
    HttpHelper: { normalizeHeaders: coreMocks.normalizeHeaders },
    STATUS_CODES: { NOT_FOUND: 404, NO_CONTENT: 204, INTERNAL_SERVER_ERROR: 500 },
}))

interface Route {
    handler: (input: {
        req: unknown
        handle: (token: string, data: unknown) => Promise<unknown>
    }) => Promise<unknown>
}

const createApp = (matchedRoute: Route | null = null) => {
    const services = {
        routeMatcher: { match: vi.fn().mockReturnValue(matchedRoute) },
        httpAdapter: { adapt: vi.fn((request: XenoIncomingRequest) => request) },
        httpDispatcher: { handle: coreMocks.dispatch },
    }

    return {
        app: { getServices: vi.fn(() => services) } as unknown as IXenoApplication,
        services,
    }
}

const createRequest = (overrides: Partial<VercelRequest> = {}): VercelRequest =>
    ({
        url: '/items?limit=1',
        method: 'POST',
        headers: { 'x-test': 'request-header' },
        signal: new AbortController().signal,
        socket: {},
        body: { value: 1 },
        query: { limit: '1' },
        ...overrides,
    }) as unknown as VercelRequest

const createResponse = () => {
    const response = {
        status: vi.fn<(code: number) => unknown>(),
        json: vi.fn<(data: unknown) => unknown>(),
        end: vi.fn<() => unknown>(),
        setHeader: vi.fn<(name: string, value: string) => unknown>(),
    }
    response.status.mockReturnValue(response)
    return response
}

const handle = (
    req: VercelRequest,
    res: ReturnType<typeof createResponse>,
    getApp: () => Promise<IXenoApplication>,
) => XenoVercel.handle(req, res as unknown as VercelResponse, getApp)

const originalNodeEnv = process.env.NODE_ENV

describe('XenoVercel.handle', () => {
    beforeEach(() => {
        coreMocks.isDefined.mockReset().mockImplementation((value) => value !== undefined && value !== null)
        coreMocks.normalizeHeaders.mockReset().mockImplementation((headers) => headers)
        coreMocks.dispatch.mockReset().mockResolvedValue('dispatched')
        coreMocks.generateId.mockReset().mockReturnValue('generated-id')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV
        } else {
            process.env.NODE_ENV = originalNodeEnv
        }
    })

    it('returns a not-found response and applies default URL and method values', async () => {
        const { app, services } = createApp()
        const req = createRequest({ url: undefined, method: undefined })
        const res = createResponse()

        await handle(req, res, async () => app)

        expect(services.routeMatcher.match).toHaveBeenCalledWith('/', 'GET')
        expect(res.status).toHaveBeenCalledWith(404)
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: 'Route GET / not found',
                path: '/',
            },
        })
        expect(services.httpAdapter.adapt).not.toHaveBeenCalled()
    })

    it('adapts and dispatches a matched request, copies response headers, and returns its result', async () => {
        const route = {
            handler: vi.fn(async ({ handle: dispatch }: Parameters<Route['handler']>[0]) => {
                await dispatch('service-token', { requestId: 'request-1' })
                return {
                    status: 201,
                    data: { success: true },
                    headers: { 'x-response': 'created', 'cache-control': 'no-store' },
                }
            }),
        }
        const { app, services } = createApp(route)
        const req = createRequest()
        const res = createResponse()

        await handle(req, res, async () => app)

        expect(coreMocks.normalizeHeaders).toHaveBeenCalledWith(req.headers)
        const adaptedRequest = services.httpAdapter.adapt.mock.calls[0]?.[0]
        expect(adaptedRequest).toMatchObject({
            url: req.url,
            method: req.method,
            path: '/items',
            signal: req.signal,
            socket: req.socket,
            body: { value: 1 },
            query: req.query,
        })
        expect(adaptedRequest?.headers).toBeInstanceOf(Headers)
        const handlerInput = route.handler.mock.calls[0]?.[0]
        expect(handlerInput?.req).toBe(adaptedRequest)
        expect(typeof handlerInput?.handle).toBe('function')
        expect(coreMocks.dispatch).toHaveBeenCalledWith(adaptedRequest, 'service-token', { requestId: 'request-1' })
        expect(res.setHeader).toHaveBeenCalledWith('x-response', 'created')
        expect(res.setHeader).toHaveBeenCalledWith('cache-control', 'no-store')
        expect(res.status).toHaveBeenCalledWith(201)
        expect(res.json).toHaveBeenCalledWith({ success: true })
    })

    it('returns a matched route result without setting headers when none are provided', async () => {
        const route: Route = {
            handler: async () => ({ status: 202, data: { accepted: true } }),
        }
        const { app } = createApp(route)
        const res = createResponse()

        await handle(createRequest(), res, async () => app)

        expect(res.setHeader).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(202)
        expect(res.json).toHaveBeenCalledWith({ accepted: true })
    })

    it('returns no content when the matched route produces no result', async () => {
        const route: Route = { handler: async () => undefined }
        const { app } = createApp(route)
        const res = createResponse()

        await handle(createRequest(), res, async () => app)

        expect(res.status).toHaveBeenCalledWith(204)
        expect(res.end).toHaveBeenCalledOnce()
        expect(res.json).not.toHaveBeenCalled()
    })

    it('returns a development error response with the thrown Error message', async () => {
        process.env.NODE_ENV = 'development'
        const error = new Error('application unavailable')
        const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const res = createResponse()
        coreMocks.generateId.mockReturnValueOnce('correlation-1').mockReturnValueOnce('request-1')

        await handle(createRequest(), res, async () => {
            throw error
        })

        expect(logError).toHaveBeenCalledWith('Errore fatale nell\'handler Vercel di Xeno:', error)
        expect(res.status).toHaveBeenCalledWith(500)
        const body = res.json.mock.calls[0]?.[0]
        expect(body).toMatchObject({
            success: false,
            error: {
                code: 'SYSTEM_ERROR',
                message: 'System error',
                details: 'application unavailable',
            },
            correlationId: 'correlation-1',
            requestId: 'request-1',
        })
        if (typeof body !== 'object' || body === null || !('timestamp' in body)) {
            throw new Error('The error response must include a timestamp')
        }
        expect(typeof body.timestamp).toBe('string')
    })

    it('uses the generic message and omits error details outside development for non-Error failures', async () => {
        process.env.NODE_ENV = 'production'
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const res = createResponse()

        const getApp = vi.fn<() => Promise<IXenoApplication>>().mockRejectedValue('failure')
        await handle(createRequest(), res, getApp)

        expect(res.status).toHaveBeenCalledWith(500)
        const body = res.json.mock.calls[0]?.[0]
        expect(body).toMatchObject({
            success: false,
            error: {
                code: 'SYSTEM_ERROR',
                message: 'System error',
                details: undefined,
            },
            correlationId: 'generated-id',
            requestId: 'generated-id',
        })
        if (typeof body !== 'object' || body === null || !('timestamp' in body)) {
            throw new Error('The error response must include a timestamp')
        }
        if (typeof body.timestamp !== 'string') {
            throw new Error('The error response timestamp must be a string')
        }
        expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false)
    })
})


