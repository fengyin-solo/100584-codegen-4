<template>
  <section class="page" data-module="shifthandover">
    <header class="page-head">
      <div>
        <h2>交接班管理</h2>
        <p class="page-desc">
          一个交班班次对应一个接班班组；遗留事项逐条列出、逐条确认，未确认完不允许办结；事项可原样转至下一班，办结后每条都能追到责任人。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">新建交班记录</button>
        <button class="btn" type="button" @click="exportRows">导出交接清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in itemSummary" :key="item.label" class="legend-item">
        {{ item.label }}：{{ item.count }}
      </span>
    </p>

    <div v-if="creating" class="panel">
      <div class="panel-head">
        <h3>新建交班记录</h3>
        <button class="link" type="button" @click="creating = false">收起</button>
      </div>
      <form class="form-grid" @submit.prevent="submitCreate">
        <label class="form-item">
          <span>值班日期</span>
          <input v-model="draft.shiftDate" type="date" required />
        </label>
        <label class="form-item">
          <span>班次</span>
          <select v-model="draft.shiftName">
            <option>白班</option>
            <option>夜班</option>
          </select>
        </label>
        <label class="form-item">
          <span>交班班组</span>
          <input v-model="draft.fromTeam" placeholder="如：运行二班" required />
        </label>
        <label class="form-item">
          <span>交班人</span>
          <input v-model="draft.fromPerson" required />
        </label>
        <label class="form-item">
          <span>接班班组</span>
          <input v-model="draft.toTeam" placeholder="如：运行三班" required />
        </label>
        <label class="form-item">
          <span>接班人</span>
          <input v-model="draft.toPerson" required />
        </label>
        <div class="full-row">
          <div class="items-head">
            <span>当班遗留事项（逐条登记，每条都要落到责任人）</span>
            <button class="btn ghost" type="button" @click="addDraftItem">加一条</button>
          </div>
          <div v-for="(item, index) in draft.items" :key="index" class="draft-item">
            <input v-model="item.content" :placeholder="`遗留事项 ${index + 1}：内容`" />
            <input v-model="item.responsible" class="responsible-input" placeholder="责任人" />
            <button
              v-if="draft.items.length > 1"
              class="link"
              type="button"
              @click="removeDraftItem(index)"
            >
              删除
            </button>
          </div>
        </div>
        <div class="full-row form-actions">
          <button class="btn primary" type="submit">提交交班记录</button>
          <button class="btn" type="button" @click="creating = false">取消</button>
          <span class="hint-text">同一班次重复提交只会保留一条，系统会自动识别。</span>
        </div>
      </form>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>班次</th>
          <th>交班班组</th>
          <th>交班人</th>
          <th>接班班组</th>
          <th>接班人</th>
          <th>事项数</th>
          <th>已确认</th>
          <th>记录状态</th>
          <th>提交时间</th>
          <th>办结时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="record in ordered"
          :key="record.id"
          :class="{ 'selected-row': record.id === selectedId }"
          @click="select(record)"
        >
          <td>{{ record.shiftDate }} {{ record.shiftName }}</td>
          <td>{{ record.fromTeam }}</td>
          <td>{{ record.fromPerson }}</td>
          <td>{{ record.toTeam }}</td>
          <td>{{ record.toPerson }}</td>
          <td>{{ record.items.length }}</td>
          <td>{{ record.items.filter((item) => item.status === '已确认').length }}</td>
          <td>
            <span class="tag" :class="record.status === '已办结' ? 'ok' : 'warn'">
              {{ record.status }}
            </span>
          </td>
          <td>{{ record.createdAt }}</td>
          <td>{{ record.closedAt ?? '—' }}</td>
          <td>
            <button class="link" type="button" @click.stop="select(record)">查看</button>
          </td>
        </tr>
        <tr v-if="!ordered.length">
          <td colspan="11" class="empty-state">暂无交班记录，可先新建交班记录</td>
        </tr>
      </tbody>
    </table>

    <div v-if="selected" class="panel">
      <div class="panel-head">
        <h3>
          交班详情：{{ selected.shiftDate }} {{ selected.shiftName }}（{{ selected.fromTeam }} →
          {{ selected.toTeam }}）
        </h3>
        <div class="panel-actions">
          <span class="tag" :class="selected.status === '已办结' ? 'ok' : 'warn'">
            {{ selected.status }}
          </span>
          <button
            v-if="selected.status === '待确认'"
            class="btn primary"
            type="button"
            @click="closeSelected"
          >
            办结交班记录
          </button>
        </div>
      </div>
      <p class="hint-text">
        交班人：{{ selected.fromPerson }}　接班人：{{ selected.toPerson }}　提交时间：{{
          selected.createdAt
        }}
        <template v-if="selected.closedAt">　办结时间：{{ selected.closedAt }}</template>
        <template v-else>　还有 {{ unconfirmedCount }} 条未确认，全部确认后才能办结</template>
      </p>

      <table class="data-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>遗留事项（交班人登记）</th>
            <th>责任人（交班人）</th>
            <th>接班确认口径</th>
            <th>责任人（接班确认）</th>
            <th>状态</th>
            <th>确认人/时间</th>
            <th>来源</th>
            <th>去向</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in selected.items" :key="item.id">
            <td>{{ item.id }}</td>
            <td>{{ item.content }}</td>
            <td>{{ item.responsible }}</td>
            <td>
              <template v-if="item.status === '已确认'">
                {{ item.confirmedContent }}
                <span
                  v-if="item.confirmedContent !== item.content"
                  class="tag ok"
                  title="与交班人说法不一致，以接班班组确认的为准"
                >
                  以接班确认为准
                </span>
              </template>
              <template v-else>—</template>
            </td>
            <td>{{ item.status === '已确认' ? item.confirmedResponsible : '—' }}</td>
            <td>
              <span class="tag" :class="item.status === '已确认' ? 'ok' : 'warn'">
                {{ item.status }}
              </span>
            </td>
            <td>
              <template v-if="item.confirmedBy">{{ item.confirmedBy }} / {{ item.confirmedAt }}</template>
              <template v-else>—</template>
            </td>
            <td>{{ originOf(item) }}</td>
            <td>{{ carriedOf(item) }}</td>
            <td class="row-actions">
              <button
                v-if="item.status === '待确认' && selected.status === '待确认'"
                class="link"
                type="button"
                @click="openConfirm(item)"
              >
                确认
              </button>
              <button class="link" type="button" @click="openCarry(item)">转至下一班</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="confirming" class="panel sub">
        <div class="panel-head">
          <h3>确认遗留事项 {{ confirming.id }}</h3>
          <button class="link" type="button" @click="confirmingId = null">收起</button>
        </div>
        <p class="hint-text">
          交班人登记：{{ confirming.content }}（责任人：{{ confirming.responsible }}）
        </p>
        <form class="form-grid" @submit.prevent="submitConfirm">
          <label class="form-item full-row">
            <span>接班确认口径（与交班人说法不一致时，以这里填的为准）</span>
            <input v-model="confirmForm.confirmedContent" required />
          </label>
          <label class="form-item">
            <span>责任人（接班确认）</span>
            <input v-model="confirmForm.confirmedResponsible" required />
          </label>
          <label class="form-item">
            <span>确认人</span>
            <input v-model="confirmForm.confirmedBy" required />
          </label>
          <div class="full-row form-actions">
            <button class="btn primary" type="submit">提交确认</button>
            <button class="btn" type="button" @click="confirmingId = null">取消</button>
            <span class="hint-text">重复提交确认会被系统识别，不会重复登记。</span>
          </div>
        </form>
      </div>

      <div v-if="carrying" class="panel sub">
        <div class="panel-head">
          <h3>转出遗留事项 {{ carrying.id }}</h3>
          <button class="link" type="button" @click="carryingId = null">收起</button>
        </div>
        <p class="hint-text">
          转出后原事项保持原样、不跟着改；目标记录里生成一条待确认快照，由下一班重新确认。
        </p>
        <div v-if="carryCandidates.length" class="form-actions">
          <select v-model.number="carryTargetId">
            <option v-for="candidate in carryCandidates" :key="candidate.id" :value="candidate.id">
              {{ candidate.shiftDate }} {{ candidate.shiftName }}（{{ candidate.toTeam }} 接班）
            </option>
          </select>
          <button class="btn primary" type="button" @click="submitCarry">确认转出</button>
          <button class="btn" type="button" @click="carryingId = null">取消</button>
        </div>
        <p v-else class="hint-text">还没有可转入的待确认交班记录，请先新建下一个班次的交班记录。</p>
      </div>

      <div v-if="selected.status === '已办结'" class="panel sub">
        <div class="panel-head">
          <h3>责任追溯（办结口径，以接班班组确认为准）</h3>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>最终描述</th>
              <th>责任人</th>
              <th>确认人</th>
              <th>确认时间</th>
              <th>来源</th>
              <th>去向</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in trace" :key="row.itemId">
              <td>{{ row.itemId }}</td>
              <td>{{ row.content }}</td>
              <td>{{ row.responsible }}</td>
              <td>{{ row.confirmedBy }}</td>
              <td>{{ row.confirmedAt }}</td>
              <td>{{ row.origin }}</td>
              <td>{{ row.carriedTo }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <footer class="page-foot">
      <span>共 {{ records.length }} 条交班记录</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  carriedToLabel,
  carryItem,
  closeHandover,
  confirmItem,
  downloadHandovers,
  listRecords,
  originLabel,
  submitHandover,
  traceRows,
} from '@/api/handover-service'
import type { HandoverItem, HandoverRecord, HandoverResult } from '@/data/handover-types'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()

