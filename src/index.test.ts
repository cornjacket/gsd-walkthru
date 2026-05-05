import { describe, it, expect } from 'vitest'
import { VERSION } from './index.js'

describe('express-webhook-validator', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string')
    expect(VERSION.length).toBeGreaterThan(0)
  })
})
