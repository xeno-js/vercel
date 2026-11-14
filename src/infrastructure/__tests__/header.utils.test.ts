import { describe, expect, it } from 'vitest'

import { HeaderUtils } from '../header.utils'

describe('HeaderUtils', () => {
  it('keeps incoming cookie arrays separated with semicolons', () => {
    const headers = HeaderUtils.toIncomingHeaders({
      cookie: ['a=1', 'b=2'],
    })

    expect(headers.get('cookie')).toBe('a=1; b=2')
  })

  it('preserves Set-Cookie as an array in outgoing headers', () => {
    const result = HeaderUtils.toOutgoingHeaderValue('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/'])

    expect(result).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })
})
