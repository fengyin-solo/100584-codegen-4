import { readHandoverDatabase, resetHandoverDatabase, writeHandoverDatabase } from '../data/handover-store'
import type {
  AccountabilityRow,
  ConfirmItemInput,
  CreateHandoverInput,
  HandoverDatabase,
  HandoverDetail,
  HandoverItem,
  HandoverItemView,
  HandoverRecord,
  HandoverRecordView,
  HandoverResult,
} from '../data/handover-types'

function required(value: string): string {
  return value.trim()
}

function nowText(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function nextId(rows: { id: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1
}

function findRecord(database: HandoverDatabase, recordId: number): HandoverRecord | undefined {
  return database.records.find((record) => record.id === recordId)
}

function findItem(database: HandoverDatabase, itemId: number): HandoverItem | undefined {
  return database.items.find((item) => item.id === itemId)
}

function successorFor(item: HandoverItem, database: HandoverDatabase): HandoverItem | undefined {
  return database.items.find(
    (candidate) => candidate.sourceRecordId === item.recordId && candidate.sourceItemId === item.id,
  )
}

function shiftCodeFor(recordId: number | undefined, database: HandoverDatabase): string | undefined {
  if (recordId === undefined) {
    return undefined
  }
  return findRecord(database, recordId)?.shiftCode
}

function buildItemView(item: HandoverItem, database: HandoverDatabase): HandoverItemView {
  const successor = successorFor(item, database)
  const confirmed = Boolean(item.confirmed)
  const state = successor ? '已转交' : confirmed ? '已确认' : '待确认'
  return {
    ...item,
    state,
    effectiveContent: item.confirmedContent?.trim() ? item.confirmedContent : item.content,
    hasDisagreement: confirmed && item.confirmedContent?.trim() !== item.content.trim(),
    sourceShiftCode: shiftCodeFor(item.sourceRecordId, database),
    successorRecordId: successor?.recordId,
    successorItemId: successor?.id,
    successorShiftCode: shiftCodeFor(successor?.recordId, database),
  }
}

function buildDetail(database: HandoverDatabase, record: HandoverRecord): HandoverDetail {
  const items = database.items
    .filter((item) => item.recordId === record.id)
    .sort((a, b) => a.sequence - b.sequence)
    .map((item) => buildItemView(item, database))
  const confirmedCount = items.filter((item) => item.state === '已确认').length
  const transferredCount = items.filter((item) => item.state === '已转交').length
  const pendingCount = items.filter((item) => item.state === '待确认').length
  return {
    record,
    items,
    confirmedCount,
    transferredCount,
    pendingCount,
    canComplete: pendingCount === 0 && items.length > 0,
  }
}

export function listHandoverRecords(): HandoverRecordView[] {
  const database = readHandoverDatabase()
  return database.records
    .slice()
    .sort((a, b) => b.id - a.id)
    .map((record) => {
      const detail = buildDetail(database, record)
      return {
        ...record,
        itemCount: detail.items.length,
        confirmedCount: detail.confirmedCount,
        transferredCount: detail.transferredCount,
        pendingCount: detail.pendingCount,
        canComplete: detail.canComplete,
      }
    })
}

export function getHandoverDetail(recordId: number): HandoverResult<HandoverDetail> {
  const database = readHandoverDatabase()
  const record = findRecord(database, recordId)
  if (!record) {
    return { ok: false, message: `没有找到编号为 ${recordId} 的交接记录` }
  }
  return { ok: true, message: '交接记录读取成功', data: buildDetail(database, record) }
}

export function createHandover(
  input: CreateHandoverInput,
): HandoverResult<{ recordId: number; duplicateCount: number }> {
  const database = readHandoverDatabase()
  const shiftCode = required(input.shiftCode)
  const outgoingTeam = required(input.outgoingTeam)
  const handoverPerson = required(input.handoverPerson)
  const receivingTeam = required(input.receivingTeam)

  if (!shiftCode || !outgoingTeam || !handoverPerson || !receivingTeam) {
    return { ok: false, message: '请完整填写交班班次、交班班组、交班人和接班班组' }
  }

  const duplicatedRecord = database.records.find((record) => record.shiftCode === shiftCode)
  if (duplicatedRecord) {
    return {
      ok: false,
      duplicate: true,
      message: `交班班次「${shiftCode}」已存在交接记录 #${duplicatedRecord.id}，重复提交不会再插入一条`,
      data: { recordId: duplicatedRecord.id, duplicateCount: 0 },
    }
  }

  const normalizedItems = input.items.map((item) => ({
    content: required(item.content),
    responsiblePerson: required(item.responsiblePerson),
  }))

  if (normalizedItems.some((item) => !item.content || !item.responsiblePerson)) {
    return { ok: false, message: '每条遗留事项都必须填写事项内容和具体责任人' }
  }
  if (normalizedItems.length === 0) {
    return { ok: false, message: '交接时至少要列出一条当班遗留事项' }
  }

  const seenContent = new Set<string>()
  const items = normalizedItems.filter((item) => {
    if (seenContent.has(item.content)) {
      return false
    }
    seenContent.add(item.content)
    return true
  })

  const recordId = nextId(database.records)
  const createdAt = input.createdAt?.trim() || nowText()
  const record: HandoverRecord = {
    id: recordId,
    shiftCode,
    outgoingTeam,
    handoverPerson,
    receivingTeam,
    createdAt,
    status: '待确认',
  }
  const newItems: HandoverItem[] = items.map((item, index) => ({
    id: nextId(database.items) + index,
    recordId,
    sequence: index + 1,
    content: item.content,
    responsiblePerson: item.responsiblePerson,
    confirmed: false,
  }))

  database.records.push(record)
  database.items.push(...newItems)
  writeHandoverDatabase(database)
  return {
    ok: true,
    message: `交接记录 #${recordId} 已提交，共 ${newItems.length} 条遗留事项待接班班组逐条确认`,
    data: { recordId, duplicateCount: input.items.length - newItems.length },
  }
}

export function confirmHandoverItem(
  input: ConfirmItemInput,
): HandoverResult<{ itemId: number; duplicate: boolean }> {
  const database = readHandoverDatabase()
  const record = findRecord(database, input.recordId)
  if (!record) {
    return { ok: false, message: `没有找到编号为 ${input.recordId} 的交接记录` }
  }
  if (record.status === '已办结') {
    return { ok: false, message: '交接记录已办结，确认内容被冻结，不能再补插确认' }
  }

  const item = findItem(database, input.itemId)
  if (!item || item.recordId !== record.id) {
    return { ok: false, message: `交接记录 #${record.id} 下没有编号为 ${input.itemId} 的遗留事项` }
  }

  const confirmedContent = required(input.confirmedContent)
  const confirmedBy = required(input.confirmedBy)
  const requestId = input.requestId?.trim()
  if (!confirmedContent || !confirmedBy) {
    return { ok: false, message: '请填写接班班组确认的事项内容和确认人' }
  }

  if (requestId) {
    const requestOwner = database.items.find(
      (candidate) => candidate.confirmationRequestId === requestId,
    )
    if (requestOwner && requestOwner.id !== item.id) {
      return {
        ok: false,
        duplicate: true,
        message: `确认请求「${requestId}」已经用于事项 #${requestOwner.id}，不能重复插入到另一条事项`,
      }
    }
  }

  if (item.confirmed) {
    const samePayload =
      item.confirmedContent === confirmedContent &&
      item.confirmedBy === confirmedBy &&
      (!requestId || item.confirmationRequestId === requestId)
    if (samePayload) {
      return {
        ok: true,
        duplicate: true,
        message: `事项 #${item.id} 已确认，重复请求已识别，直接返回原确认结果`,
        data: { itemId: item.id, duplicate: true },
      }
    }
    return {
      ok: false,
      duplicate: true,
      message: `事项 #${item.id} 已有确认记录，不能用新的确认请求插入第二条`,
    }
  }

  if (requestId) {
    const usedRequest = database.items.some(
      (candidate) => candidate.confirmationRequestId === requestId,
    )
    if (usedRequest) {
      return { ok: false, duplicate: true, message: `确认请求「${requestId}」重复，已拦截` }
    }
  }

  item.confirmed = true
  item.confirmedContent = confirmedContent
  item.confirmedBy = confirmedBy
  item.confirmedAt = nowText()
  item.confirmationRequestId = requestId || `confirm-${record.id}-${item.id}-${Date.now()}`
  writeHandoverDatabase(database)

  return {
    ok: true,
    message:
      item.content === confirmedContent
        ? `事项 #${item.id} 已完成交接确认`
        : `事项 #${item.id} 已按接班班组确认内容为准保存，交班原始说法仍保留`,
    data: { itemId: item.id, duplicate: false },
  }
}

export function transferPendingItems(input: {
  recordId: number
  targetRecordId: number
  itemIds?: number[]
}): HandoverResult<{ targetRecordId: number; createdCount: number; duplicateCount: number }> {
  const database = readHandoverDatabase()
  const source = findRecord(database, input.recordId)
  const target = findRecord(database, input.targetRecordId)
  if (!source) {
    return { ok: false, message: `没有找到来源交接记录 #${input.recordId}` }
  }
  if (!target) {
    return { ok: false, message: `没有找到下一个交接记录 #${input.targetRecordId}` }
  }
  if (source.id === target.id) {
    return { ok: false, message: '不能把遗留事项转交给当前交接记录自己' }
  }
  if (target.id <= source.id) {
    return { ok: false, message: '只能转交给后续新建的交班记录' }
  }
  if (source.status === '已办结' || target.status === '已办结') {
    return { ok: false, message: '已办结的交接记录不能再转入或转出遗留事项' }
  }

  const selectedIds = input.itemIds?.length ? new Set(input.itemIds) : undefined
  const sourceItems = database.items
    .filter((item) => item.recordId === source.id)
    .filter((item) => !selectedIds || selectedIds.has(item.id))
    .filter((item) => !item.confirmed)

  if (selectedIds && sourceItems.length !== selectedIds.size) {
    return { ok: false, message: '所选事项中包含不属于本记录或已经确认的事项' }
  }

  const transferable = sourceItems.filter((item) => !successorFor(item, database))
  if (transferable.length === 0) {
    return {
      ok: false,
      duplicate: true,
      message: '没有可转交的待确认事项；重复转交请求不会插入新事项',
    }
  }

  let itemId = nextId(database.items)
  let sequence = database.items.filter((item) => item.recordId === target.id).length
  const copiedAt = nowText()
  for (const sourceItem of transferable) {
    sequence += 1
    database.items.push({
      id: itemId++,
      recordId: target.id,
      sequence,
      content: sourceItem.content,
      responsiblePerson: sourceItem.responsiblePerson,
      confirmed: false,
      sourceRecordId: sourceItem.recordId,
      sourceItemId: sourceItem.id,
      transferredInAt: copiedAt,
    })
  }

  writeHandoverDatabase(database)
  const duplicateCount = sourceItems.length - transferable.length
  return {
    ok: true,
    duplicate: duplicateCount > 0,
    message: `已向「${target.shiftCode}」复制 ${transferable.length} 条遗留事项；原记录保留原样，重复项跳过 ${duplicateCount} 条`,
    data: {
      targetRecordId: target.id,
      createdCount: transferable.length,
      duplicateCount,
    },
  }
}

export function completeHandover(recordId: number): HandoverResult<HandoverDetail> {
  const database = readHandoverDatabase()
  const record = findRecord(database, recordId)
  if (!record) {
    return { ok: false, message: `没有找到编号为 ${recordId} 的交接记录` }
  }
  if (record.status === '已办结') {
    return { ok: false, duplicate: true, message: '该交接记录已经办结，不能重复办结' }
  }

  const detail = buildDetail(database, record)
  if (!detail.canComplete) {
    return {
      ok: false,
      message: `仍有 ${detail.pendingCount} 条遗留事项未确认或转交，不能办结交接记录`,
    }
  }

  record.status = '已办结'
  record.completedAt = nowText()
  writeHandoverDatabase(database)
  return {
    ok: true,
    message: `交接记录 #${record.id} 已办结，全部遗留事项均可追到具体责任人`,
    data: buildDetail(database, record),
  }
}

export function getAccountability(recordId: number): HandoverResult<AccountabilityRow[]> {
  const detailResult = getHandoverDetail(recordId)
  if (!detailResult.ok || !detailResult.data) {
    return { ok: false, message: detailResult.message }
  }
  if (detailResult.data.record.status !== '已办结') {
    return { ok: false, message: '交接记录办结后才能输出责任追踪清单' }
  }

  const rows: AccountabilityRow[] = detailResult.data.items.map((item) => ({
    itemId: item.id,
    sequence: item.sequence,
    effectiveContent: item.effectiveContent,
    responsiblePerson: item.responsiblePerson,
    state: item.state,
    confirmedBy: item.confirmedBy,
    confirmedAt: item.confirmedAt,
    sourceShiftCode: item.sourceShiftCode,
    successorShiftCode: item.successorShiftCode,
  }))
  return { ok: true, message: '责任追踪清单读取成功', data: rows }
}

export function resetHandoverData(): HandoverResult {
  resetHandoverDatabase()
  return { ok: true, message: '交接班演示数据已重置' }
}
