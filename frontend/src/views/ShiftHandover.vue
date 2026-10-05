<template>
  <section class="page handover-page">
    <header class="page-head">
      <div>
        <h2>班组交接班</h2>
        <p class="page-desc">
          一个交班班次只对应一个接班班组；遗留事项逐条确认，未确认事项转交下一交班记录后才能办结。
        </p>
      </div>
      <div class="page-actions">
        <button v-if="selectedId" class="btn" type="button" @click="selectedId = undefined">
          返回列表
        </button>
        <button v-else class="btn primary" type="button" @click="openCreate">新建交接</button>
        <button class="btn ghost" type="button" @click="resetData">重置演示数据</button>
      </div>
    </header>

    <template v-if="!selectedId">
      <div class="stat-row">
        <article v-for="card in recordCards" :key="card.label" class="stat-card">
          <span class="stat-label">{{ card.label }}</span>
          <strong class="stat-value">{{ card.value }}</strong>
        </article>
      </div>

      <form class="filter-bar" @submit.prevent="reloadRecords">
        <label class="filter-item">
          <span>交班班次</span>
          <input v-model="recordFilter.shiftCode" placeholder="按班次检索" />
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="recordFilter.status">
            <option value="">全部</option>
            <option value="待确认">待确认</option>
            <option value="已办结">已办结</option>
          </select>
        </label>
        <button class="btn" type="submit">查询</button>
        <button class="btn ghost" type="button" @click="clearRecordFilter">重置条件</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>交班班次</th>
            <th>交班班组 / 交班人</th>
            <th>接班班组</th>
            <th>提交时间</th>
            <th>事项确认</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in filteredRecords" :key="record.id">
            <td>#{{ record.id }}</td>
            <td>{{ record.shiftCode }}</td>
            <td>{{ record.outgoingTeam }} / {{ record.handoverPerson }}</td>
            <td>{{ record.receivingTeam }}</td>
            <td>{{ record.createdAt }}</td>
            <td>
              共 {{ record.itemCount }} 条；已确认 {{ record.confirmedCount }}，已转交
              {{ record.transferredCount }}，待确认 {{ record.pendingCount }}
            </td>
            <td>
              <span :class="['status-pill', record.status === '已办结' ? 'done' : 'waiting']">
                {{ record.status }}
              </span>
            </td>
            <td><button class="link" type="button" @click="openDetail(record.id)">查看交接</button></td>
          </tr>
          <tr v-if="!filteredRecords.length">
            <td colspan="8" class="empty-state">暂无符合条件的交接记录</td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-else-if="detail">
      <header class="detail-head">
        <div>
          <h3>交接记录 #{{ detail.record.id }} · {{ detail.record.shiftCode }}</h3>
          <p class="page-desc">
            {{ detail.record.outgoingTeam }}（{{ detail.record.handoverPerson }}）交班给
            {{ detail.record.receivingTeam }} · {{ detail.record.createdAt }}
          </p>
        </div>
        <div class="detail-actions">
          <button
            class="btn"
            type="button"
            :disabled="detail.pendingCount === 0"
            @click="openTransfer"
          >
            转交待确认事项
          </button>
          <button class="btn primary" type="button" :disabled="!detail.canComplete" @click="finish">
            办结交接
          </button>
        </div>
      </header>

      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">已确认</span>
          <strong class="stat-value">{{ detail.confirmedCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">已转交</span>
          <strong class="stat-value">{{ detail.transferredCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">待确认</span>
          <strong class="stat-value">{{ detail.pendingCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">办结状态</span>
          <strong class="stat-value small">{{ detail.record.status }}</strong>
        </article>
      </div>

      <p v-if="!detail.canComplete" class="rule-tip warning">
        仍有 {{ detail.pendingCount }} 条未完成确认或转交，系统不允许办结。
      </p>
      <p v-else-if="detail.record.status === '待确认'" class="rule-tip success">
        所有遗留事项均已确认或转交，可以办结；办结后内容冻结并可进行责任追踪。
      </p>

      <table class="data-table item-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>来源</th>
            <th>交班原始事项</th>
            <th>接班班组确认（以此为准）</th>
            <th>责任人</th>
            <th>状态</th>
            <th>确认人 / 时间</th>
            <th>去向</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in detail.items" :key="item.id">
            <td>{{ item.sequence }}</td>
            <td>{{ item.sourceShiftCode ? `转入自 ${item.sourceShiftCode}` : '本班提交' }}</td>
            <td>{{ item.content }}</td>
            <td>
              <template v-if="item.confirmed">
                <span :class="{ disagreement: item.hasDisagreement }">{{ item.effectiveContent }}</span>
                <em v-if="item.hasDisagreement" class="disagreement-tag">双方说法不一致，采用此份</em>
              </template>
              <span v-else class="muted">待接班班组确认</span>
            </td>
            <td>{{ item.responsiblePerson }}</td>
            <td>
              <span :class="['status-pill', item.state === '待确认' ? 'waiting' : 'done']">
                {{ item.state }}
              </span>
            </td>
            <td>
              <template v-if="item.confirmedBy">{{ item.confirmedBy }} / {{ item.confirmedAt }}</template>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <template v-if="item.successorShiftCode">已转入 {{ item.successorShiftCode }}</template>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <button
                v-if="item.state === '待确认'"
                class="link"
                type="button"
                @click="openConfirm(item.id)"
              >
                填写确认
              </button>
              <span v-else class="muted">已锁定</span>
            </td>
          </tr>
        </tbody>
      </table>

      <section v-if="detail.record.status === '已办结'" class="accountability">
        <h4>办结后责任追踪</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>事项序号</th>
              <th>最终事项内容</th>
              <th>具体责任人</th>
              <th>处理状态</th>
              <th>链路</th>
              <th>确认信息</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in accountabilityRows" :key="row.itemId">
              <td>{{ row.sequence }}</td>
              <td>{{ row.effectiveContent }}</td>
              <td>{{ row.responsiblePerson }}</td>
              <td>{{ row.state }}</td>
              <td>
                <template v-if="row.sourceShiftCode">来源：{{ row.sourceShiftCode }}</template>
                <template v-else-if="row.successorShiftCode">去向：{{ row.successorShiftCode }}</template>
                <span v-else class="muted">本班闭环</span>
              </td>
              <td>{{ row.confirmedBy || '已转交后由下一班确认' }} / {{ row.confirmedAt || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <form class="modal" @submit.prevent="submitCreate">
        <h3>新建班组交接</h3>
        <div class="form-grid">
          <label>
            <span>交班班次 *</span>
            <input v-model="createForm.shiftCode" placeholder="例如 2026-10-05-夜班" />
          </label>
          <label>
            <span>交班班组 *</span>
            <input v-model="createForm.outgoingTeam" />
          </label>
          <label>
            <span>交班人 *</span>
            <input v-model="createForm.handoverPerson" />
          </label>
          <label>
            <span>接班班组 *</span>
            <input v-model="createForm.receivingTeam" />
          </label>
        </div>

        <div class="sub-head">
          <h4>当班遗留事项</h4>
          <button class="btn" type="button" @click="addDraftItem">增加一条</button>
        </div>
        <div v-for="(item, index) in createForm.items" :key="index" class="item-editor">
          <label class="content-field">
            <span>遗留事项 {{ index + 1 }} *</span>
            <textarea v-model="item.content" rows="2" placeholder="逐条写清问题、位置、当前处置情况"></textarea>
          </label>
          <label>
            <span>责任人 *</span>
            <input v-model="item.responsiblePerson" />
          </label>
          <button class="btn ghost" type="button" @click="removeDraftItem(index)">删除</button>
        </div>
        <p v-if="formMessage" :class="['form-message', formOk ? 'ok' : 'error-text']">{{ formMessage }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="showCreate = false">取消</button>
          <button class="btn primary" type="submit">提交交接</button>
        </div>
      </form>
    </div>

    <div v-if="confirmItemId !== null" class="modal-mask" @click.self="confirmItemId = null">
      <form class="modal" @submit.prevent="submitConfirm">
        <h3>接班确认事项 #{{ confirmItemId }}</h3>
        <p class="muted">如接班班组核对结果与交班说法不一致，请直接填写接班班组确认版本；原内容不会被覆盖。</p>
        <label class="block-field">
          <span>接班班组确认内容 *</span>
          <textarea v-model="confirmForm.confirmedContent" rows="4"></textarea>
        </label>
        <div class="form-grid">
          <label>
            <span>确认人 *</span>
            <input v-model="confirmForm.confirmedBy" />
          </label>
          <label>
            <span>确认请求号</span>
            <input v-model="confirmForm.requestId" placeholder="自动生成，可留空" />
          </label>
        </div>
        <p v-if="formMessage" :class="['form-message', formOk ? 'ok' : 'error-text']">{{ formMessage }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="confirmItemId = null">取消</button>
          <button class="btn primary" type="submit">提交确认</button>
        </div>
      </form>
    </div>

    <div v-if="showTransfer" class="modal-mask" @click.self="showTransfer = false">
      <form class="modal" @submit.prevent="submitTransfer">
        <h3>转交给下一个交班记录</h3>
        <p class="muted">系统只复制事项到新记录；原来那条保留原样，不随新记录的确认而改动。</p>
        <label class="block-field">
          <span>目标交接记录 *</span>
          <select v-model="transferForm.targetRecordId">
            <option value="">请选择后续交班记录</option>
            <option v-for="target in transferTargets" :key="target.id" :value="target.id">
              #{{ target.id }} {{ target.shiftCode }}（{{ target.outgoingTeam }} → {{ target.receivingTeam }}）
            </option>
          </select>
        </label>
        <div class="transfer-list">
          <label v-for="item in transferableItems" :key="item.id" class="check-row">
            <input v-model="transferForm.itemIds" type="checkbox" :value="item.id" />
            <span>#{{ item.sequence }} {{ item.content }}（责任人：{{ item.responsiblePerson }}）</span>
          </label>
        </div>
        <p v-if="formMessage" :class="['form-message', formOk ? 'ok' : 'error-text']">{{ formMessage }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="showTransfer = false">取消</button>
          <button class="btn primary" type="submit">确认转交</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  completeHandover,
  confirmHandoverItem,
  createHandover,
  getAccountability,
  getHandoverDetail,
  listHandoverRecords,
  resetHandoverData,
  transferPendingItems,
} from '@/api/handover-service'
import type {
  AccountabilityRow,
  HandoverDetail,
  HandoverItemInput,
  HandoverRecordView,
} from '@/data/handover-types'

const records = ref<HandoverRecordView[]>([])
const selectedId = ref<number>()
const detail = ref<HandoverDetail>()
const accountabilityRows = ref<AccountabilityRow[]>([])
const recordFilter = reactive({ shiftCode: '', status: '' })
const formMessage = ref('')
const formOk = ref(false)

const showCreate = ref(false)
const createForm = reactive({
  shiftCode: '',
  outgoingTeam: '',
  handoverPerson: '',
  receivingTeam: '',
  items: [] as HandoverItemInput[],
})

const confirmItemId = ref<number | null>(null)
const confirmForm = reactive({ confirmedContent: '', confirmedBy: '', requestId: '' })
const showTransfer = ref(false)
const transferForm = reactive<{ targetRecordId: number | ''; itemIds: number[] }>({
  targetRecordId: '',
  itemIds: [],
})

const filteredRecords = computed(() =>
  records.value.filter((record) => {
    const shiftMatched = record.shiftCode.includes(recordFilter.shiftCode.trim())
    const statusMatched = !recordFilter.status || record.status === recordFilter.status
    return shiftMatched && statusMatched
  }),
)

const recordCards = computed(() => [
  { label: '交接记录', value: records.value.length },
  { label: '待确认班次', value: records.value.filter((item) => item.status === '待确认').length },
  { label: '待确认事项', value: records.value.reduce((sum, item) => sum + item.pendingCount, 0) },
  { label: '已办结班次', value: records.value.filter((item) => item.status === '已办结').length },
])

const transferTargets = computed(() =>
  records.value.filter(
    (record) => selectedId.value !== undefined && record.id > selectedId.value && record.status === '待确认',
  ),
)

const transferableItems = computed(() => detail.value?.items.filter((item) => item.state === '待确认') ?? [])

function reloadRecords() {
  records.value = listHandoverRecords()
}

function clearRecordFilter() {
  recordFilter.shiftCode = ''
  recordFilter.status = ''
}

function resetData() {
  resetHandoverData()
  selectedId.value = undefined
  detail.value = undefined
  accountabilityRows.value = []
  reloadRecords()
}

function openCreate() {
  Object.assign(createForm, {
    shiftCode: '',
    outgoingTeam: '',
    handoverPerson: '',
    receivingTeam: '',
    items: [{ content: '', responsiblePerson: '' }],
  })
  formMessage.value = ''
  formOk.value = false
  showCreate.value = true
}

function addDraftItem() {
  createForm.items.push({ content: '', responsiblePerson: '' })
}

function removeDraftItem(index: number) {
  createForm.items.splice(index, 1)
}

function submitCreate() {
  formOk.value = false
  const result = createHandover({
    shiftCode: createForm.shiftCode,
    outgoingTeam: createForm.outgoingTeam,
    handoverPerson: createForm.handoverPerson,
    receivingTeam: createForm.receivingTeam,
    items: createForm.items,
  })
  formMessage.value = result.message
  if (!result.ok || !result.data) {
    return
  }
  showCreate.value = false
  reloadRecords()
  openDetail(result.data.recordId)
}

function openDetail(recordId: number) {
  const result = getHandoverDetail(recordId)
  if (!result.ok || !result.data) {
    formMessage.value = result.message
    formOk.value = false
    return
  }
  selectedId.value = recordId
  detail.value = result.data
  const accountability = getAccountability(recordId)
  accountabilityRows.value = accountability.ok ? accountability.data ?? [] : []
}

function openConfirm(itemId: number) {
  const item = detail.value?.items.find((candidate) => candidate.id === itemId)
  if (!item) {
    return
  }
  confirmItemId.value = itemId
  confirmForm.confirmedContent = item.content
  confirmForm.confirmedBy = detail.value?.record.receivingTeam ?? ''
  confirmForm.requestId = `confirm-${item.recordId}-${item.id}-${Date.now()}`
  formMessage.value = ''
  formOk.value = false
}

function submitConfirm() {
  if (confirmItemId.value === null || !detail.value) {
    return
  }
  const result = confirmHandoverItem({
    recordId: detail.value.record.id,
    itemId: confirmItemId.value,
    confirmedContent: confirmForm.confirmedContent,
    confirmedBy: confirmForm.confirmedBy,
    requestId: confirmForm.requestId,
  })
  formMessage.value = result.message
  formOk.value = result.ok
  if (!result.ok) {
    return
  }
  confirmItemId.value = null
  reloadRecords()
  openDetail(detail.value.record.id)
}

function openTransfer() {
  if (!detail.value) {
    return
  }
  transferForm.targetRecordId = ''
  transferForm.itemIds = transferableItems.value.map((item) => item.id)
  formMessage.value = ''
  formOk.value = false
  showTransfer.value = true
}

function submitTransfer() {
  if (!detail.value || transferForm.targetRecordId === '') {
    formOk.value = false
    formMessage.value = '请选择下一个交班记录'
    return
  }
  const result = transferPendingItems({
    recordId: detail.value.record.id,
    targetRecordId: transferForm.targetRecordId,
    itemIds: transferForm.itemIds,
  })
  formMessage.value = result.message
  formOk.value = result.ok
  if (!result.ok) {
    return
  }
  showTransfer.value = false
  reloadRecords()
  openDetail(detail.value.record.id)
}

function finish() {
  if (!detail.value) {
    return
  }
  const result = completeHandover(detail.value.record.id)
  formMessage.value = result.message
  formOk.value = result.ok
  if (!result.ok) {
    return
  }
  reloadRecords()
  openDetail(detail.value.record.id)
}

onMounted(reloadRecords)
</script>

<style scoped>
.handover-page { display: flex; flex-direction: column; gap: 12px; }
.detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.detail-actions, .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.status-pill { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
.status-pill.waiting { background: #fff4de; color: #b54708; }
.status-pill.done { background: #dcfae6; color: #067647; }
.muted { color: var(--muted); }
.rule-tip { border-radius: 6px; padding: 8px 10px; margin: 0; }
.rule-tip.warning { background: #fff4de; color: #b54708; }
.rule-tip.success { background: #dcfae6; color: #067647; }
.item-table { min-width: 1100px; }
.disagreement { color: #b42318; font-weight: 600; }
.disagreement-tag { display: block; font-style: normal; color: #b42318; font-size: 12px; margin-top: 4px; }
.accountability { background: #fff; border: 1px solid var(--border); padding: 12px; }
.accountability h4 { margin: 0 0 10px; }
.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.48); display: flex; align-items: center; justify-content: center; z-index: 10; padding: 20px; }
.modal { width: min(900px, 96vw); max-height: 90vh; overflow: auto; background: #fff; border-radius: 10px; padding: 18px; }
.modal h3 { margin: 0 0 10px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.form-grid label, .block-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.form-grid input, .block-field textarea, .block-field select, .item-editor input, .item-editor textarea { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 7px 8px; font: inherit; }
.sub-head { display: flex; justify-content: space-between; align-items: center; margin: 14px 0 8px; }
.sub-head h4 { margin: 0; }
.item-editor { display: grid; grid-template-columns: 1fr 220px 60px; gap: 8px; align-items: end; margin-bottom: 8px; }
.item-editor label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.content-field span, .block-field span { font-size: 12px; color: var(--muted); }
.block-field { margin-bottom: 10px; }
.form-message { font-size: 13px; margin: 8px 0; }
.form-message.ok { color: #067647; }
.transfer-list { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--border); border-radius: 6px; padding: 10px; max-height: 260px; overflow: auto; }
.check-row { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.stat-value.small { font-size: 16px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