const records = ref<HandoverRecord[]>([])
const selectedId = ref<number | null>(null)
const creating = ref(false)
const message = ref('')
const messageOk = ref(true)

const draft = ref({
  shiftDate: '',
  shiftName: '白班',
  fromTeam: '',
  fromPerson: '',
  toTeam: '',
  toPerson: '',
  items: [{ content: '', responsible: '' }] as { content: string; responsible: string }[],
})

const confirmingId = ref<string | null>(null)
const confirmForm = ref({ confirmedContent: '', confirmedResponsible: '', confirmedBy: '' })

const carryingId = ref<string | null>(null)
const carryTargetId = ref<number | null>(null)

const ordered = computed(() => [...records.value].sort((a, b) => b.id - a.id))
const selected = computed(() => records.value.find((row) => row.id === selectedId.value) ?? null)
const confirming = computed(
  () => selected.value?.items.find((item) => item.id === confirmingId.value) ?? null,
)
const carrying = computed(
  () => selected.value?.items.find((item) => item.id === carryingId.value) ?? null,
)
const carryCandidates = computed(() =>
  records.value.filter((row) => row.status === '待确认' && row.id !== selectedId.value),
)
const unconfirmedCount = computed(
  () => selected.value?.items.filter((item) => item.status !== '已确认').length ?? 0,
)
const trace = computed(() =>
  selected.value && selected.value.status === '已办结' ? traceRows(selected.value.id) : [],
)

