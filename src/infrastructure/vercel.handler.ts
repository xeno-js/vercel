import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Dictionary, IXenoApplication, XenoIncomingRequest, XenoRegistry } from '@xeno-js/core'
import { ERROR_CODE_MESSAGES, ERROR_CODES, Guards, GuidHelper, STATUS_CODES } from '@xeno-js/core'

import { HeaderUtils } from './header.utils'

export class XenoVercel {
  public static async handle<TRegistry extends XenoRegistry = XenoRegistry>(
    req: VercelRequest,
    res: VercelResponse,
    getApp: () => Promise<IXenoApplication<TRegistry>>,
  ): Promise<VercelResponse> {
    try {
      const app = await getApp()
      const { routeMatcher, httpAdapter, httpDispatcher } = app.getServices()

      const url = req.url ?? '/'
      const method = req.method ?? 'GET'

      const matchedRoute = routeMatcher.match(url, method)

      if (!Guards.isDefined(matchedRoute)) {
        return res.status(STATUS_CODES.NOT_FOUND).json({
          success: false,
          error: {
            code: ERROR_CODES.NOT_FOUND,
            message: `Route ${method} ${url} not found`,
            path: url,
          },
        })
      }

      const incomingHeaders = HeaderUtils.toIncomingHeaders(req.headers)

      if (Guards.isDefined(req.cookies) && !incomingHeaders.has('cookie')) {
        const cookieString = Object.entries(req.cookies)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ')
        incomingHeaders.set('cookie', cookieString)
      }

      const xenoreq: XenoIncomingRequest = {
        url,
        headers: incomingHeaders,
        signal: req.signal,
        socket: req.socket,
        body: req.body,
        query: req.query as Dictionary<string>,
        method,
        path: new URL(url, 'http://localhost').pathname,
      }

      const extendedRequest = httpAdapter.adapt(xenoreq)

      const routeResult = await matchedRoute.handler({
        req: extendedRequest,
        handle: (token, input) => httpDispatcher.handle(extendedRequest, token, input),
      })

      if (Guards.isDefined(routeResult)) {
        if (Guards.isDefined(routeResult.headers)) {
          for (const [key, value] of Object.entries(routeResult.headers as Dictionary<unknown>)) {
            const headerValue = HeaderUtils.toOutgoingHeaderValue(key, value)
            if (Guards.isDefined(headerValue)) {
              res.setHeader(key, headerValue)
            }
          }
        }
        return res.status(routeResult.status).json(routeResult.data)
      }

      return res.status(STATUS_CODES.NO_CONTENT).end()
    } catch (error) {
      console.error('Fatal error during request handling:', error)
      if (res.headersSent) return res
      const isDev = process.env.NODE_ENV === 'development'
      const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'

      res.setHeader('Content-Type', 'application/json')
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: {
          code: ERROR_CODES.SYSTEM_ERROR,
          message: ERROR_CODE_MESSAGES[ERROR_CODES.SYSTEM_ERROR],
          details: isDev ? errorMessage : undefined,
        },
        correlationId: GuidHelper.generate(),
        requestId: GuidHelper.generate(),
        timestamp: new Date().toISOString(),
      })
    }
  }
}
