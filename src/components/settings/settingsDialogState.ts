import { create } from 'zustand'
import { useSettings } from '../../services/settings.js'

/** 设置弹窗的分组：通用设置 / 数据管理 */
export type SettingsSection = 'general' | 'data'

/** 设置弹窗：侧边栏底部、没有 API Key 时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
}))

export const openSettings = (section: SettingsSection) =>
  useSettingsDialog.setState({ open: true, section })

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/** 没有 API Key 时打开设置并选中 API Key 所在的「数据管理」，返回是否已有 Key；使用本地模型时无需 Key */
export const ensureApiKey = () => {
  const { apiKey, ollamaModel } = useSettings.getState()
  if (ollamaModel !== null) {
    // 本地模型还没选定（列表加载中、为空或连不上）时回到通用设置
    if (ollamaModel) {
      return true
    }
    openSettings('general')
    return false
  }
  if (apiKey) {
    return true
  }
  openSettings('data')
  return false
}