const stats = computed(() => [
  { label: '交班记录', value: records.value.length },
  { label: '待确认记录', value: records.value.filter((row) => row.status === '待确认').length },
  { label: '已办结记录', value: records.value.filter((row) => row.status === '已办结').length },
  {
    label: '待确认事项',
    value: records.value.reduce(
      (sum, row) => sum + row.items.filter((item) => item.status === '待确认').length,
      0,
    ),
  },
])

const itemSummary = computed(() => {
  const items = records.value.flatMap((row) => row.items)
  return [
    { label: '待确认事项', count: items.filter((item) => item.status === '待确认').length },
    { label: '已确认事项', count: items.filter((item) => item.status === '已确认').length },
    { label: '跨班转入', count: items.filter((item) => item.carriedFrom !== null).length },
    { label: '已转出', count: items.filter((item) => item.carriedTo !== null).length },
  ]
})

function show(result: HandoverResult) {
  message.value = result.message
  messageOk.value = result.ok
}

function reload() {
  records.value = [...listRecords()]
}

function select(record: HandoverRecord) {
  selectedId.value = record.id
  confirmingId.value = null
  carryingId.value = null
}

function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function openCreate() {
  creating.value = true
  draft.value = {
    shiftDate: today(),
    shiftName: store.shiftLabel.includes('夜') ? '夜班' : '白班',
    fromTeam: '',
    fromPerson: store.operator,
    toTeam: '',
    toPerson: '',
    items: [{ content: '', responsible: '' }],
  }
}

function addDraftItem() {
  draft.value.items.push({ content: '', responsible: '' })
}

function removeDraftItem(index: number) {
  draft.value.items.splice(index, 1)
}

function submitCreate() {
  const result = submitHandover(draft.value)
  show(result)
  if (result.ok && result.record) {
    creating.value = false
    reload()
    select(result.record)
  }
}

function openConfirm(item: HandoverItem) {
  if (!selected.value) {
    return
  }
  confirmingId.value = item.id
  carryingId.value = null
  confirmForm.value = {
    confirmedContent: item.content,
    confirmedResponsible: item.responsible,
    confirmedBy: selected.value.toPerson,
  }
}

function submitConfirm() {
  if (!selected.value || !confirmingId.value) {
    return
  }
  const result = confirmItem(selected.value.id, confirmingId.value, confirmForm.value)
  show(result)
  if (result.ok) {
    confirmingId.value = null
  }
  reload()
}

function openCarry(item: HandoverItem) {
  carryingId.value = item.id
  confirmingId.value = null
  carryTargetId.value = carryCandidates.value[0]?.id ?? null
}

function submitCarry() {
  if (!selected.value || !carryingId.value) {
    return
  }
  if (carryTargetId.value === null) {
    show({ ok: false, message: '请先选择要转入的交班记录' })
    return
  }
  const result = carryItem(selected.value.id, carryingId.value, carryTargetId.value)
  show(result)
  if (result.ok) {
    carryingId.value = null
  }
  reload()
}

function closeSelected() {
  if (!selected.value) {
    return
  }
  const result = closeHandover(selected.value.id)
  show(result)
  reload()
}

function exportRows() {
  downloadHandovers()
}

function originOf(item: HandoverItem): string {
  return originLabel(item)
}

function carriedOf(item: HandoverItem): string {
  return carriedToLabel(item)
}

onMounted(() => {
  reload()
  const pending = records.value.find((row) => row.status === '待确认')
  selectedId.value = (pending ?? records.value[records.value.length - 1])?.id ?? null
})
</script>
