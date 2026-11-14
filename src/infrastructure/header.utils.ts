import type { Dictionary } from '@xeno-js/core'
import { Guards } from '@xeno-js/core'

const COOKIE_SEPARATOR = '; '
const DEFAULT_SEPARATOR = ','

export const HeaderUtils = {
  toIncomingHeaders(headers: unknown): Headers {
    const incomingHeaders = new Headers()

    if (!Guards.isDefined(headers) || !Guards.isObject(headers)) {
      return incomingHeaders
    }

    for (const [key, value] of Object.entries(headers as Dictionary<unknown>)) {
      if (!Guards.isDefined(value)) {
        continue
      }

      if (Array.isArray(value)) {
        const separator = key.toLowerCase() === 'cookie' ? COOKIE_SEPARATOR : DEFAULT_SEPARATOR
        const normalized = value
          .map((item) => String(item))
          .filter((item) => !Guards.isNullOrEmpty(item))
          .join(separator)
        if (!Guards.isNullOrEmpty(normalized)) {
          incomingHeaders.set(key, normalized)
        }
        continue
      }

      incomingHeaders.set(key, String(value))
    }

    return incomingHeaders
  },

  toOutgoingHeaderValue(key: string, value: unknown): string | string[] | undefined {
    if (!Guards.isDefined(value)) {
      return undefined
    }

    if (!Array.isArray(value)) {
      return String(value)
    }

    if (key.toLowerCase() === 'set-cookie') {
      return value.map((item) => String(item))
    }

    if (Guards.isNullOrEmpty(value)) {
      return undefined
    }

    return String(value[0])
  },
}
