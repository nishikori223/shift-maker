import { useState } from 'react'
import logo from './image/logo.png'
import type { Config, RequestsData, ScheduleData, Violation, EventsData } from './types'
import Settings from './pages/Settings'
import Requests from './pages/Requests'
import Schedule from './pages/Schedule'
import Events from './pages/Events'

const DEFAULT_CONFIG: Config = {
  staffs: [],
  shiftTypes: [],
}

type TabId = 'settings' | 'requests' | 'schedule' | 'events'

const TABS: { id: TabId; label: string }[] = [
  { id: 'settings', label: '設定' },
  { id: 'events', label: 'イベント' },
  { id: 'requests', label: '希望入力' },
  { id: 'schedule', label: 'シフト表' },
]

function getCurrentYearMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('settings')
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [requests, setRequests] = useState<RequestsData>([])
  const [events, setEvents] = useState<EventsData>([])
  const [schedule, setSchedule] = useState<ScheduleData | null>(null)
  const [violations, setViolations] = useState<Violation[]>([])
  const [isGenerated, setIsGenerated] = useState(false)

  const { year: initYear, month: initMonth } = getCurrentYearMonth()
  const [year, setYear] = useState(initYear)
  const [month, setMonth] = useState(initMonth)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 shadow-sm no-print relative">
        <div className="max-w-7xl mx-auto px-4">
          {/* ロゴ行 */}
          <div className="flex items-center justify-between h-14">
            {/* 左: アプリ名 */}
            <h1 className="text-lg font-bold text-gray-800">シフト表自動作成アプリ</h1>

            {/* 中央: ロゴ画像 */}
            <div className="absolute left-1/2 -translate-x-1/2">
              <img src={logo} alt="ロゴ" className="h-14 object-contain" />
            </div>

            {/* 右: スペーサー */}
            <div className="w-40" />
          </div>

          {/* タブ + 年月セレクター */}
          <nav className="flex items-center justify-between -mb-px">
            <div className="flex">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm pb-1">
              <label className="text-gray-600">対象月:</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {Array.from({ length: 5 }, (_, i) => initYear - 1 + i).map((y) => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
            </div>
          </nav>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto">
        {activeTab === 'settings' && (
          <Settings config={config} onConfigChange={setConfig} />
        )}
        {activeTab === 'requests' && (
          <Requests
            config={config}
            requests={requests}
            events={events}
            year={year}
            month={month}
            onRequestsChange={setRequests}
          />
        )}
        {activeTab === 'events' && (
          <Events
            config={config}
            events={events}
            year={year}
            month={month}
            onEventsChange={setEvents}
          />
        )}
        {activeTab === 'schedule' && (
          <Schedule
            config={config}
            events={events}
            requests={requests}
            year={year}
            month={month}
            schedule={schedule}
            violations={violations}
            isGenerated={isGenerated}
            onScheduleChange={setSchedule}
            onViolationsChange={setViolations}
            onIsGeneratedChange={setIsGenerated}
          />
        )}
      </main>
    </div>
  )
}
