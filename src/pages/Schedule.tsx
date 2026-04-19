import { useState, useCallback } from 'react'
import type { Config, RequestsData, ScheduleData, Violation } from '../types'
import {
  generateSchedule,
  revalidateSchedule,
  getDatesInMonth,
  countDaysOff,
  countWorkDays,
  updateCell,
} from '../engine/scheduler'
import { exportToExcel } from '../utils/excelExport'

interface Props {
  config: Config
  requests: RequestsData
  year: number
  month: number
  schedule: ScheduleData | null
  violations: Violation[]
  isGenerated: boolean
  onScheduleChange: (schedule: ScheduleData | null) => void
  onViolationsChange: (violations: Violation[]) => void
  onIsGeneratedChange: (isGenerated: boolean) => void
}

export default function Schedule({
  config,
  requests,
  year,
  month,
  schedule,
  violations,
  isGenerated,
  onScheduleChange,
  onViolationsChange,
  onIsGeneratedChange,
}: Props) {
  const [editingCell, setEditingCell] = useState<{
    staffId: string
    date: string
  } | null>(null)

  const dates = getDatesInMonth(year, month)
  const shiftTypeMap = new Map(config.shiftTypes.map((s) => [s.id, s]))

  // 希望休として申請されている staffId:date のセット
  const requestedOffSet = new Set<string>()
  for (const req of requests) {
    if (req.year === year && req.month === month) {
      for (const [date, val] of Object.entries(req.requests)) {
        if (val === 'off') requestedOffSet.add(`${req.staffId}:${date}`)
      }
    }
  }

  // シフト生成
  const handleGenerate = () => {
    if (config.staffs.length === 0) return
    const result = generateSchedule(config, requests, year, month)
    onScheduleChange(result.schedule)
    onViolationsChange(result.violations)
    onIsGeneratedChange(true)
    setEditingCell(null)
  }

  // セルクリックでシフト変更ドロップダウン
  const handleCellClick = (staffId: string, date: string) => {
    if (!isGenerated) return
    setEditingCell(
      editingCell?.staffId === staffId && editingCell?.date === date
        ? null
        : { staffId, date },
    )
  }

  // シフト種別を変更
  const handleShiftChange = useCallback(
    (staffId: string, date: string, shiftTypeId: string) => {
      if (!schedule) return
      const newSchedule = updateCell(schedule, staffId, date, shiftTypeId)
      const result = revalidateSchedule(config, requests, newSchedule, year, month)
      onScheduleChange(result.schedule)
      onViolationsChange(result.violations)
      setEditingCell(null)
    },
    [schedule, config, requests, year, month],
  )

  // Excel出力
  const handleExport = () => {
    if (!schedule) return
    exportToExcel(config, schedule, requests, year, month)
  }

  // 印刷
  const handlePrint = () => {
    window.print()
  }

  const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

  // 日別集計：シフト種別ごとの人数
  const getDailySummary = (date: string) => {
    const summary: Record<string, number> = {}
    for (const staff of config.staffs) {
      const cell = schedule?.[staff.id]?.[date]
      if (cell?.shiftTypeId && cell.shiftTypeId !== 'off') {
        summary[cell.shiftTypeId] = (summary[cell.shiftTypeId] ?? 0) + 1
      }
    }
    return summary
  }

  // 社員のみの日別集計
  const getEmployeeDailySummary = (date: string) => {
    const summary: Record<string, number> = {}
    for (const staff of config.staffs.filter((s) => s.employmentType !== 'part')) {
      const cell = schedule?.[staff.id]?.[date]
      if (cell?.shiftTypeId && cell.shiftTypeId !== 'off') {
        summary[cell.shiftTypeId] = (summary[cell.shiftTypeId] ?? 0) + 1
      }
    }
    return summary
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      <div className="flex items-center justify-between mb-4 no-print flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-800">
          {year}年{month}月 シフト表
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={config.staffs.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm font-medium"
          >
            シフト生成
          </button>
          {isGenerated && (
            <>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
              >
                Excel出力
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm font-medium"
              >
                印刷
              </button>
            </>
          )}
        </div>
      </div>

      {config.staffs.length === 0 && (
        <div className="text-center text-gray-400 py-16">
          先に設定画面でスタッフを登録してください
        </div>
      )}

      {!isGenerated && config.staffs.length > 0 && (
        <div className="text-center text-gray-400 py-16">
          「シフト生成」ボタンを押してシフト表を作成してください
        </div>
      )}

      {/* 制約違反サマリー */}
      {isGenerated && violations.length > 0 && (
        <div className="mb-4 p-4 bg-orange-50 rounded-lg border border-orange-200 no-print">
          <h3 className="font-medium text-orange-800 mb-2">
            ⚠️ 制約違反 ({violations.length}件)
          </h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {violations.map((v, i) => (
              <div key={i} className="text-sm text-orange-700">
                <span className="font-mono text-xs bg-orange-100 px-1 rounded mr-2">
                  {v.rule}
                </span>
                {v.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {isGenerated && violations.length === 0 && (
        <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200 no-print">
          <span className="text-green-700 text-sm font-medium">
            ✓ 制約違反なし
          </span>
        </div>
      )}

      {/* シフト表グリッド */}
      {isGenerated && schedule && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full min-w-max">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-700 text-white px-2 py-1.5 text-left min-w-[100px] sticky left-0 z-10">
                  スタッフ
                </th>
                {dates.map((date) => {
                  const d = new Date(date)
                  const dayNum = d.getDate()
                  const dayOfWeek = d.getDay()
                  return (
                    <th
                      key={date}
                      className={`border border-gray-300 px-1 py-1 text-center min-w-[52px] ${
                        dayOfWeek === 0
                          ? 'bg-red-100 text-red-700'
                          : dayOfWeek === 6
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-700 text-white'
                      }`}
                    >
                      <div>{dayNum}</div>
                      <div className="text-xs opacity-80">
                        {DAY_NAMES[dayOfWeek]}
                      </div>
                    </th>
                  )
                })}
                <th className="border border-gray-300 bg-gray-600 text-white px-2 py-1.5 text-center min-w-[52px]">
                  休日
                </th>
                <th className="border border-gray-300 bg-gray-600 text-white px-2 py-1.5 text-center min-w-[52px]">
                  勤務
                </th>
              </tr>
            </thead>
            <tbody>
              {config.staffs.map((staff) => (
                <tr key={staff.id} className="hover:bg-yellow-50">
                  <td className="border border-gray-300 bg-white px-2 py-1 font-medium sticky left-0 z-10">
                    <div>{staff.name}</div>
                    <div className="text-gray-400 text-xs">
                      {staff.employmentType === 'fulltime'
                        ? '正社員'
                        : staff.employmentType === 'short'
                          ? '時短'
                          : 'パート'}
                    </div>
                  </td>
                  {dates.map((date) => {
                    const cell = schedule[staff.id]?.[date]
                    const shiftType = cell?.shiftTypeId
                      ? shiftTypeMap.get(cell.shiftTypeId)
                      : null
                    const isEditing =
                      editingCell?.staffId === staff.id &&
                      editingCell?.date === date

                    return (
                      <td
                        key={date}
                        className={`border px-0 py-0 text-center cursor-pointer relative ${
                          cell?.isViolation
                            ? 'border-red-500 border-2'
                            : 'border-gray-300'
                        }`}
                        style={{
                          backgroundColor: shiftType?.color ?? '#ffffff',
                        }}
                        onClick={() => handleCellClick(staff.id, date)}
                        title={`${staff.name} - ${date}: クリックして変更`}
                      >
                        <div className="py-1.5 px-1 leading-tight">
                          {cell?.shiftTypeId === 'off'
                            ? requestedOffSet.has(`${staff.id}:${date}`)
                              ? '希望休'
                              : '公休'
                            : shiftType?.label ?? '—'}
                        </div>

                        {/* 編集ドロップダウン */}
                        {isEditing && (
                          <div
                            className="absolute top-full left-0 z-50 bg-white border border-gray-300 rounded shadow-lg min-w-[100px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {config.shiftTypes.map((st) => {
                              // 時短社員に early/late は表示しない
                              if (
                                staff.employmentType === 'short' &&
                                (st.id === 'early' || st.id === 'late')
                              )
                                return null
                              // パートには全シフト表示
                              return (
                                <button
                                  key={st.id}
                                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 border-b border-gray-100 last:border-0"
                                  style={{ backgroundColor: st.color }}
                                  onClick={() =>
                                    handleShiftChange(staff.id, date, st.id)
                                  }
                                >
                                  {st.label}
                                </button>
                              )
                            })}
                            <button
                              className="block w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-100"
                              onClick={() => setEditingCell(null)}
                            >
                              ✕ 閉じる
                            </button>
                          </div>
                        )}
                      </td>
                    )
                  })}
                  {/* 月計 */}
                  <td className="border border-gray-300 bg-gray-50 text-center font-medium px-1 py-1">
                    {countDaysOff(schedule, staff.id, dates)}
                  </td>
                  <td className="border border-gray-300 bg-gray-50 text-center font-medium px-1 py-1">
                    {countWorkDays(schedule, staff.id, dates)}
                  </td>
                </tr>
              ))}

              {/* 日別サマリー行 */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 bg-green-100 px-2 py-1 font-medium sticky left-0 z-10 text-xs">
                  早番(社員)
                </td>
                {dates.map((date) => {
                  const summary = getEmployeeDailySummary(date)
                  const count = summary['early'] ?? 0
                  return (
                    <td
                      key={date}
                      className="border border-gray-300 text-center px-1 py-1 text-xs"
                      style={{ backgroundColor: count > 0 ? '#90EE9066' : undefined }}
                    >
                      {count > 0 ? count : ''}
                    </td>
                  )
                })}
                <td className="border border-gray-300" colSpan={2} />
              </tr>
              <tr className="bg-yellow-50">
                <td className="border border-gray-300 bg-yellow-100 px-2 py-1 font-medium sticky left-0 z-10 text-xs">
                  遅番(社員)
                </td>
                {dates.map((date) => {
                  const summary = getEmployeeDailySummary(date)
                  const count = summary['late'] ?? 0
                  return (
                    <td
                      key={date}
                      className="border border-gray-300 text-center px-1 py-1 text-xs"
                      style={{ backgroundColor: count > 0 ? '#FFD70066' : undefined }}
                    >
                      {count > 0 ? count : ''}
                    </td>
                  )
                })}
                <td className="border border-gray-300" colSpan={2} />
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-300 bg-gray-200 px-2 py-1 font-medium sticky left-0 z-10 text-xs">
                  出勤総数
                </td>
                {dates.map((date) => {
                  const summary = getDailySummary(date)
                  const total = Object.values(summary).reduce((a, b) => a + b, 0)
                  return (
                    <td
                      key={date}
                      className={`border border-gray-300 text-center px-1 py-1 text-xs font-medium ${
                        total < 2 ? 'bg-red-200 text-red-700' : ''
                      }`}
                    >
                      {total}
                    </td>
                  )
                })}
                <td className="border border-gray-300" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 凡例 */}
      {isGenerated && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs no-print">
          {config.shiftTypes.map((st) => {
            if (st.id === 'off') {
              return (
                <>
                  <span
                    key="kibou"
                    className="px-2 py-1 rounded border border-gray-300"
                    style={{ backgroundColor: st.color }}
                  >
                    希望休
                  </span>
                  <span
                    key="koukyuu"
                    className="px-2 py-1 rounded border border-gray-300"
                    style={{ backgroundColor: st.color }}
                  >
                    公休
                  </span>
                </>
              )
            }
            return (
              <span
                key={st.id}
                className="px-2 py-1 rounded border border-gray-300"
                style={{ backgroundColor: st.color }}
              >
                {st.label}
                {st.startTime && ` ${st.startTime}〜${st.endTime}`}
              </span>
            )
          })}
          <span className="px-2 py-1 rounded border-2 border-red-500 text-red-600">
            制約違反
          </span>
        </div>
      )}

      {/* 印刷用タイトル */}
      <div className="hidden print:block mt-2 text-center text-sm text-gray-400">
        {year}年{month}月 シフト表
      </div>
    </div>
  )
}
