import { listHandovers, saveHandovers } from '@/data/handover-store'
import type {
  ConfirmPayload,
  HandoverDraft,
  HandoverItem,
  HandoverRecord,
  HandoverResult,
  TraceRow,
} from '@/data/handover-types'

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function shiftKeyOf(shiftDate: string, shiftName: string): string {
  return `${shiftDate} ${shiftName}`
}

export function shiftLabelOf(record: HandoverRecord): string {
  return `${record.shiftDate} ${record.shiftName}`
}

/** 同一条事项交班人与接班人说法不一致时，以接班班组确认的那份为准。 */
export function effectiveContent(item: HandoverItem): string {
  const confirmed = item.confirmedContent?.trim()
  return confirmed ? confirmed : item.content
}

export function effectiveResponsible(item: HandoverItem): string {
  const confirmed = item.confirmedResponsible?.trim()
  return confirmed ? confirmed : item.responsible
}

export function listRecords(): HandoverRecord[] {
  return listHandovers()
}

function recordLabel(handoverId: number): string {
  const record = listHandovers().find((row) => row.id === handoverId)
  return record ? shiftLabelOf(record) : `记录#${handoverId}`
}

export function originLabel(item: HandoverItem): string {
  if (!item.carriedFrom) {
    return '本班登记'
  }
  return `《${recordLabel(item.carriedFrom.handoverId)}》${item.carriedFrom.itemId} 转入`
}

export function carriedToLabel(item: HandoverItem): string {
  if (item.carriedTo === null) {
    return '—'
  }
  return `已转至《${recordLabel(item.carriedTo)}》`
}

