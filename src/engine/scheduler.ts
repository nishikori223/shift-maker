import type {
  Config,
  RequestsData,
  ScheduleData,
  ScheduleResult,
  ShiftCell,
  ShiftType,
  Staff,
  Violation,
} from '../types'

// ─── 時刻ユーティリティ ───────────────────────────────────────────────────────

/** "HH:MM" → 分（0起算） */
function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** 分 → "HH:MM" */
function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * シフト種別の時刻境界から時間帯区間一覧を生成。
 * 例: 08:00, 11:00, 17:00, 20:00 → [{8-11}, {11-17}, {17-20}]
 */
function getTimeIntervals(shiftTypes: ShiftType[]): Array<{ start: number; end: number }> {
  const times = new Set<number>()
  for (const st of shiftTypes) {
    if (st.startTime && st.endTime) {
      times.add(parseTime(st.startTime))
      times.add(parseTime(st.endTime))
    }
  }
  const sorted = Array.from(times).sort((a, b) => a - b)
  const result: Array<{ start: number; end: number }> = []
  for (let i = 0; i < sorted.length - 1; i++) {
    result.push({ start: sorted[i], end: sorted[i + 1] })
  }
  return result
}

/** シフト種別が指定の時間帯区間をカバーするか */
function shiftCoversInterval(st: ShiftType, start: number, end: number): boolean {
  if (!st.startTime || !st.endTime) return false
  return parseTime(st.startTime) <= start && parseTime(st.endTime) >= end
}

// ─── 日付ユーティリティ ───────────────────────────────────────────────────────

/** 対象月の全日付を "YYYY-MM-DD" 形式で返す */
function getDatesInMonth(year: number, month: number): string[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  })
}

// ─── R1/R2 バリデーション（時間帯ベース、共通） ──────────────────────────────

function checkCoverageViolations(
  config: Config,
  schedule: ScheduleData,
  dates: string[],
): { violations: Violation[]; violatedDates: Set<string> } {
  const violations: Violation[] = []
  const violatedDates = new Set<string>()
  const stMap = new Map(config.shiftTypes.map((st) => [st.id, st]))
  const intervals = getTimeIntervals(config.shiftTypes)

  for (const date of dates) {
    let dateViolated = false

    if (intervals.length === 0) {
      // 時間帯情報なし → 日単位の簡易チェック
      const empWork = config.staffs
        .filter((s) => s.employmentType !== 'part')
        .filter((s) => {
          const c = schedule[s.id]?.[date]
          return c && c.shiftTypeId !== 'off' && c.shiftTypeId !== null
        }).length
      const total = config.staffs.filter((s) => {
        const c = schedule[s.id]?.[date]
        return c && c.shiftTypeId !== 'off' && c.shiftTypeId !== null
      }).length
      if (empWork === 0) { violations.push({ date, staffId: null, rule: 'R1', message: `${date}: 社員が0名です` }); dateViolated = true }
      if (total < 2) { violations.push({ date, staffId: null, rule: 'R2', message: `${date}: 出勤者が${total}名です（最低2名必要）` }); dateViolated = true }
    } else {
      for (const iv of intervals) {
        const label = `${formatTime(iv.start)}〜${formatTime(iv.end)}`
        const workers = config.staffs.filter((s) => {
          const c = schedule[s.id]?.[date]
          if (!c?.shiftTypeId || c.shiftTypeId === 'off') return false
          const st = stMap.get(c.shiftTypeId)
          return st ? shiftCoversInterval(st, iv.start, iv.end) : false
        })
        const employees = workers.filter((s) => s.employmentType !== 'part')

        if (employees.length === 0) {
          violations.push({ date, staffId: null, rule: 'R1', message: `${date} ${label}: 社員が0名です（全時間帯に社員1名以上必要）` })
          dateViolated = true
        }
        if (workers.length < 2) {
          violations.push({ date, staffId: null, rule: 'R2', message: `${date} ${label}: 出勤者が${workers.length}名です（全時間帯に2名以上必要）` })
          dateViolated = true
        }
      }
    }

    if (dateViolated) violatedDates.add(date)
  }
  return { violations, violatedDates }
}

