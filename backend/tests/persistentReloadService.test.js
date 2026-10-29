import { describe, expect, it, vi } from 'vitest'
import { brands, companies, outlets } from '../data/mockData.js'
import { createQuotationService } from '../services/quotationService.js'
import { createCreditAllocationService } from '../services/creditAllocationService.js'
import { createPersistentReloadService } from '../services/persistentReloadService.js'

const firstReload = {
  operationId: 'silvertree-reload-001',
  brandId: 'silvertree',
  creditsByOutlet: { 'st-001': '100', 'st-003': '200' },
}

function createRedisStub() {
  const savedOperations = new Map()

  // These are the responses the service receives from Redis. The stub does not
  // execute the Lua script or pretend to verify Redis transaction behaviour.
  return {
    get: vi.fn(async (key) => savedOperations.get(key) ?? null),
    hgetall: vi.fn(async () => []),
    llen: vi.fn(async () => 0),
    lrange: vi.fn(async () => []),
    eval: vi.fn(async (_script, [operationKey], [record]) => {
      savedOperations.set(operationKey, record)
      return [1, record]
    }),
  }
}

function createService(redis) {
  return createPersistentReloadService({
    redis,
    quotationService: createQuotationService({ brands, companies, outlets }),
    validateAllocation(quotation) {
      createCreditAllocationService({ companies, outlets }).allocate(quotation)
    },
    companies,
    outlets,
  })
}

describe('Redis credit reload service', () => {
  it('starts with zero credits when Redis has no balances', async () => {
    const service = createService(createRedisStub())
    const balances = await service.getBalances()

    expect(balances.outletBalances['st-001']).toBe('0')
    expect(balances.companyBalances['silvertree-oris']).toBe('0')
    expect(Object.values(balances.outletBalances).every((value) => value === '0')).toBe(true)
  })

  it('reads stored outlet balances and calculates company totals', async () => {
    const redis = createRedisStub()
    redis.hgetall.mockResolvedValue(['st-001', '100', 'st-002', '50', 'st-003', '200'])

    const balances = await createService(redis).getBalances()

    expect(balances.outletBalances['st-001']).toBe('100')
    expect(balances.outletBalances['st-002']).toBe('50')
    expect(balances.outletBalances['st-003']).toBe('200')
    expect(balances.companyBalances['silvertree-oris']).toBe('150')
    expect(balances.companyBalances['silvertree-binjai']).toBe('200')
  })

  it('passes the requested allocation and record to Redis', async () => {
    // The two selected outlets belong to different companies. Only these
    // outlets should be included in the allocation sent to Redis.
    const redis = createRedisStub()
    const result = await createService(redis).processReload(firstReload)

    expect(result.allocation.alreadyAllocated).toBe(false)
    expect(result.quotation.totalCredits).toBe('300')
    expect(redis.eval).toHaveBeenCalledTimes(1)

    const [, keys, values] = redis.eval.mock.calls[0]
    expect(keys).toEqual([
      'gosms:v1:operation:silvertree-reload-001',
      'gosms:v1:outlet-balances',
      'gosms:v1:quotation-history:silvertree',
    ])
    expect(values.slice(1)).toEqual(['st-001', '100', 'st-003', '200'])
  })

  it('returns the saved quotation on a retry from another service instance', async () => {
    // The second instance stands in for a new server invocation. It should
    // find the original operation rather than submit another allocation.
    const redis = createRedisStub()
    const first = await createService(redis).processReload(firstReload)
    const retry = await createService(redis).processReload(firstReload)

    expect(retry.quotation).toEqual(first.quotation)
    expect(retry.allocation.alreadyAllocated).toBe(true)
    expect(redis.eval).toHaveBeenCalledTimes(1)
  })

  it('rejects different credit amounts under an existing operation ID', async () => {
    const redis = createRedisStub()
    const service = createService(redis)
    await service.processReload(firstReload)

    await expect(service.processReload({
      ...firstReload,
      creditsByOutlet: { 'st-001': '150', 'st-003': '200' },
    })).rejects.toMatchObject({ status: 409 })

    expect(redis.eval).toHaveBeenCalledTimes(1)
  })

  it('sends a separate top up to Redis as a new operation', async () => {
    // Unlike a retry, a new operation ID represents another genuine top up.
    const redis = createRedisStub()
    const service = createService(redis)

    await service.processReload(firstReload)
    const second = await service.processReload({
      operationId: 'silvertree-reload-002',
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '50' },
    })

    expect(second.allocation.alreadyAllocated).toBe(false)
    expect(redis.eval).toHaveBeenCalledTimes(2)
  })

  it('loads saved quotation history for the selected brand', async () => {
    const redis = createRedisStub()
    const service = createService(redis)
    const result = await service.processReload(firstReload)
    const operationKey = `gosms:v1:operation:${firstReload.operationId}`

    redis.llen.mockResolvedValue(1)
    redis.lrange.mockResolvedValue([operationKey])

    expect(await service.getHistoryCount('silvertree')).toBe(1)
    expect(await service.getHistory('silvertree')).toEqual([{
      id: firstReload.operationId,
      brandId: 'silvertree',
      status: 'generated',
      quotation: result.quotation,
    }])
    expect(redis.lrange).toHaveBeenCalledWith('gosms:v1:quotation-history:silvertree', 0, -1)
  })

  it('rejects broken quotation history entries', async () => {
    // An invalid history entry must not be displayed as a saved quotation.
    const redis = createRedisStub()
    const service = createService(redis)

    redis.lrange.mockResolvedValue(['not-an-operation-key'])
    await expect(service.getHistory('silvertree')).rejects.toThrow('Invalid Redis quotation history entry.')

    redis.lrange.mockResolvedValue(['gosms:v1:operation:missing-operation'])
    await expect(service.getHistory('silvertree')).rejects.toThrow('Missing Redis quotation history record.')
  })

  it('rejects malformed balance data instead of treating it as zero', async () => {
    // A storage error is different from an empty balance. Showing zero would
    // mislead the person allocating credits.
    const redis = createRedisStub()
    const service = createService(redis)

    redis.hgetall.mockResolvedValue({ 'st-001': '100' })
    await expect(service.getBalances()).rejects.toThrow('Unexpected Redis balance response.')

    redis.hgetall.mockResolvedValue(['st-001', 'invalid'])
    await expect(service.getBalances()).rejects.toThrow('Invalid stored SMS credit balance.')
  })

  it('reports a history storage failure returned by Redis', async () => {
    const redis = createRedisStub()
    redis.eval.mockResolvedValueOnce([-2, 'Quotation history storage is unavailable.'])

    await expect(createService(redis).processReload(firstReload)).rejects.toMatchObject({
      status: 503,
      message: 'Quotation history storage is unavailable.',
    })
  })

  it('rejects an allocation when Redis reports a balance overflow', async () => {
    const redis = createRedisStub()
    redis.eval.mockResolvedValueOnce([-1, 'The resulting credit balance is too large.'])

    await expect(createService(redis).processReload(firstReload)).rejects.toMatchObject({
      status: 422,
      message: 'The resulting credit balance is too large.',
    })
  })
})
