// スタッフ雇用区分
export type EmploymentType = 'fulltime' | 'short' | 'part'

// シフト種別ID
export type ShiftTypeId = string

// スタッフ定義
export interface Staff {
  id: string
  name: string
  employmentType: EmploymentType
  eligibleShifts: ShiftTypeId[]
  targetDaysOff: number
  kajitaMode?: boolean
}

// シフト種別定義
export interface ShiftType {
  id: ShiftTypeId
  label: string
  startTime: string | null
  endTime: string | null
  color: string
}

// config.json の型
export interface Config {
  staffs: Staff[]
  shiftTypes: ShiftType[]
}

// 希望種別
export type RequestType = 'off' | ShiftTypeId

// スタッフ1名の月間希望
export interface StaffRequest {
  staffId: string
  year: number
  month: number
  // key: "YYYY-MM-DD", value: シフト種別ID ("off" または shiftType.id)
  requests: Record<string, RequestType>
}

// requests.json の型
export type RequestsData = StaffRequest[]

// シフトセル（1スタッフ1日分）
export interface ShiftCell {
  shiftTypeId: ShiftTypeId | null
  isViolation: boolean
}

// シフト表（1ヶ月分）
// key: staffId, value: key: "YYYY-MM-DD", value: ShiftCell
export type ScheduleData = Record<string, Record<string, ShiftCell>>

// 制約違反情報
export interface Violation {
  date: string // "YYYY-MM-DD"
  staffId: string | null // null = 日付全体の違反
  rule: string
  message: string
}

// スケジューラーの出力
export interface ScheduleResult {
  schedule: ScheduleData
  violations: Violation[]
}

// イベント定義
export interface CalendarEvent {
  id: string
  name: string
  date: string            // "YYYY-MM-DD"
  startTime: string       // "HH:MM"
  endTime: string         // "HH:MM"
  requiredStaffIds?: string[]
}

export type EventsData = CalendarEvent[]

// アプリケーション全体の状態
export interface AppState {
  config: Config
  requests: RequestsData
  year: number
  month: number
}