// ─── ランダムユーティリティ ───────────────────────────────────────────────────

/** Fisher-Yates シャッフル（元配列を変更しない） */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── シフト割り当てヘルパー ────────────────────────────────────────────────────

/**
 * 1日分のシフト種別を「カバレッジ優先 → バランス優先」で割り当てる。
 *
 * アルゴリズム（Greedy + 最小制約優先）:
 * 1. 最もカバーできる候補が少ない未カバー時間帯を選ぶ
 * 2. その時間帯をカバーできる候補の中で、そのシフトをこれまで一番少なくこなした人を選ぶ
 * 3. 全時間帯がカバーされたら残りの未割り当て社員はバランスだけで割り当て
 */
function assignShiftsForDate(
  pending: Staff[],
  date: string,
  schedule: ScheduleData,
  shiftCount: Record<string, Record<string, number>>,
  stMap: Map<string, ShiftType>,
  intervals: Array<{ start: number; end: number }>,
  config: Config,
): void {
  let remaining = shuffled(pending)

  /** 現在のスケジュールで特定時間帯をカバーする社員を返す */
  const employeesCovering = (iv: { start: number; end: number }) =>
    config.staffs
      .filter((s) => s.employmentType !== 'part')
      .filter((s) => {
        const c = schedule[s.id]?.[date]
        if (!c?.shiftTypeId || c.shiftTypeId === 'off') return false
        const st = stMap.get(c.shiftTypeId)
        return st ? shiftCoversInterval(st, iv.start, iv.end) : false
      })

  /** 候補者の中で、指定シフトをこれまで最も少なくこなした（count, staff）を返す（同点はランダム） */
  const leastAssigned = (
    candidates: Staff[],
    coveringShifts: (emp: Staff) => string[],
  ): { staff: Staff; shiftId: string } | null => {
    let bestCount = Infinity
    const tied: { staff: Staff; shiftId: string }[] = []
    for (const emp of shuffled(candidates)) {
      for (const sid of coveringShifts(emp)) {
        const cnt = shiftCount[emp.id]?.[sid] ?? 0
        if (cnt < bestCount) {
          bestCount = cnt
          tied.length = 0
          tied.push({ staff: emp, shiftId: sid })
        } else if (cnt === bestCount) {
          tied.push({ staff: emp, shiftId: sid })
        }
      }
    }
    if (tied.length === 0) return null
    return tied[Math.floor(Math.random() * tied.length)]
  }

  while (remaining.length > 0) {
    // 未カバーの時間帯を探す（社員のみ）
    const uncovered = intervals.filter((iv) => employeesCovering(iv).length === 0)

    if (uncovered.length === 0) {
      // 全時間帯カバー済み → バランスのみで割り当て
      for (const emp of remaining) {
        const workShifts = emp.eligibleShifts.filter((s) => s !== 'off')
        if (workShifts.length === 0) {
          schedule[emp.id][date] = { shiftTypeId: 'off', isViolation: false }
          continue
        }
        // このシフト種別をこれまで最も少なく担当したものを選ぶ
        const best = workShifts.reduce((a, b) =>
          (shiftCount[emp.id]?.[a] ?? 0) <= (shiftCount[emp.id]?.[b] ?? 0) ? a : b,
        )
        schedule[emp.id][date] = { shiftTypeId: best, isViolation: false }
        shiftCount[emp.id][best] = (shiftCount[emp.id][best] ?? 0) + 1
      }
      break
    }

    // 最も制約がきつい時間帯（カバーできる候補が最小）を選ぶ
    let mostConstrained = uncovered[0]
    let minCandidateCount = Infinity
    for (const iv of uncovered) {
      const cnt = remaining.filter((emp) =>
        emp.eligibleShifts.some((sid) => {
          const st = stMap.get(sid)
          return st ? shiftCoversInterval(st, iv.start, iv.end) : false
        }),
      ).length
      if (cnt < minCandidateCount) {
        minCandidateCount = cnt
        mostConstrained = iv
      }
    }

    // カバー候補を探す
    const candidates = remaining.filter((emp) =>
      emp.eligibleShifts.some((sid) => {
        const st = stMap.get(sid)
        return st ? shiftCoversInterval(st, mostConstrained.start, mostConstrained.end) : false
      }),
    )

    if (candidates.length === 0) {
      // 誰もカバーできない → 残り全員をバランスで割り当てて終了
      for (const emp of remaining) {
        const workShifts = emp.eligibleShifts.filter((s) => s !== 'off')
        if (workShifts.length === 0) {
          schedule[emp.id][date] = { shiftTypeId: 'off', isViolation: false }
          continue
        }
        const best = workShifts.reduce((a, b) =>
          (shiftCount[emp.id]?.[a] ?? 0) <= (shiftCount[emp.id]?.[b] ?? 0) ? a : b,
        )
        schedule[emp.id][date] = { shiftTypeId: best, isViolation: false }
        shiftCount[emp.id][best] = (shiftCount[emp.id][best] ?? 0) + 1
      }
      break
    }

    // カバー候補の中でバランスが最良の組み合わせを選ぶ
    const result = leastAssigned(candidates, (emp) =>
      emp.eligibleShifts.filter((sid) => {
        const st = stMap.get(sid)
        return st ? shiftCoversInterval(st, mostConstrained.start, mostConstrained.end) : false
      }),
    )

    if (!result) break

    schedule[result.staff.id][date] = { shiftTypeId: result.shiftId, isViolation: false }
    shiftCount[result.staff.id][result.shiftId] =
      (shiftCount[result.staff.id][result.shiftId] ?? 0) + 1
    remaining = remaining.filter((e) => e.id !== result.staff.id)
  }
}

