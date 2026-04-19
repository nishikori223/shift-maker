import { useState, useRef } from 'react'
import type { Config, RequestsData, StaffRequest, EventsData } from '../types'
import { getDatesInMonth } from '../engine/scheduler'
import { downloadJson, readJsonFile } from '../utils/excelExport'

interface Props {
  config: Config
  requests: RequestsData
  events: EventsData
  year: number
  month: number
  onRequestsChange: (requests: RequestsData) => void
}

const MAX_OFF_REQUESTS = 5

export default function Requests({
  config,
  requests,
  events,
  year,
  month,
  onRequestsChange,
}: Props) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    config.staffs[0]?.id ?? '',
  )
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const dates = getDatesInMonth(year, month)

  // 現在のスタッフの希望データ
  const currentRequest: StaffRequest = requests.find(
    (r) => r.staffId === selectedStaffId && r.year === year && r.month === month,
  ) ?? {
    staffId: selectedStaffId,
    year,
    month,
    requests: {},
  }

  const selectedStaff = config.staffs.find((s) => s.id === selectedStaffId)

  // 希望休の数
  const offCount = Object.values(currentRequest.requests).filter(
    (v) => v === 'off',
  ).length

  // セルをクリックしてシフト/休みを設定
  const handleCellClick = (date: string, shiftId: string) => {
    if (!selectedStaff) return

    const current = currentRequest.requests[date]

    // 同じを選んだら解除
    const newValue = current === shiftId ? undefined : shiftId

    // 希望休の上限チェック
    if (newValue === 'off' && shiftId === 'off') {
      const currentOffCount = Object.values(currentRequest.requests).filter(
        (v) => v === 'off',
      ).length
      const wasOff = current === 'off'
      if (!wasOff && currentOffCount >= MAX_OFF_REQUESTS) {
        showMessage('error', `希望休は最大${MAX_OFF_REQUESTS}日までです`)
        return
      }
    }

    const newRequests = { ...currentRequest.requests }
    if (newValue === undefined) {
      delete newRequests[date]
    } else {
      newRequests[date] = newValue
    }

    const newStaffRequest: StaffRequest = {
      ...currentRequest,
      requests: newRequests,
    }

    // requests 全体を更新
    const existingIdx = requests.findIndex(
      (r) => r.staffId === selectedStaffId && r.year === year && r.month === month,
    )
    let newRequestsData: RequestsData
    if (existingIdx >= 0) {
      newRequestsData = requests.map((r, i) =>
        i === existingIdx ? newStaffRequest : r,
      )
    } else {
      newRequestsData = [...requests, newStaffRequest]
    }
    onRequestsChange(newRequestsData)
  }

  // requests.json インポート（同じ staffId+年月のエントリを上書き、他月は保持）
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await readJsonFile<RequestsData>(file)
      if (!Array.isArray(data)) {
        showMessage('error', 'requests.jsonの形式が正しくありません')
        return
      }
      const importedKeys = new Set(data.map((r) => `${r.staffId}:${r.year}:${r.month}`))
      const kept = requests.filter((r) => !importedKeys.has(`${r.staffId}:${r.year}:${r.month}`))
      onRequestsChange([...kept, ...data])
      showMessage('success', `requests.jsonを読み込みました（${data.length}件）`)
    } catch {
      showMessage('error', 'ファイルの読み込みに失敗しました')
    }
    e.target.value = ''
  }

  // エクスポート（対象月の全スタッフ分をまとめて保存）
  const handleExport = () => {
    const mm = String(month).padStart(2, '0')
    const filename = `requests_${year}${mm}.json`
    const targetRequests = requests.filter(
      (r) => r.year === year && r.month === month,
    )
    downloadJson(targetRequests, filename)
  }

  // クリア
  const handleClear = () => {
    if (!confirm(`${selectedStaff?.name}の${year}年${month}月の希望をすべてクリアしますか？`)) return
    const newRequestsData = requests.filter(
      (r) => !(r.staffId === selectedStaffId && r.year === year && r.month === month),
    )
    onRequestsChange(newRequestsData)
    showMessage('success', '希望をクリアしました')
  }

  // カレンダー描画用: 月初の曜日
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
  const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

  // パートスタッフの場合は希望シフトのみ表示（休みボタン非表示）
  const isPart = selectedStaff?.employmentType === 'part'
  const eligibleShifts = selectedStaff?.eligibleShifts ?? []

  // シフト種別マップ
  const shiftTypeMap = new Map(config.shiftTypes.map((s) => [s.id, s]))

  // 日付ごとのイベントマップ
  const mm = String(month).padStart(2, '0')
  const prefix = `${year}-${mm}`
  const eventsByDate = new Map<string, typeof events>()
  for (const evt of events) {
    if (evt.date.startsWith(prefix)) {
      const list = eventsByDate.get(evt.date) ?? []
      list.push(evt)
      eventsByDate.set(evt.date, list)
    }
  }

  // 全スタッフの入力サマリーを計算
  const staffSummaries = config.staffs.map((staff) => {
    const req = requests.find(
      (r) => r.staffId === staff.id && r.year === year && r.month === month,
    )
    const entries = req ? Object.entries(req.requests) : []
    const inputCount = entries.length
    const offDays = entries.filter(([, v]) => v === 'off').length
    const workDays = entries.filter(([, v]) => v !== 'off').length
    const isPart = staff.employmentType === 'part'
    return { staff, inputCount, offDays, workDays, isPart }
  })

  const inputDoneCount = staffSummaries.filter((s) =>
    s.isPart ? s.inputCount > 0 : s.inputCount > 0,
  ).length

  return (
    <div className="p-4 mx-auto">
      {/* メッセージ */}
      {message && (
        <div
          className={`mb-3 px-4 py-2 rounded text-sm ${
            message.type === 'success'
              ? 'bg-green-100 text-green-800 border border-green-300'
              : 'bg-red-100 text-red-800 border border-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* タイトル + ボタン */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">希望入力</h1>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            読込み
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
          >
            ダウンロード
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
          >
            クリア
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {config.staffs.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          先に設定画面でスタッフを登録してください
        </div>
      ) : (
        <>
          {/* スタッフ情報と希望休カウンター */}
          {selectedStaff && (
            <div className="mb-3 p-2.5 bg-blue-50 rounded-lg border border-blue-200 text-sm flex flex-wrap gap-3 items-center">
              <span className="font-medium text-blue-800">{selectedStaff.name}</span>
              {!isPart && (
                <span className="text-blue-700">
                  希望休:{' '}
                  <span className={`font-bold ${offCount >= MAX_OFF_REQUESTS ? 'text-red-600' : 'text-blue-800'}`}>
                    {offCount}
                  </span>
                  /{MAX_OFF_REQUESTS}日
                </span>
              )}
              {isPart && (
                <span className="text-orange-700 text-xs">
                  ※申告した日のみ勤務。申告なし日は自動的に休み
                </span>
              )}
              {/* 凡例 */}
              <div className="flex flex-wrap gap-1.5 text-xs ml-auto">
                {!isPart && (
                  <span className="px-1.5 py-0.5 rounded border border-gray-300" style={{ backgroundColor: '#F5F5F5' }}>
                    希望休
                  </span>
                )}
                {eligibleShifts.map((shiftId) => {
                  const st = shiftTypeMap.get(shiftId)
                  return st ? (
                    <span key={shiftId} className="px-1.5 py-0.5 rounded border border-gray-300" style={{ backgroundColor: st.color }}>
                      {st.label}
                    </span>
                  ) : null
                })}
              </div>
            </div>
          )}

          <div className="flex gap-4 items-start">

            {/* ===== 左サイドバー: 全員サマリー ===== */}
            <div className="w-44 flex-shrink-0 sticky top-4">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-600">入力状況</span>
                  <span className="text-xs text-gray-500">
                    {inputDoneCount}/{config.staffs.length}名
                  </span>
                </div>
                <ul>
                  {staffSummaries.map(({ staff, inputCount, offDays, workDays, isPart: isPartStaff }) => {
                    const isSelected = staff.id === selectedStaffId
                    const hasInput = inputCount > 0
                    const empLabel = staff.employmentType === 'fulltime' ? '正社員' : staff.employmentType === 'short' ? '時短' : 'パート'

                    return (
                      <li key={staff.id}>
                        <button
                          onClick={() => setSelectedStaffId(staff.id)}
                          className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-0 transition-colors ${
                            isSelected
                              ? 'bg-blue-50 border-l-4 border-l-blue-500'
                              : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                          }`}
                        >
                          {/* 名前 + 雇用区分 + チェックを1行に */}
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className={`text-xs font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                              {staff.name}
                            </span>
                            <span className="text-xs text-gray-400 flex-shrink-0">({empLabel})</span>
                            <span className={`text-xs flex-shrink-0 ml-auto ${hasInput ? 'text-green-600' : 'text-gray-300'}`}>
                              {hasInput ? '✓' : '—'}
                            </span>
                          </div>
                          {/* 入力内容 */}
                          {hasInput ? (
                            <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                              {!isPartStaff && offDays > 0 && (
                                <span>休み <span className="font-medium text-gray-700">{offDays}日</span></span>
                              )}
                              {workDays > 0 && (
                                <span>{isPartStaff ? '申告' : '希望'} <span className="font-medium text-gray-700">{workDays}日</span></span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-300">未入力</div>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>

            {/* ===== 右エリア: カレンダー ===== */}
            <div className="flex-1 min-w-0">

            {/* カレンダー */}
            <div className="bg-white rounded-lg border border-gray-200">
              {/* 曜日ヘッダー */}
              <div className="grid grid-cols-7 border-b border-gray-200">
                {DAY_NAMES.map((day, i) => (
                  <div
                    key={day}
                    className={`py-2 text-center text-sm font-medium ${
                      i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* 日付グリッド */}
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="border-b border-r border-gray-100 min-h-[80px]" />
                ))}

                {dates.map((date) => {
                  const d = new Date(date)
                  const dayNum = d.getDate()
                  const dayOfWeek = d.getDay()
                  const req = currentRequest.requests[date]
                  const isColEnd = (firstDayOfWeek + dayNum - 1) % 7 === 6
                  const dayEvents = eventsByDate.get(date) ?? []

                  return (
                    <div
                      key={date}
                      className={`border-b border-r border-gray-100 flex flex-col ${isColEnd ? 'border-r-0' : ''}`}
                    >
                      {/* 上段: 日付 + イベントスロット（最大2件分の固定高さ） */}
                      <div className="px-1 pt-1 pb-1 border-b border-gray-100">
                        <div className={`text-xs font-medium mb-0.5 ${dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
                          {dayNum}
                        </div>
                        <div className="h-[44px] flex flex-col gap-0.5">
                          {dayEvents.slice(0, 2).map((evt) => (
                            <div
                              key={evt.id}
                              className="relative flex-shrink-0"
                              onMouseEnter={() => setOpenEventId(evt.id)}
                              onMouseLeave={() => setOpenEventId(null)}
                            >
                              <div className="text-xs px-1 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 truncate leading-tight cursor-pointer">
                                {evt.name}
                              </div>
                              {openEventId === evt.id && (
                                <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-50">
                                  {evt.startTime}〜{evt.endTime}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 下段: 希望入力ボタン */}
                      <div className="px-1 pt-1 pb-1 flex flex-col gap-0.5">
                        {!isPart && (
                          <button
                            onClick={() => handleCellClick(date, 'off')}
                            className={`text-xs px-1 py-0.5 rounded border transition-all ${
                              req === 'off'
                                ? 'bg-gray-400 text-white border-gray-500'
                                : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                            }`}
                          >
                            休み希望
                          </button>
                        )}
                        {eligibleShifts.map((shiftId) => {
                          const st = shiftTypeMap.get(shiftId)
                          if (!st) return null
                          return (
                            <button
                              key={shiftId}
                              onClick={() => handleCellClick(date, shiftId)}
                              className={`text-xs px-1 py-0.5 rounded border transition-all ${
                                req === shiftId ? 'ring-2 ring-blue-500 font-bold' : 'hover:opacity-80'
                              }`}
                              style={{ backgroundColor: st.color, borderColor: '#ccc' }}
                            >
                              {st.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
