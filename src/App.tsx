import { useState } from 'react'
import type { Config, RequestsData, ScheduleData, Violation, EventsData } from './types'
import Settings from './pages/Settings'
import Requests from './pages/Requests'
import Schedule from './pages/Schedule'
import Events from './pages/Events'

const DEFAULT_CONFIG: Config = {
  staffs: [
    {
      id: 's01',
      name: '山田 太郎',
      employmentType: 'fulltime',
      eligibleShifts: ['early', 'late'],
      targetDaysOff: 9,
    },
    {
      id: 's02',
      name: '鈴木 花子',
      employmentType: 'short',
      eligibleShifts: ['short_early', 'short_late'],
      targetDaysOff: 9,
    },
    {
      id: 'p01',
      name: '田中 一郎',
      employmentType: 'part',
      eligibleShifts: ['early', 'late'],
      targetDaysOff: 0,
    },
  ],
  shiftTypes: [
    {
      id: 'early',
      label: '早番',
      startTime: '08:00',
      endTime: '17:00',
      color: '#90EE90',
    },
    {
      id: 'late',
      label: '遅番',
      startTime: '11:00',
      endTime: '20:00',
      color: '#FFD700',
    },
    {
      id: 'short_early',
      label: '時短早番',
      startTime: '08:00',
      endTime: '15:00',
      color: '#ADD8E6',
    },
    {
      id: 'short_late',
      label: '時短遅番',
      startTime: '13:00',
      endTime: '20:00',
      color: '#DDA0DD',
    },
    {
      id: 'off',
      label: '休み',
      startTime: null,
      endTime: null,
      color: '#F5F5F5',
    },
  ],
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
      <header className="bg-white border-b border-gray-200 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-lg font-bold text-gray-800">
              シフト表自動作成アプリ
            </h1>

            {/* 年月セレクター */}
            <div className="flex items-center gap-2 text-sm">
              <label className="text-gray-600">対象月:</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {Array.from({ length: 5 }, (_, i) => initYear - 1 + i).map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}年
                    </option>
                  ),
                )}
              </select>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* タブ */}
          <nav className="flex -mb-px">
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
            events={events}
            year={year}
            month={month}
            onEventsChange={setEvents}
          />
        )}
        {activeTab === 'schedule' && (
          <Schedule
            config={config}
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
