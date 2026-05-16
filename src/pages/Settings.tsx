import { useState, useRef } from 'react'
import type { Config, Staff, ShiftType, EmploymentType } from '../types'
import { downloadJson, readJsonFile } from '../utils/excelExport'

interface Props {
  config: Config
  onConfigChange: (config: Config) => void
}

const defaultShiftTypes: ShiftType[] = [
  { id: 'early', label: '早番', startTime: '08:00', endTime: '17:00', color: '#90EE90' },
  { id: 'late', label: '遅番', startTime: '11:00', endTime: '20:00', color: '#FFD700' },
  { id: 'short_early', label: '時短早番', startTime: '08:00', endTime: '15:00', color: '#ADD8E6' },
  { id: 'short_late', label: '時短遅番', startTime: '13:00', endTime: '20:00', color: '#DDA0DD' },
  { id: 'off', label: '休み', startTime: null, endTime: null, color: '#F5F5F5' },
]

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  fulltime: '正社員',
  short: '時短社員',
  part: 'パート',
}

export default function Settings({ config, onConfigChange }: Props) {
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [isAddingStaff, setIsAddingStaff] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ドラッグ＆ドロップ（スタッフ）
  const [dragStaffIdx, setDragStaffIdx] = useState<number | null>(null)
  const [dragOverStaffIdx, setDragOverStaffIdx] = useState<number | null>(null)

  const handleStaffDrop = (toIdx: number) => {
    if (dragStaffIdx === null || dragStaffIdx === toIdx) return
    const arr = [...config.staffs]
    const [item] = arr.splice(dragStaffIdx, 1)
    arr.splice(toIdx, 0, item)
    onConfigChange({ ...config, staffs: arr })
    setDragStaffIdx(null)
    setDragOverStaffIdx(null)
  }

  // ドラッグ＆ドロップ（シフト種別）
  const [dragShiftIdx, setDragShiftIdx] = useState<number | null>(null)
  const [dragOverShiftIdx, setDragOverShiftIdx] = useState<number | null>(null)

  const handleShiftDrop = (toIdx: number) => {
    if (dragShiftIdx === null || dragShiftIdx === toIdx) return
    const arr = [...config.shiftTypes]
    const [item] = arr.splice(dragShiftIdx, 1)
    arr.splice(toIdx, 0, item)
    onConfigChange({ ...config, shiftTypes: arr })
    setDragShiftIdx(null)
    setDragOverShiftIdx(null)
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // スタッフ追加・編集フォームの初期値
  const emptyStaff: Omit<Staff, 'id'> = {
    name: '',
    employmentType: 'fulltime',
    eligibleShifts: ['early', 'late'],
    targetDaysOff: 9,
    kajitaMode: false,
  }

  const [staffForm, setStaffForm] = useState<Omit<Staff, 'id'>>(emptyStaff)

  const handleAddStaff = () => {
    setStaffForm(emptyStaff)
    setIsAddingStaff(true)
    setEditingStaff(null)
  }

  const handleEditStaff = (staff: Staff) => {
    setStaffForm({
      name: staff.name,
      employmentType: staff.employmentType,
      eligibleShifts: [...staff.eligibleShifts],
      targetDaysOff: staff.targetDaysOff,
      kajitaMode: staff.kajitaMode ?? false,
    })
    setEditingStaff(staff)
    setIsAddingStaff(false)
  }

  const handleDeleteStaff = (id: string) => {
    if (!confirm('このスタッフを削除しますか？')) return
    onConfigChange({
      ...config,
      staffs: config.staffs.filter((s) => s.id !== id),
    })
    showMessage('success', 'スタッフを削除しました')
  }

  const handleSaveStaff = () => {
    if (!staffForm.name.trim()) {
      showMessage('error', '氏名を入力してください')
      return
    }
    if (isAddingStaff) {
      const newId = `s${Date.now()}`
      onConfigChange({
        ...config,
        staffs: [...config.staffs, { id: newId, ...staffForm }],
      })
      showMessage('success', 'スタッフを追加しました')
    } else if (editingStaff) {
      onConfigChange({
        ...config,
        staffs: config.staffs.map((s) =>
          s.id === editingStaff.id ? { ...s, ...staffForm } : s,
        ),
      })
      showMessage('success', 'スタッフ情報を更新しました')
    }
    setIsAddingStaff(false)
    setEditingStaff(null)
  }

  const handleCancelEdit = () => {
    setIsAddingStaff(false)
    setEditingStaff(null)
  }

  // 雇用区分変更時に eligibleShifts を自動更新
  const handleEmploymentTypeChange = (type: EmploymentType) => {
    let eligibleShifts: string[]
    if (type === 'fulltime') {
      eligibleShifts = ['early', 'late']
    } else if (type === 'short') {
      eligibleShifts = ['short_early', 'short_late']
    } else {
      eligibleShifts = ['early', 'late']
    }
    setStaffForm((prev) => ({ ...prev, employmentType: type, eligibleShifts }))
  }

  // eligibleShifts のチェックボックス操作
  const handleShiftToggle = (shiftId: string) => {
    setStaffForm((prev) => {
      const has = prev.eligibleShifts.includes(shiftId)
      return {
        ...prev,
        eligibleShifts: has
          ? prev.eligibleShifts.filter((s) => s !== shiftId)
          : [...prev.eligibleShifts, shiftId],
      }
    })
  }

  // シフト種別の編集（種別名の一意性チェックつき）
  const handleShiftTypeChange = (
    id: string,
    field: keyof ShiftType,
    value: string | null,
  ) => {
    if (field === 'label') {
      const duplicate = config.shiftTypes.some(
        (st) => st.id !== id && st.label === value,
      )
      if (duplicate) {
        showMessage('error', `種別名「${value}」はすでに存在します`)
        return
      }
    }
    onConfigChange({
      ...config,
      shiftTypes: config.shiftTypes.map((st) =>
        st.id === id ? { ...st, [field]: value } : st,
      ),
    })
  }

  // シフト種別の削除
  const handleDeleteShiftType = (id: string) => {
    const label = config.shiftTypes.find((s) => s.id === id)?.label
    if (!confirm(`シフト種別「${label}」を削除しますか？\nこの種別が割り当てられているスタッフの入れるシフトからも除外されます。`)) return
    onConfigChange({
      ...config,
      shiftTypes: config.shiftTypes.filter((st) => st.id !== id),
      staffs: config.staffs.map((s) => ({
        ...s,
        eligibleShifts: s.eligibleShifts.filter((sid) => sid !== id),
      })),
    })
    showMessage('success', 'シフト種別を削除しました')
  }

  // シフト種別追加フォームの状態
  const [isAddingShiftType, setIsAddingShiftType] = useState(false)
  const [newShiftType, setNewShiftType] = useState<Omit<ShiftType, 'id'>>({
    label: '',
    startTime: '09:00',
    endTime: '18:00',
    color: '#90EE90',
  })

  const handleAddShiftType = () => {
    const label = newShiftType.label.trim()
    if (!label) {
      showMessage('error', '種別名を入力してください')
      return
    }
    if (config.shiftTypes.some((st) => st.label === label)) {
      showMessage('error', `種別名「${label}」はすでに存在します`)
      return
    }
    const newEntry: ShiftType = { id: `shift_${Date.now()}`, ...newShiftType, label }
    // off の直前に挿入（off は常に末尾）
    const offIdx = config.shiftTypes.findIndex((st) => st.id === 'off')
    const newTypes = [...config.shiftTypes]
    newTypes.splice(offIdx >= 0 ? offIdx : newTypes.length, 0, newEntry)
    onConfigChange({ ...config, shiftTypes: newTypes })
    setIsAddingShiftType(false)
    setNewShiftType({ label: '', startTime: '09:00', endTime: '18:00', color: '#90EE90' })
    showMessage('success', 'シフト種別を追加しました')
  }

  // config.json インポート
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await readJsonFile<Config>(file)
      if (!data.staffs || !data.shiftTypes) {
        showMessage('error', 'config.jsonの形式が正しくありません')
        return
      }
      onConfigChange(data)
      showMessage('success', 'config.jsonを読み込みました')
    } catch {
      showMessage('error', 'ファイルの読み込みに失敗しました')
    }
    e.target.value = ''
  }

  // config.json エクスポート
  const handleExport = () => {
    downloadJson(config, 'config.json')
  }

  const workShiftTypes = config.shiftTypes.filter((st) => st.id !== 'off')

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* タイトル + ボタン */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">設定</h1>
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

      {/* スタッフ管理 */}
      <section className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-gray-700">スタッフ管理</h2>
          <button
            onClick={handleAddStaff}
            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            + スタッフを追加
          </button>
        </div>

        {/* スタッフ追加/編集フォーム */}
        {(isAddingStaff || editingStaff) && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-medium mb-3 text-blue-800">
              {isAddingStaff ? 'スタッフを追加' : 'スタッフを編集'}
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  氏名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={staffForm.name}
                  onChange={(e) =>
                    setStaffForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-400"
                  placeholder="山田 太郎"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  雇用区分
                </label>
                <select
                  value={staffForm.employmentType}
                  onChange={(e) =>
                    handleEmploymentTypeChange(e.target.value as EmploymentType)
                  }
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-400"
                >
                  <option value="fulltime">正社員</option>
                  <option value="short">時短社員</option>
                  <option value="part">パート</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  目標休日数（日/月）
                </label>
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={staffForm.targetDaysOff}
                  onChange={(e) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      targetDaysOff: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  入れるシフト
                </label>
                <div className="flex flex-wrap gap-2">
                  {workShiftTypes.map((st) => (
                    <label key={st.id} className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={staffForm.eligibleShifts.includes(st.id)}
                        onChange={() => handleShiftToggle(st.id)}
                        className="rounded"
                      />
                      {st.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {/* 梶田モード トグル */}
            <div className="flex items-center gap-3 mb-3">
              <button
                type="button"
                onClick={() => setStaffForm((prev) => ({ ...prev, kajitaMode: !prev.kajitaMode }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  staffForm.kajitaMode ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    staffForm.kajitaMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-gray-700">梶田モード</span>
              <div className="relative group">
                <span className="text-gray-400 cursor-help select-none text-sm leading-none">ⓘ</span>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-normal text-center">
                  休みの前日は早番、休みの翌日は遅番に設定されます。
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveStaff}
                className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
              >
                保存
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-4 py-1.5 bg-gray-400 text-white rounded hover:bg-gray-500 text-sm font-medium"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* スタッフ一覧テーブル */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="w-8" />
                <th className="px-4 py-2 text-left font-medium text-gray-600">氏名</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">雇用区分</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">目標休日数</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">入れるシフト</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">梶田モード</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {config.staffs.map((staff, idx) => (
                <tr
                  key={staff.id}
                  draggable
                  onDragStart={() => setDragStaffIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverStaffIdx(idx) }}
                  onDrop={() => handleStaffDrop(idx)}
                  onDragEnd={() => { setDragStaffIdx(null); setDragOverStaffIdx(null) }}
                  className={`transition-colors ${
                    dragStaffIdx === idx
                      ? 'opacity-40 bg-blue-50'
                      : dragOverStaffIdx === idx
                        ? 'bg-blue-100'
                        : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  <td className="pl-2 text-gray-300 hover:text-gray-500 cursor-grab select-none text-base">⠿</td>
                  <td className="px-4 py-2 font-medium">{staff.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        staff.employmentType === 'fulltime'
                          ? 'bg-blue-100 text-blue-700'
                          : staff.employmentType === 'short'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {EMPLOYMENT_LABELS[staff.employmentType]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">{staff.targetDaysOff}日</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {staff.eligibleShifts.map((shiftId) => {
                        const st = config.shiftTypes.find((s) => s.id === shiftId)
                        return st ? (
                          <span
                            key={shiftId}
                            className="px-1.5 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: st.color,
                              border: '1px solid #ddd',
                            }}
                          >
                            {st.label}
                          </span>
                        ) : null
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {staff.kajitaMode ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        ON
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditStaff(staff)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(staff.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {config.staffs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    スタッフが登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* シフト種別設定 */}
      <section className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-gray-700">シフト種別設定</h2>
          <button
            onClick={() => { setIsAddingShiftType(true) }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            + シフト種別を追加
          </button>
        </div>

        {/* 追加フォーム */}
        {isAddingShiftType && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-medium mb-3 text-blue-800">シフト種別を追加</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  種別 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newShiftType.label}
                  onChange={(e) => setNewShiftType((prev) => ({ ...prev, label: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-400"
                  placeholder="例: 夜番"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newShiftType.color}
                    onChange={(e) => setNewShiftType((prev) => ({ ...prev, color: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                  />
                  <span
                    className="px-2 py-0.5 rounded text-xs border border-gray-200"
                    style={{ backgroundColor: newShiftType.color }}
                  >
                    {newShiftType.label || 'プレビュー'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始時刻</label>
                <input
                  type="time"
                  value={newShiftType.startTime ?? ''}
                  onChange={(e) => setNewShiftType((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">終了時刻</label>
                <input
                  type="time"
                  value={newShiftType.endTime ?? ''}
                  onChange={(e) => setNewShiftType((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddShiftType}
                className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
              >
                追加
              </button>
              <button
                onClick={() => { setIsAddingShiftType(false) }}
                className="px-4 py-1.5 bg-gray-400 text-white rounded hover:bg-gray-500 text-sm font-medium"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="w-8" />
                <th className="px-4 py-2 text-left font-medium text-gray-600">種別</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">開始時刻</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">終了時刻</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">色</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {config.shiftTypes.map((st, idx) => (
                <tr
                  key={st.id}
                  draggable
                  onDragStart={() => setDragShiftIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverShiftIdx(idx) }}
                  onDrop={() => handleShiftDrop(idx)}
                  onDragEnd={() => { setDragShiftIdx(null); setDragOverShiftIdx(null) }}
                  className={`transition-colors ${
                    dragShiftIdx === idx
                      ? 'opacity-40 bg-blue-50'
                      : dragOverShiftIdx === idx
                        ? 'bg-blue-100'
                        : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  <td className="pl-2 text-gray-300 hover:text-gray-500 cursor-grab select-none text-base">⠿</td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={st.label}
                      onChange={(e) =>
                        handleShiftTypeChange(st.id, 'label', e.target.value)
                      }
                      disabled={st.id === 'off'}
                      className="w-28 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </td>
                  <td className="px-4 py-2">
                    {st.id !== 'off' ? (
                      <input
                        type="time"
                        value={st.startTime ?? ''}
                        onChange={(e) =>
                          handleShiftTypeChange(st.id, 'startTime', e.target.value)
                        }
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {st.id !== 'off' ? (
                      <input
                        type="time"
                        value={st.endTime ?? ''}
                        onChange={(e) =>
                          handleShiftTypeChange(st.id, 'endTime', e.target.value)
                        }
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={st.color}
                        onChange={(e) =>
                          handleShiftTypeChange(st.id, 'color', e.target.value)
                        }
                        className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                      />
                      <span
                        className="px-2 py-0.5 rounded text-xs border border-gray-200"
                        style={{ backgroundColor: st.color }}
                      >
                        {st.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {st.id !== 'off' ? (
                      <button
                        onClick={() => handleDeleteShiftType(st.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                      >
                        削除
                      </button>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={() =>
            onConfigChange({ ...config, shiftTypes: defaultShiftTypes })
          }
          className="mt-2 px-3 py-1.5 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs"
        >
          デフォルトに戻す
        </button>
      </section>
    </div>
  )
}
