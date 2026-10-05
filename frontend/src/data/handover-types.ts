/** 班组交接班模块的领域模型。独立于通用台账，便于后续直接替换为后端接口。 */

export type HandoverStatus = '待确认' | '已办结'

export type HandoverRecord = {
  id: number
  /** 同一交班班次只能有一条交接记录，也是重复提交的幂等键。 */
  shiftCode: string
  outgoingTeam: string
  handoverPerson: string
  /** 一个交班班次只对应一个接班班组。 */
  receivingTeam: string
  createdAt: string
  status: HandoverStatus
  completedAt?: string
}

export type HandoverItem = {
  id: number
  recordId: number
  sequence: number
  /** 交班人原始说法，后续确认、转交、办结都不覆盖这一份。 */
  content: string
  /** 接班班组确认后的说法；存在分歧时以该字段为准。 */
  confirmedContent?: string
  responsiblePerson: string
  confirmed: boolean
  confirmedBy?: string
  confirmedAt?: string
  /** 幂等确认请求号；同一事项再次确认直接返回已有确认。 */
  confirmationRequestId?: string
  /** 转交流水：仅复制到新记录的那条事项持有来源，原事项不做反向标记。 */
  sourceRecordId?: number
  sourceItemId?: number
  transferredInAt?: string
}

export type HandoverDatabase = {
  records: HandoverRecord[]
  items: HandoverItem[]
}

export type HandoverItemInput = {
  content: string
  responsiblePerson: string
}

export type CreateHandoverInput = {
  shiftCode: string
  outgoingTeam: string
  handoverPerson: string
  receivingTeam: string
  items: HandoverItemInput[]
  createdAt?: string
}

export type ConfirmItemInput = {
  recordId: number
  itemId: number
  confirmedContent: string
  confirmedBy: string
  requestId?: string
}

export type HandoverResult<T = undefined> = {
  ok: boolean
  message: string
  duplicate?: boolean
  data?: T
}

export type HandoverItemView = HandoverItem & {
  state: '待确认' | '已确认' | '已转交'
  effectiveContent: string
  hasDisagreement: boolean
  sourceShiftCode?: string
  successorRecordId?: number
  successorItemId?: number
  successorShiftCode?: string
}

export type HandoverDetail = {
  record: HandoverRecord
  items: HandoverItemView[]
  confirmedCount: number
  transferredCount: number
  pendingCount: number
  canComplete: boolean
}

export type HandoverRecordView = HandoverRecord & {
  itemCount: number
  confirmedCount: number
  transferredCount: number
  pendingCount: number
  canComplete: boolean
}

export type AccountabilityRow = {
  itemId: number
  sequence: number
  effectiveContent: string
  responsiblePerson: string
  state: HandoverItemView['state']
  confirmedBy?: string
  confirmedAt?: string
  sourceShiftCode?: string
  successorShiftCode?: string
}
