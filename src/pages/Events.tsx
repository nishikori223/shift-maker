import { useState, useRef } from 'react'
import type { CalendarEvent, EventsData } from '../types'
import { downloadJson, readJsonFile } from '../utils/excelExport'

interface Props {
  events: EventsData
  year: number
  month: number
  onEventsChange: (events: EventsData) => void
}

function newId() {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function Events({ events, year, month, onEventsChange }: Props) {
  const defaultDate = `${year}-${String(month).padStart(2, '0')}-01`
  const emptyForm = () => ({ name: '', date: defaultDate, startTime: '', endTime: '' })
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await readJsonFile<EventsData>(file)
      if (!Array.isArray(data)) {
        showMessage('error', 'events.jsonの形式が正しくありません')
        return
      }
      onEventsChange(data)
      showMessage('success', 'events.jsonを読み込みました')
    } catch {
      showMessage('error', 'ファイルの読み込みに失敗しました')
    }
    e.target.value = ''
  }

  const handleExport = () => {
    const mm = String(month).padStart(2, '0')
    downloadJson(events, `events_${year}${mm}.json`)
  }

  // 表示対象月のイベント（日付順）
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const monthEvents = events
    .filter((e) => e.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))

  const handleAdd = () => {
    setError(null)
    if (!form.name.trim()) { setError('イベント名を入力してください'); return }
    if (!form.date) { setError('日付を入力してください'); return }
    if (!form.startTime) { setError('開始時間を入力してください'); return }
    if (!form.endTime) { setError('終了時間を入力してください'); return }
    if (form.endTime <= form.startTime) { setError('終了時間は開始時間より後にしてください'); return }

    const newEvent: CalendarEvent = {
      id: newId(),
      name: form.name.trim(),
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
    }
    onEventsChange([...events, newEvent])
    setForm(emptyForm())
  }

  const handleDelete = (id: string) => {
    onEventsChange(events.filter((e) => e.id !== id))
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">イベント管理</h1>
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
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded text-sm ${
            message.type === 'success'
              ? 'bg-green-100 text-green-800 border border-green-300'
              : 'bg-red-100 text-red-800 border border-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 入力フォーム */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-600 mb-3">新しいイベントを追加</h2>

        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-300 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* イベント名 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">イベント名</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: 全体会議"
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 日付・時間 */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-gray-500 mb-1">日付</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                min={`${year}-${String(month).padStart(2, '0')}-01`}
                max={`${year}-${String(month).padStart(2, '0')}-31`}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">開始時間</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">終了時間</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <button
              onClick={handleAdd}
              className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
            >
              追加
            </button>
          </div>
        </div>
      </div>

      {/* イベント一覧 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-2">
          {year}年{month}月のイベント
          {monthEvents.length > 0 && (
            <span className="ml-2 text-gray-400 font-normal">({monthEvents.length}件)</span>
          )}
        </h2>

        {monthEvents.length === 0 ? (
          <div className="text-center text-gray-400 py-10 border border-dashed border-gray-200 rounded-lg text-sm">
            この月のイベントはまだありません
          </div>
        ) : (
          <ul className="space-y-2">
            {monthEvents.map((evt) => {
              const d = new Date(evt.date)
              const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']
              const dayLabel = `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`
              return (
                <li
                  key={evt.id}
                  className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2.5"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
                  <span className="text-sm text-gray-500 flex-shrink-0 w-24">{dayLabel}</span>
                  <span className="text-sm font-medium text-gray-800 flex-1 truncate">{evt.name}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {evt.startTime}〜{evt.endTime}
                  </span>
                  <button
                    onClick={() => handleDelete(evt.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 text-lg leading-none"
                    title="削除"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
