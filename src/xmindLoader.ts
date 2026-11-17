import type JSZip from 'jszip'
import type { SheetData } from './model/sheet'

export interface LoadedXMind {
  sheets: SheetData[]
}

/** Read modern XMind content without rebuilding or stripping its JSON fields. */
export async function loadFromXMind(zip: JSZip): Promise<LoadedXMind> {
  const content = zip.file('content.json')
  if (!content) {
    if (zip.file('content.xml')) {
      throw new Error('暂不支持旧版 XML 格式的 XMind 文件。')
    }
    throw new Error('无效的 XMind 文件：缺少 content.json。')
  }

  const sheets: unknown = JSON.parse(await content.async('string'))
  if (!Array.isArray(sheets) || sheets.length === 0 || !sheets.every(isSheetData)) {
    throw new Error('无效的 XMind 内容：需要包含主题的工作表数组。')
  }

  return { sheets }
}

function isSheetData(value: unknown): value is SheetData {
  if (!value || typeof value !== 'object') return false
  const sheet = value as Record<string, unknown>
  if (typeof sheet.id !== 'string' || typeof sheet.title !== 'string') return false
  if (!sheet.rootTopic || typeof sheet.rootTopic !== 'object') return false
  const root = sheet.rootTopic as Record<string, unknown>
  return typeof root.id === 'string' && typeof root.title === 'string'
}