// ─── メイン：シフト自動割り当て ───────────────────────────────────────────────

/**
 * シフト自動割り当てエンジン（2パス方式）
 *
 * Pass 1: 勤務/休みの日程を確定（targetDaysOff を均等分散）
 * Pass 2: 日ごとにカバレッジ優先→バランス優先でシフト種別を割り当て
 *
 * R1: 全時間帯に社員が1名以上
 * R2: 全時間帯に合計2名以上
 * R3: 希望休は原則確定
 * R4: 月間休日数が targetDaysOff ±1 以内
 * R5: パートは希望申告日のみ勤務
 * R6: 時短社員には early/late を割り当てない（eligibleShifts で制御）
 * R7: 固定休日なし
 */
export function generateSchedule(
  config: Config,
  requests: RequestsData,
  year: number,
  month: number,
): ScheduleResult {
  const dates = getDatesInMonth(year, month)
  const stMap = new Map(config.shiftTypes.map((st) => [st.id, st]))
  const intervals = getTimeIntervals(config.shiftTypes)

  const requestMap: Record<string, Record<string, string>> = {}
  for (const req of requests) {
    if (req.year === year && req.month === month) {
      requestMap[req.staffId] = req.requests
    }
  }

  // ── Pass 1: 各スタッフの日程プランを決定 ────────────────────────────────────
  // dayPlan[staffId][date] = 'off' | null(=勤務、シフト種別は後で決定) | shiftTypeId(=希望シフト)
  const dayPlan: Record<string, Record<string, string | null>> = {}

  for (const staff of config.staffs) {
    dayPlan[staff.id] = {}
    const staffReqs = requestMap[staff.id] ?? {}

    if (staff.employmentType === 'part') {
      // パート: 申告日のみ勤務、申告シフトIDを保存
      for (const date of dates) {
        const req = staffReqs[date]
        dayPlan[staff.id][date] = req && req !== 'off' ? req : 'off'
      }
      continue
    }

    // 社員: まず全日を null（勤務予定）にし、希望休/希望シフトを反映
    for (const date of dates) {
      const req = staffReqs[date]
      if (req === 'off') {
        dayPlan[staff.id][date] = 'off'
      } else if (req && staff.eligibleShifts.includes(req)) {
        dayPlan[staff.id][date] = req // 希望シフト確定
      } else {
        dayPlan[staff.id][date] = null // シフト種別は Pass 2 で決定
      }
    }

    // 休日数の調整（targetDaysOff ±1 を目指す）
    const targetOff = staff.targetDaysOff
    const currentOff = () => dates.filter((d) => dayPlan[staff.id][d] === 'off').length
    // 休日追加の対象: プランが null の日（希望シフト指定日は除く）
    const freeDays = dates.filter((d) => dayPlan[staff.id][d] === null)

    const needed = targetOff - currentOff()
    if (needed > 0 && freeDays.length > 0) {
      // ランダムに休みを追加
      const toOff = Math.min(needed, freeDays.length)
      const picked = shuffled(freeDays).slice(0, toOff)
      for (const d of picked) {
        dayPlan[staff.id][d] = 'off'
      }
    } else if (needed < -1) {
      // 休みが多すぎる場合は後ろから削除（希望休は保持）
      const removable = dates
        .filter((d) => dayPlan[staff.id][d] === 'off' && staffReqs[d] !== 'off')
        .reverse()
      let excess = -needed - 1
      for (const d of removable) {
        if (excess <= 0) break
        dayPlan[staff.id][d] = null
        excess--
      }
    }
  }

  // ── Pass 2: シフト種別の割り当て ────────────────────────────────────────────
  // 各社員のシフト種別ごとの月間累計（バランス制御用）
  const shiftCount: Record<string, Record<string, number>> = {}
  for (const staff of config.staffs) {
    shiftCount[staff.id] = {}
    for (const sid of staff.eligibleShifts) {
      shiftCount[staff.id][sid] = 0
    }
  }

  const schedule: ScheduleData = {}
  for (const staff of config.staffs) {
    schedule[staff.id] = {}
    for (const date of dates) {
      schedule[staff.id][date] = { shiftTypeId: null, isViolation: false }
    }
  }

  for (const date of dates) {
    const employees = config.staffs.filter((s) => s.employmentType !== 'part')
    const pendingEmployees: Staff[] = []

    // パートを確定
    for (const staff of config.staffs.filter((s) => s.employmentType === 'part')) {
      const plan = dayPlan[staff.id][date]
      schedule[staff.id][date] = { shiftTypeId: plan ?? 'off', isViolation: false }
      if (plan && plan !== 'off') {
        shiftCount[staff.id][plan] = (shiftCount[staff.id][plan] ?? 0) + 1
      }
    }

    // 社員: 休み・希望シフトを先に確定し、残りは pending に
    for (const staff of employees) {
      const plan = dayPlan[staff.id][date]
      if (plan === 'off') {
        schedule[staff.id][date] = { shiftTypeId: 'off', isViolation: false }
      } else if (plan !== null) {
        // 希望シフト確定
        schedule[staff.id][date] = { shiftTypeId: plan, isViolation: false }
        shiftCount[staff.id][plan] = (shiftCount[staff.id][plan] ?? 0) + 1
      } else {
        // シフト種別を Pass 2 で決定
        pendingEmployees.push(staff)
      }
    }

    // カバレッジ優先→バランス優先でシフトを割り当て
    if (pendingEmployees.length > 0) {
      assignShiftsForDate(pendingEmployees, date, schedule, shiftCount, stMap, intervals, config)
    }
  }

  // ── Step 5: 制約チェック ─────────────────────────────────────────────────────
  const violations: Violation[] = []

  // R1 / R2（時間帯ベース）
  const { violations: cvViolations, violatedDates } = checkCoverageViolations(config, schedule, dates)
  violations.push(...cvViolations)
  for (const date of violatedDates) {
    for (const staff of config.staffs) {
      if (schedule[staff.id]?.[date]) schedule[staff.id][date].isViolation = true
    }
  }

  // R3: 希望休が出勤になっていないか
  for (const staff of config.staffs.filter((s) => s.employmentType !== 'part')) {
    const staffReqs = requestMap[staff.id] ?? {}
    for (const date of dates) {
      if (staffReqs[date] === 'off' && schedule[staff.id]?.[date]?.shiftTypeId !== 'off') {
        violations.push({ date, staffId: staff.id, rule: 'R3', message: `${staff.name}(${date}): 希望休が出勤になっています（手動調整が必要）` })
        schedule[staff.id][date].isViolation = true
      }
    }
  }

  // R4: 休日数チェック
  for (const staff of config.staffs.filter((s) => s.employmentType !== 'part')) {
    const offCount = dates.filter((d) => schedule[staff.id]?.[d]?.shiftTypeId === 'off').length
    const target = staff.targetDaysOff
    if (Math.abs(offCount - target) > 1) {
      violations.push({
        date: `${year}-${String(month).padStart(2, '0')}`,
        staffId: staff.id,
        rule: 'R4',
        message: `${staff.name}: 休日数が${offCount}日です（目標${target}日 ±1日）`,
      })
    }
  }

  return { schedule, violations }
}

