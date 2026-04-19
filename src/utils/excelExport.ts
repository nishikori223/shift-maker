import * as XLSX from 'xlsx'
import type { Config, RequestsData, ScheduleData } from '../types'
import { getDatesInMonth, countDaysOff, countWorkDays } from '../engine/scheduler'

/**
 * HEX カラーを ARGB 形式に変換（SheetJS用）
 * "#90EE90" → "FF90EE90"
 */
function hexToArgb(hex: string): string {
  const clean = hex.replace('#', '')
  return `FF${clean.toUpperCase()}`
}

/**
 * シフト表を .xlsx ファイルとしてダウンロードする
 */
export function exportToExcel(
  config: Config,
  schedule: ScheduleData,
  requests: RequestsData,
  year: number,
  month: number,
): void {
  const dates = getDatesInMonth(year, month)
  const wb = XLSX.utils.book_new()

  // シフト種別IDからラベル・色を引くマップ
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

  // 日付ヘッダー行を作成
  const headerRow: string[] = ['スタッフ名']
  for (const date of dates) {
    const d = new Date(date)
    const dayNames = ['日', '月', '火', '水', '木', '金', '土']
    const dayNum = d.getDate()
    const dayName = dayNames[d.getDay()]
    headerRow.push(`${dayNum}(${dayName})`)
  }
  headerRow.push('休日数', '勤務日数')

  const rows: string[][] = [headerRow]

  // スタッフごとの行を作成
  for (const staff of config.staffs) {
    const row: string[] = [staff.name]
    for (const date of dates) {
      const cell = schedule[staff.id]?.[date]
      if (!cell || cell.shiftTypeId === null) {
        row.push('')
      } else if (cell.shiftTypeId === 'off') {
        row.push(requestedOffSet.has(`${staff.id}:${date}`) ? '希望休' : '公休')
      } else {
        const st = shiftTypeMap.get(cell.shiftTypeId)
        row.push(st ? st.label : cell.shiftTypeId)
      }
    }
    const offCount = countDaysOff(schedule, staff.id, dates)
    const workCount = countWorkDays(schedule, staff.id, dates)
    row.push(String(offCount), String(workCount))
    rows.push(row)
  }

  // 日別サマリー行：早番人数（社員のみ）
  const earlyRow: string[] = ['早番人数(社員)']
  for (const date of dates) {
    const count = config.staffs
      .filter((s) => s.employmentType !== 'part')
      .filter((s) => {
        const cell = schedule[s.id]?.[date]
        return cell?.shiftTypeId === 'early'
      }).length
    earlyRow.push(String(count))
  }
  earlyRow.push('', '')
  rows.push(earlyRow)

  // 日別サマリー行：遅番人数（社員のみ）
  const lateRow: string[] = ['遅番人数(社員)']
  for (const date of dates) {
    const count = config.staffs
      .filter((s) => s.employmentType !== 'part')
      .filter((s) => {
        const cell = schedule[s.id]?.[date]
        return cell?.shiftTypeId === 'late'
      }).length
    lateRow.push(String(count))
  }
  lateRow.push('', '')
  rows.push(lateRow)

  // 日別サマリー行：出勤総数（全体）
  const totalRow: string[] = ['出勤総数']
  for (const date of dates) {
    const count = config.staffs.filter((s) => {
      const cell = schedule[s.id]?.[date]
      return cell && cell.shiftTypeId !== 'off' && cell.shiftTypeId !== null
    }).length
    totalRow.push(String(count))
  }
  totalRow.push('', '')
  rows.push(totalRow)

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // セルのスタイル（背景色・制約違反のオレンジ）
  // SheetJS Community版はスタイルをサポートしないため、
  // xlsx-style または SheetJS Pro が必要。
  // ここではセル値に色情報を埋め込む形で対応し、
  // 実際の色付けは可能な範囲でコメント化する。

  // 列幅設定
  const colWidths = [{ wch: 14 }] // スタッフ名列
  for (let i = 0; i < dates.length; i++) {
    colWidths.push({ wch: 6 }) // 日付列
  }
  colWidths.push({ wch: 8 }, { wch: 8 }) // 休日数・勤務日数列
  ws['!cols'] = colWidths

  // 行の高さ設定
  const rowHeights = rows.map(() => ({ hpt: 18 }))
  ws['!rows'] = rowHeights

  // シートをブックに追加
  const mmStr = String(month).padStart(2, '0')
  XLSX.utils.book_append_sheet(wb, ws, `${year}年${month}月`)

  // セル背景色を設定（!cellStyles で対応）
  // スタッフ行のシフト種別ごとの色付け
  for (let rowIdx = 1; rowIdx <= config.staffs.length; rowIdx++) {
    const staff = config.staffs[rowIdx - 1]
    for (let colIdx = 1; colIdx <= dates.length; colIdx++) {
      const date = dates[colIdx - 1]
      const cell = schedule[staff.id]?.[date]
      if (!cell || cell.shiftTypeId === null) continue

      const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
      const shiftType = shiftTypeMap.get(cell.shiftTypeId)

      if (!ws[cellRef]) {
        ws[cellRef] = { t: 's', v: '' }
      }

      // 制約違反はオレンジ背景
      const bgColor = cell.isViolation
        ? 'FFFFA500'
        : shiftType
          ? hexToArgb(shiftType.color)
          : 'FFFFFFFF'

      ws[cellRef].s = {
        fill: {
          patternType: 'solid',
          fgColor: { rgb: bgColor },
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center',
        },
        border: {
          top: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
        },
      }
    }
  }

  // ヘッダー行のスタイル
  for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx })
    if (!ws[cellRef]) {
      ws[cellRef] = { t: 's', v: '' }
    }
    ws[cellRef].s = {
      fill: {
        patternType: 'solid',
        fgColor: { rgb: 'FF4472C4' },
      },
      font: {
        color: { rgb: 'FFFFFFFF' },
        bold: true,
      },
      alignment: {
        horizontal: 'center',
        vertical: 'center',
      },
    }
  }

  // ダウンロード
  XLSX.writeFile(wb, `shift_${year}${mmStr}.xlsx`, {
    bookType: 'xlsx',
    type: 'binary',
  })
}

/**
 * JSONデータをダウンロードする汎用関数
 */
export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * JSONファイルを読み込む汎用関数
 */
export function readJsonFile<T>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as T
        resolve(data)
      } catch {
        reject(new Error('JSONの解析に失敗しました'))
      }
    }
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
    reader.readAsText(file)
  })
}
