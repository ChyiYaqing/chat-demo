import { useCallback, useEffect, useState } from 'react'
import { listOllamaModels } from '../../services/api/client.js'
import { setOllamaModel, setOllamaUrl, useSettings } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Select } from '../base/Select.js'
import styles from './Settings.module.css'

/** Ollama 地址与本机模型选择；打开时及地址变化后拉取 /api/tags，没有已选模型时自动选第一个 */
export const OllamaSetting = () => {
  const t = useTranslate()
  const url = useSettings((state) => state.ollamaUrl)
  const model = useSettings((state) => state.ollamaModel)
  const [draftUrl, setDraftUrl] = useState(url)
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState<'connect' | 'empty' | null>(null)

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const names = await listOllamaModels(url, signal)
        setModels(names)
        setError(names.length === 0 ? 'empty' : null)
        if (names.length > 0 && !names.includes(useSettings.getState().ollamaModel ?? '')) {
          setOllamaModel(names[0])
        }
      } catch {
        if (!signal?.aborted) {
          setModels([])
          setError('connect')
        }
      }
    },
    [url]
  )

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  const commitUrl = () => {
    setOllamaUrl(draftUrl)
    setDraftUrl(useSettings.getState().ollamaUrl)
  }

  return (
    <>
      <div className={styles.cell}>
        <div className={styles.label}>{t('ollamaUrl')}</div>
        <div className={styles.apiKeyInput}>
          <input
            type="url"
            autoComplete="off"
            spellCheck={false}
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            onBlur={commitUrl}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                commitUrl()
              }
            }}
          />
        </div>
      </div>
      <div className={styles.cell}>
        <div className={styles.label}>{t('ollamaModel')}</div>
        <div className={styles.description}>
          {error === 'connect'
            ? t('ollamaConnectFailed')
            : error === 'empty'
              ? t('ollamaNoModels')
              : t('ollamaHint')}
        </div>
        <Select
          ariaLabel={t('ollamaModel')}
          value={model ?? ''}
          placeholder={t('ollamaModelPlaceholder')}
          options={models.map((name) => ({ value: name, label: name }))}
          onChange={setOllamaModel}
          disabled={models.length === 0}
        />
        <Button variant="outlined" size="m" onClick={() => void refresh()}>
          {t('ollamaRefresh')}
        </Button>
      </div>
    </>
  )
}