// ─── ユーティリティ関数（公開） ───────────────────────────────────────────────

export function countWorkersOnDate(schedule: ScheduleData, staffIds: string[], date: string): number {
  return staffIds.filter((id) => {
    const c = schedule[id]?.[date]
    return c && c.shiftTypeId !== 'off' && c.shiftTypeId !== null
  }).length
}

export function countDaysOff(schedule: ScheduleData, staffId: string, dates: string[]): number {
  return dates.filter((d) => schedule[staffId]?.[d]?.shiftTypeId === 'off').length
}

export function countWorkDays(schedule: ScheduleData, staffId: string, dates: string[]): number {
  return dates.filter((d) => {
    const c = schedule[staffId]?.[d]
    return c && c.shiftTypeId !== 'off' && c.shiftTypeId !== null
  }).length
}

export { getDatesInMonth }

export function updateCell(schedule: ScheduleData, staffId: string, date: string, shiftTypeId: string): ScheduleData {
  return { ...schedule, [staffId]: { ...schedule[staffId], [date]: { shiftTypeId, isViolation: false } } }
}

export function revalidateSchedule(
  config: Config,
  requests: RequestsData,
  schedule: ScheduleData,
  year: number,
  month: number,
): { schedule: ScheduleData; violations: Violation[] } {
  const dates = getDatesInMonth(year, month)
  const violations: Violation[] = []

  const newSchedule: ScheduleData = {}
  for (const staffId of Object.keys(schedule)) {
    newSchedule[staffId] = {}
    for (const date of Object.keys(schedule[staffId])) {
      newSchedule[staffId][date] = { ...schedule[staffId][date], isViolation: false }
    }
  }

  const requestMap: Record<string, Record<string, string>> = {}
  for (const req of requests) {
    if (req.year === year && req.month === month) requestMap[req.staffId] = req.requests
  }

  const { violations: cvViolations, violatedDates } = checkCoverageViolations(config, newSchedule, dates)
  violations.push(...cvViolations)
  for (const date of violatedDates) {
    for (const staff of config.staffs) {
      if (newSchedule[staff.id]?.[date]) newSchedule[staff.id][date].isViolation = true
    }
  }

  for (const staff of config.staffs.filter((s) => s.employmentType !== 'part')) {
    const staffReqs = requestMap[staff.id] ?? {}
    for (const date of dates) {
      if (staffReqs[date] === 'off' && newSchedule[staff.id]?.[date]?.shiftTypeId !== 'off') {
        violations.push({ date, staffId: staff.id, rule: 'R3', message: `${staff.name}(${date}): 希望休が出勤になっています` })
        newSchedule[staff.id][date].isViolation = true
      }
    }
  }

  for (const staff of config.staffs.filter((s) => s.employmentType !== 'part')) {
    const offCount = dates.filter((d) => newSchedule[staff.id]?.[d]?.shiftTypeId === 'off').length
    const target = staff.targetDaysOff
    if (Math.abs(offCount - target) > 1) {
      violations.push({
        date: `${year}-${String(month).padStart(2, '0')}`,
        staffId: staff.id,
        rule: 'R4',
        message: `${staff.name}: 休日数が${offCount}日です（目標${target}日 ±1日）`,
      })
    }
  }

  return { schedule: newSchedule, violations }
}

export function isUnassigned(cell: ShiftCell | undefined): boolean {
  return !cell || cell.shiftTypeId === null
}
