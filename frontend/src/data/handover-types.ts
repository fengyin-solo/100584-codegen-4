/** 交接班模块的专用结构：一条交班记录带多条遗留事项，不套通用 EntryRow。 */

export type HandoverItemStatus = '待确认' | '已确认'
export type HandoverStatus = '待确认' | '已办结'

/** 事项在交班记录之间的流转指针：记录号 + 事项编号，跨记录溯源用。 */
export type CarriedPointer = {
  handoverId: number
  itemId: string
}

export type HandoverItem = {
  id: string
  /** 交班人登记的原始描述，落定后不再改 */
  content: string
  /** 交班人登记的责任人 */
  responsible: string
  /** 接班班组确认的描述；与原文不一致时以这份为准 */
  confirmedContent: string | null
  /** 接班班组确认的责任人 */
  confirmedResponsible: string | null
  status: HandoverItemStatus
  confirmedBy: string | null
  confirmedAt: string | null
  /** 从哪条遗留事项转来的；本班直接登记为 null */
  carriedFrom: CarriedPointer | null
  /** 已转去哪个交班记录；仅做标记，原事项内容不跟着改 */
  carriedTo: number | null
}

export type HandoverRecord = {
  id: number
  /** 班次唯一键（值班日期 + 班次名），重复提交按它去重 */
  shiftKey: string
  shiftDate: string
  shiftName: string
  fromTeam: string
  fromPerson: string
  toTeam: string
  toPerson: string
  items: HandoverItem[]
  status: HandoverStatus
  createdAt: string
  closedAt: string | null
}

export type HandoverDraft = {
  shiftDate: string
  shiftName: string
  fromTeam: string
  fromPerson: string
  toTeam: string
  toPerson: string
  items: { content: string; responsible: string }[]
}

export type ConfirmPayload = {
  confirmedBy: string
  confirmedContent: string
  confirmedResponsible: string
}

export type HandoverResult = {
  ok: boolean
  message: string
  /** 重复请求被识别出来时为 true：状态没动，也不算失败 */
  duplicated?: boolean
}

/** 办结后的责任追溯行：最终口径 + 最终责任人 + 来龙去脉。 */
export type TraceRow = {
  itemId: string
  content: string
  responsible: string
  confirmedBy: string
  confirmedAt: string
  origin: string
  carriedTo: string
}
