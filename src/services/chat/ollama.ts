import type { Base64ImageBlockParam, MessageParam, OllamaMessageRequest } from '../api/types.js'
import { ApiError } from '../api/client.js'
import { resizeUploadImage } from '../../utils/resizeUploadImage.js'
import * as db from './db.js'
import type { FileAttachment } from './types.js'

/** Ollama 要求显式给出 max_tokens */
const MAX_TOKENS = 8192
/** 开启深度思考时的思考预算 */
const THINKING_BUDGET_TOKENS = 4096

const readBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** 读取本地原件，生成内联 base64 图片；原件不存在（如导入的历史）的图片不进入请求。 */
export const loadInlineImages = async (
  files: FileAttachment[],
  signal: AbortSignal,
  /** 本轮提问的附件：解码失败时直接报错，不能让模型在缺图的情况下回答 */
  requiredIds: Set<string> = new Set()
): Promise<Map<string, Base64ImageBlockParam>> => {
  const images = new Map<string, Base64ImageBlockParam>()
  for (const file of files) {
    if (!file.isImage || images.has(file.id)) {
      continue
    }
    const blob = await db.loadFile(file.id)
    if (!blob) {
      continue
    }
    try {
      const resized = await resizeUploadImage(
        blob instanceof File ? blob : new File([blob], file.name, { type: blob.type }),
        signal
      )
      images.set(file.id, {
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.mimeType || resized.type || 'image/png',
          data: await readBase64(resized),
        },
      })
    } catch {
      // 中止照常抛出；历史图片解码失败时跳过，不阻断整轮对话
      signal.throwIfAborted()
      if (requiredIds.has(file.id)) {
        throw new ApiError('protocol', {
          key: 'ollamaImageUnreadable',
          params: { name: file.name },
        })
      }
    }
  }
  return images
}

/**
 * 把 DeepSeek 格式的消息裁剪为 Ollama 能接受的内容：
 * 去掉 latest_reminder 角色，助手消息只保留文本（思考块、搜索与阅读链接块不回传），
 * 裁剪后内容为空的助手消息整条省略。
 */
export const toOllamaMessages = (messages: MessageParam[]): OllamaMessageRequest['messages'] =>
  messages.flatMap((message): OllamaMessageRequest['messages'] => {
    if (message.role === 'latest_reminder') {
      return []
    }
    if (message.role === 'user') {
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content.filter(
              (block) => block.type === 'text' || block.source.type === 'base64'
            )
      return [
        {
          role: 'user',
          content: content as OllamaMessageRequest['messages'][number]['content'],
        },
      ]
    }
    const content = message.content.flatMap((block) =>
      block.type === 'text' && block.text ? [{ type: 'text' as const, text: block.text }] : []
    )
    return content.length > 0 ? [{ role: 'assistant', content }] : []
  })

export const createOllamaRequest = (
  model: string,
  messages: MessageParam[],
  thinking: boolean
): OllamaMessageRequest => ({
  model,
  messages: toOllamaMessages(messages),
  max_tokens: MAX_TOKENS,
  // 关闭时也要显式声明：默认带思考的模型在省略该字段时仍会思考
  thinking: thinking
    ? { type: 'enabled', budget_tokens: THINKING_BUDGET_TOKENS }
    : { type: 'disabled' },
})

/** 没有服务端生成标题时，取首条提问的前若干字符 */
export const localTitle = (text: string, fallback: string) =>
  (text.trim().replace(/\s+/g, ' ') || fallback).slice(0, 30)
