import type { Config, ScheduleData, EventsData } from '../types'

interface Props {
  date: string
  config: Config
  schedule: ScheduleData
  events: EventsData
  onClose: () => void
}

const TIME_START_MIN = 8 * 60
const TIME_END_MIN   = 20 * 60
const SLOT_MIN       = 30
const SLOT_COUNT     = (TIME_END_MIN - TIME_START_MIN) / SLOT_MIN  // 24

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function parseMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function slotFilled(idx: number, startMin: number, endMin: number): boolean {
  const s = TIME_START_MIN + idx * SLOT_MIN
  return startMin < s + SLOT_MIN && endMin > s
}

function slotLabel(idx: number): string {
  const t = TIME_START_MIN + idx * SLOT_MIN
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export default function DayTimetable({ date, config, schedule, events, onClose }: Props) {
  const d = new Date(date)
  const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日(${DAY_NAMES[d.getDay()]})`

  const shiftTypeMap = new Map(config.shiftTypes.map((s) => [s.id, s]))
  const staffMap     = new Map(config.staffs.map((s) => [s.id, s]))

  const dayEvents = events.filter((e) => e.date === date)

  const workingStaffs = config.staffs.filter((staff) => {
    const cell = schedule[staff.id]?.[date]
    if (!cell?.shiftTypeId || cell.shiftTypeId === 'off') return false
    const st = shiftTypeMap.get(cell.shiftTypeId)
    return st?.startTime && st?.endTime
  })

  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i)
  // +1 for the label column
  const colSpan = SLOT_COUNT + 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-800">{dateLabel} タイムテーブル</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* コンテンツ */}
        <div className="overflow-auto p-4">
          {workingStaffs.length === 0 && dayEvents.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-sm">
              この日は勤務スタッフもイベントもありません
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table
                  className="border-collapse text-xs"
                  style={{ minWidth: `${160 + SLOT_COUNT * 28}px` }}
                >
                  <thead>
                    <tr>
                      <th className="border border-gray-200 bg-gray-100 px-3 py-1.5 text-left min-w-[160px] sticky left-0 z-10 text-gray-600">
                        名前
                      </th>
                      {slots.map((i) => (
                        <th
                          key={i}
                          className={`border border-gray-200 text-center py-1.5 w-7 ${
                            i % 2 === 0 ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-transparent'
                          }`}
                        >
                          {i % 2 === 0 ? slotLabel(i) : '·'}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {/* ── イベントセクション ── */}
                    {dayEvents.length > 0 && (
                      <>
                        <tr>
                          <td
                            colSpan={colSpan}
                            className="bg-violet-600 text-white font-semibold px-3 py-1 border-y border-violet-700 text-xs tracking-wide"
                          >
                            イベント
                          </td>
                        </tr>

                        {dayEvents.map((evt) => {
                          const startMin = parseMin(evt.startTime)
                          const endMin   = parseMin(evt.endTime)
                          const requiredNames = (evt.requiredStaffIds ?? [])
                            .map((id) => staffMap.get(id)?.name)
                            .filter(Boolean) as string[]

                          return (
                            <tr key={evt.id} className="hover:bg-violet-50">
                              <td className="border border-gray-200 bg-white px-3 py-2 sticky left-0 z-10">
                                <div className="font-medium text-gray-800">{evt.name}</div>
                                <div className="text-violet-500 mt-0.5">{evt.startTime}〜{evt.endTime}</div>
                                {requiredNames.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {requiredNames.map((name) => (
                                      <span
                                        key={name}
                                        className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded border border-violet-200 leading-tight"
                                      >
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              {slots.map((i) => (
                                <td
                                  key={i}
                                  className="border border-gray-200 w-7"
                                  style={{ backgroundColor: slotFilled(i, startMin, endMin) ? '#c4b5fd' : undefined }}
                                  title={slotFilled(i, startMin, endMin) ? `${evt.name} ${evt.startTime}〜${evt.endTime}` : undefined}
                                />
                              ))}
                            </tr>
                          )
                        })}
                      </>
                    )}

                    {/* ── セクション区切り（スタッフ） ── */}
                    {workingStaffs.length > 0 && (
                      <tr>
                        <td
                          colSpan={colSpan}
                          className={`bg-gray-200 text-gray-600 font-semibold px-3 py-1 text-xs tracking-wide ${
                            dayEvents.length > 0 ? 'border-t-4 border-t-gray-400' : 'border-y border-gray-300'
                          }`}
                        >
                          スタッフ
                        </td>
                      </tr>
                    )}

                    {/* ── スタッフ行 ── */}
                    {workingStaffs.map((staff) => {
                      const cell     = schedule[staff.id]?.[date]!
                      const st       = shiftTypeMap.get(cell.shiftTypeId!)!
                      const startMin = parseMin(st.startTime!)
                      const endMin   = parseMin(st.endTime!)

                      return (
                        <tr key={staff.id} className="hover:bg-gray-50">
                          <td className="border border-gray-200 bg-white px-3 py-2 sticky left-0 z-10 whitespace-nowrap">
                            <div className="font-medium text-gray-800">{staff.name}</div>
                            <div className="text-gray-400">{st.label}　{st.startTime}〜{st.endTime}</div>
                          </td>
                          {slots.map((i) => (
                            <td
                              key={i}
                              className="border border-gray-200 w-7 h-9"
                              style={{ backgroundColor: slotFilled(i, startMin, endMin) ? st.color : undefined }}
                              title={slotFilled(i, startMin, endMin) ? `${staff.name} ${st.startTime}〜${st.endTime}` : undefined}
                            />
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* 凡例 */}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                {dayEvents.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm border border-violet-400" style={{ backgroundColor: '#c4b5fd' }} />
                    イベント
                  </span>
                )}
                {workingStaffs.map((staff) => {
                  const st = shiftTypeMap.get(schedule[staff.id]?.[date]?.shiftTypeId ?? '')
                  return st ? (
                    <span key={staff.id} className="flex items-center gap-1">
                      <span
                        className="inline-block w-3 h-3 rounded-sm border border-gray-300"
                        style={{ backgroundColor: st.color }}
                      />
                      {staff.name}
                    </span>
                  ) : null
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