function nextRecordId(rows: HandoverRecord[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1
}

function nextItemId(items: HandoverItem[]): string {
  const max = items.reduce((acc, item) => {
    const match = /^I(\d+)$/.exec(item.id)
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 0)
  return `I${max + 1}`
}

export function submitHandover(draft: HandoverDraft): HandoverResult & { record: HandoverRecord | null } {
  const required: [string, string][] = [
    ['值班日期', draft.shiftDate],
    ['班次', draft.shiftName],
    ['交班班组', draft.fromTeam],
    ['交班人', draft.fromPerson],
    ['接班班组', draft.toTeam],
    ['接班人', draft.toPerson],
  ]
  for (const [label, value] of required) {
    if (!value.trim()) {
      return { ok: false, message: `请填写${label}`, record: null }
    }
  }
  const items = draft.items.map((item) => ({
    content: item.content.trim(),
    responsible: item.responsible.trim(),
  }))
  if (items.length === 0) {
    return { ok: false, message: '请至少登记一条遗留事项（本班无遗留可填「本班无遗留事项」）', record: null }
  }
  const incomplete = items.findIndex((item) => !item.content || !item.responsible)
  if (incomplete >= 0) {
    return { ok: false, message: `第 ${incomplete + 1} 条遗留事项的内容或责任人没填全`, record: null }
  }
  const rows = listHandovers()
  const shiftKey = shiftKeyOf(draft.shiftDate.trim(), draft.shiftName.trim())
  // 幂等：同一交班班次重复提交只留最早那条，后续请求识别为重复，不再插入。
  const existing = rows.find((row) => row.shiftKey === shiftKey)
  if (existing) {
    return {
      ok: true,
      duplicated: true,
      record: existing,
      message: `${shiftKey} 已有交班记录（${existing.fromTeam} → ${existing.toTeam}），重复提交已识别，未再新建`,
    }
  }
  const record: HandoverRecord = {
    id: nextRecordId(rows),
    shiftKey,
    shiftDate: draft.shiftDate.trim(),
    shiftName: draft.shiftName.trim(),
    fromTeam: draft.fromTeam.trim(),
    fromPerson: draft.fromPerson.trim(),
    toTeam: draft.toTeam.trim(),
    toPerson: draft.toPerson.trim(),
    items: items.map((item, index) => ({
      id: `I${index + 1}`,
      content: item.content,
      responsible: item.responsible,
      confirmedContent: null,
      confirmedResponsible: null,
      status: '待确认' as const,
      confirmedBy: null,
      confirmedAt: null,
      carriedFrom: null,
      carriedTo: null,
    })),
    status: '待确认',
    createdAt: now(),
    closedAt: null,
  }
  saveHandovers([...rows, record])
  return {
    ok: true,
    record,
    message: `${shiftKey} 交班记录已提交，${record.items.length} 条遗留事项待 ${record.toTeam} 逐条确认`,
  }
}

export function confirmItem(handoverId: number, itemId: string, payload: ConfirmPayload): HandoverResult {
  const rows = listHandovers()
  const record = rows.find((row) => row.id === handoverId)
  if (!record) {
    return { ok: false, message: '没有找到这条交班记录' }
  }
  if (record.status === '已办结') {
    return { ok: false, message: '该交班记录已办结，不能再确认事项' }
  }
  const item = record.items.find((entry) => entry.id === itemId)
  if (!item) {
    return { ok: false, message: `没有找到事项 ${itemId}` }
  }
  // 幂等：重复确认请求识别出来，不重复登记、不覆盖已有确认。
  if (item.status === '已确认') {
    return {
      ok: true,
      duplicated: true,
      message: `事项 ${itemId} 已由 ${item.confirmedBy} 于 ${item.confirmedAt} 确认，重复请求已识别，未重复登记`,
    }
  }
  const confirmedContent = payload.confirmedContent.trim()
  const confirmedResponsible = payload.confirmedResponsible.trim()
  const confirmedBy = payload.confirmedBy.trim()
  if (!confirmedContent) {
    return { ok: false, message: '请填写接班确认口径；与交班人说法不一致时，以接班班组确认的内容为准' }
  }
  if (!confirmedResponsible) {
    return { ok: false, message: '请填写接班确认的责任人，办结后要能追到具体人' }
  }
  if (!confirmedBy) {
    return { ok: false, message: '请填写确认人' }
  }
  const updatedItem: HandoverItem = {
    ...item,
    status: '已确认',
    confirmedContent,
    confirmedResponsible,
    confirmedBy,
    confirmedAt: now(),
  }
  const updated: HandoverRecord = {
    ...record,
    items: record.items.map((entry) => (entry.id === itemId ? updatedItem : entry)),
  }
  saveHandovers(rows.map((row) => (row.id === handoverId ? updated : row)))
  const differ = confirmedContent !== item.content || confirmedResponsible !== item.responsible
  return {
    ok: true,
    message: differ
      ? `事项 ${itemId} 已确认；与交班人说法不一致，办结口径以接班班组确认的为准`
      : `事项 ${itemId} 已确认`,
  }
}

export function carryItem(handoverId: number, itemId: string, targetHandoverId: number): HandoverResult {
  const rows = listHandovers()
  const source = rows.find((row) => row.id === handoverId)
  if (!source) {
    return { ok: false, message: '没有找到源交班记录' }
  }
  const item = source.items.find((entry) => entry.id === itemId)
  if (!item) {
    return { ok: false, message: `没有找到事项 ${itemId}` }
  }
  if (handoverId === targetHandoverId) {
    return { ok: false, message: '不能转到本记录，请选择下一个交班记录' }
  }
  const target = rows.find((row) => row.id === targetHandoverId)
  if (!target) {
    return { ok: false, message: '没有找到目标交班记录' }
  }
  if (target.status === '已办结') {
    return { ok: false, message: `《${shiftLabelOf(target)}》已办结，不能再转入事项` }
  }
  // 幂等：同一条事项转到同一条记录只留一份快照，重复转出被识别。
  const already = target.items.find(
    (entry) =>
      entry.carriedFrom &&
      entry.carriedFrom.handoverId === handoverId &&
      entry.carriedFrom.itemId === itemId,
  )
  if (already) {
    return {
      ok: true,
      duplicated: true,
      message: `事项 ${itemId} 已转入《${shiftLabelOf(target)}》记为 ${already.id}，重复转出请求已识别`,
    }
  }
  // 快照：按当前生效口径（接班确认为准）复制到下一个交班记录，原事项保持原样不跟着改。
  const copy: HandoverItem = {
    id: nextItemId(target.items),
    content: effectiveContent(item),
    responsible: effectiveResponsible(item),
    confirmedContent: null,
    confirmedResponsible: null,
    status: '待确认',
    confirmedBy: null,
    confirmedAt: null,
    carriedFrom: { handoverId, itemId },
    carriedTo: null,
  }
  const updatedSource: HandoverRecord = {
    ...source,
    items: source.items.map((entry) =>
      entry.id === itemId ? { ...entry, carriedTo: targetHandoverId } : entry,
    ),
  }
  const updatedTarget: HandoverRecord = { ...target, items: [...target.items, copy] }
  saveHandovers(
    rows.map((row) => {
      if (row.id === handoverId) {
        return updatedSource
      }
      if (row.id === targetHandoverId) {
        return updatedTarget
      }
      return row
    }),
  )
  return {
    ok: true,
    message: `事项 ${itemId} 已转入《${shiftLabelOf(target)}》记为 ${copy.id}，原事项保持原样`,
  }
}

export function closeHandover(handoverId: number): HandoverResult {
  const rows = listHandovers()
  const record = rows.find((row) => row.id === handoverId)
  if (!record) {
    return { ok: false, message: '没有找到这条交班记录' }
  }
  if (record.status === '已办结') {
    return { ok: true, duplicated: true, message: '该交班记录已办结，重复办结请求已识别' }
  }
  const unconfirmed = record.items.filter((item) => item.status !== '已确认')
  if (unconfirmed.length > 0) {
    const ids = unconfirmed.map((item) => item.id).join('、')
    return { ok: false, message: `还有 ${unconfirmed.length} 条遗留事项未确认（${ids}），不允许办结` }
  }
  const updated: HandoverRecord = { ...record, status: '已办结', closedAt: now() }
  saveHandovers(rows.map((row) => (row.id === handoverId ? updated : row)))
  return {
    ok: true,
    message: `《${shiftLabelOf(record)}》已办结，${record.items.length} 条遗留事项均可追到责任人`,
  }
}

/** 办结后的责任追溯：每条事项落到最终口径与具体责任人。 */
export function traceRows(handoverId: number): TraceRow[] {
  const record = listHandovers().find((row) => row.id === handoverId)
  if (!record) {
    return []
  }
  return record.items.map((item) => ({
    itemId: item.id,
    content: effectiveContent(item),
    responsible: effectiveResponsible(item),
    confirmedBy: item.confirmedBy ?? '—',
    confirmedAt: item.confirmedAt ?? '—',
    origin: originLabel(item),
    carriedTo: carriedToLabel(item),
  }))
}

export function exportHandovers(): { filename: string; content: string } {
  const header = [
    '班次',
    '交班班组',
    '交班人',
    '接班班组',
    '接班人',
    '记录状态',
    '事项编号',
    '事项描述（交班人）',
    '责任人（交班人）',
    '确认口径（接班人）',
    '责任人（接班确认）',
    '最终责任人',
    '事项状态',
    '确认人',
    '确认时间',
    '来源',
    '去向',
  ]
  const lines = [header.join(',')]
  for (const record of listHandovers()) {
    for (const item of record.items) {
      lines.push(
        [
          shiftLabelOf(record),
          record.fromTeam,
          record.fromPerson,
          record.toTeam,
          record.toPerson,
          record.status,
          item.id,
          item.content,
          item.responsible,
          item.confirmedContent ?? '',
          item.confirmedResponsible ?? '',
          effectiveResponsible(item),
          item.status,
          item.confirmedBy ?? '',
          item.confirmedAt ?? '',
          originLabel(item),
          carriedToLabel(item),
        ].join(','),
      )
    }
  }
  return { filename: '交接班清单.csv', content: `\uFEFF${lines.join('\n')}` }
}

export function downloadHandovers(): void {
  const { filename, content } = exportHandovers()
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
