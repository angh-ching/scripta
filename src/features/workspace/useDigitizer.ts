import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { ApiError, OcrStreamEvent } from '../../../shared/contracts'
import { apiError } from '../../../shared/contracts'
import { ApiRequestError, isAbortError, streamOcrRequest, streamTranslationRequest } from '../../lib/api'
import { createSampleFile, prepareImage } from '../../lib/image'
import type { SourcePage, StoredNote } from './types'
import { createNoteState, workspaceReducer } from './reducer'
import { documentLanguage } from './selectors'

const MAX_PAGES = 20
const MAX_CONCURRENT_OCR = 2

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiRequestError) return error.apiError
  if (error instanceof Error) {
    return apiError('INTERNAL', error.message, true)
  }
  return apiError('INTERNAL', 'Something went wrong. Try again.', true)
}

export interface AddFilesResult {
  added: number
  errors: string[]
}

export function useDigitizer() {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createNoteState)
  const queueRef = useRef<SourcePage[]>([])
  const controllersRef = useRef(new Map<string, AbortController>())
  const drainingRef = useRef(false)
  const pagesRef = useRef(state.pages)
  const translationControllerRef = useRef<AbortController | null>(null)
  const translationTargetRef = useRef<string | null>(null)

  useEffect(() => {
    pagesRef.current = state.pages
  }, [state.pages])

  const processPage = useCallback(async (page: SourcePage) => {
    const controller = new AbortController()
    controllersRef.current.set(page.id, controller)
    dispatch({ type: 'PAGE_START', pageId: page.id })

    let terminal = false
    try {
      await streamOcrRequest({
        image: page.blob,
        pageId: page.id,
        signal: controller.signal,
        onEvent: (event: OcrStreamEvent) => {
          switch (event.type) {
            case 'block':
              dispatch({ type: 'PAGE_BLOCK', pageId: page.id, block: event.block })
              break
            case 'warning':
              dispatch({ type: 'PAGE_WARNING', pageId: page.id, message: event.message })
              break
            case 'done':
              terminal = true
              dispatch({
                type: 'PAGE_DONE',
                pageId: page.id,
                blocks: event.page.blocks,
                detectedLanguage: event.page.detectedLanguage,
                warnings: event.page.warnings,
                title: event.page.title,
                meta: event.meta,
              })
              break
            case 'error':
              terminal = true
              dispatch({ type: 'PAGE_ERROR', pageId: page.id, error: event.error })
              break
            case 'start':
              break
          }
        },
      })
      if (!terminal && !controller.signal.aborted) {
        dispatch({
          type: 'PAGE_ERROR',
          pageId: page.id,
          error: apiError('BAD_MODEL_OUTPUT', 'The page ended before it was finished. Try again.', true),
        })
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return
      dispatch({ type: 'PAGE_ERROR', pageId: page.id, error: toApiError(error) })
    } finally {
      controllersRef.current.delete(page.id)
    }
  }, [])

  const startQueue = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const worker = async () => {
          while (true) {
            const page = queueRef.current.shift()
            if (!page) return
            await processPage(page)
          }
        }
        await Promise.all(Array.from({ length: MAX_CONCURRENT_OCR }, () => worker()))
      }
    } finally {
      drainingRef.current = false
    }
    if (queueRef.current.length > 0) void startQueue()
  }, [processPage])

  const addFiles = useCallback(
    async (input: File[] | FileList): Promise<AddFilesResult> => {
      const files = Array.from(input)
      if (files.length === 0) return { added: 0, errors: [] }

      const capacity = MAX_PAGES - pagesRef.current.length - queueRef.current.length
      const accepted = files.slice(0, Math.max(0, capacity))
      const errors: string[] = []
      if (files.length > accepted.length) {
        errors.push(`A note can include up to ${MAX_PAGES} pages.`)
      }

      const prepared = await Promise.allSettled(accepted.map((file) => prepareImage(file)))
      const pages = prepared.flatMap((result, index) => {
        if (result.status === 'rejected') {
          const file = accepted[index]
          errors.push(
            `${file?.name ?? 'Image'}: ${
              result.reason instanceof Error ? result.reason.message : 'could not be read'
            }`,
          )
          return []
        }
        const image = result.value
        return [
          queuePage({
            id: `p${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`,
            name: image.name,
            blob: image.blob,
            previewUrl: image.previewUrl,
            width: image.width,
            height: image.height,
          }),
        ]
      })

      if (pages.length > 0) {
        pagesRef.current = [...pagesRef.current, ...pages]
        dispatch({ type: 'ADD_PAGES', pages })
        queueRef.current.push(...pages)
        void startQueue()
      }

      return { added: pages.length, errors }
    },
    [startQueue],
  )

  const addSample = useCallback(async (): Promise<AddFilesResult> => {
    try {
      const file = await createSampleFile()
      return await addFiles([file])
    } catch (error) {
      return {
        added: 0,
        errors: [error instanceof Error ? error.message : 'The sample could not be created.'],
      }
    }
  }, [addFiles])

  const retryPage = useCallback(
    (pageId: string) => {
      const page = pagesRef.current.find((item) => item.id === pageId)
      if (!page) return
      controllersRef.current.get(pageId)?.abort()
      dispatch({ type: 'RESET_PAGE', pageId })
      queueRef.current.push(page)
      void startQueue()
    },
    [startQueue],
  )

  const removePage = useCallback((pageId: string) => {
    const page = pagesRef.current.find((item) => item.id === pageId)
    controllersRef.current.get(pageId)?.abort()
    controllersRef.current.delete(pageId)
    queueRef.current = queueRef.current.filter((item) => item.id !== pageId)
    if (page) URL.revokeObjectURL(page.previewUrl)
    dispatch({ type: 'REMOVE_PAGE', pageId })
  }, [])

  const abortTranslation = useCallback(() => {
    translationControllerRef.current?.abort()
    translationControllerRef.current = null
    translationTargetRef.current = null
  }, [])

  const stopEverything = useCallback(() => {
    queueRef.current = []
    for (const controller of controllersRef.current.values()) controller.abort()
    controllersRef.current.clear()
    abortTranslation()
  }, [abortTranslation])

  const cancelTranslation = useCallback(() => {
    abortTranslation()
    dispatch({
      type: 'TRANSLATION_ERROR',
      error: apiError('INTERNAL', 'Translation stopped before it finished.', true),
    })
  }, [abortTranslation])

  const reset = useCallback(() => {
    stopEverything()
    for (const page of pagesRef.current) URL.revokeObjectURL(page.previewUrl)
    dispatch({ type: 'RESET', note: createNoteState() })
  }, [stopEverything])

  const loadNote = useCallback(
    (record: StoredNote) => {
      stopEverything()
      for (const page of pagesRef.current) URL.revokeObjectURL(page.previewUrl)

      const pages = record.pages.map((page) => ({
        ...page,
        status: 'done' as const,
        previewUrl: URL.createObjectURL(page.blob),
        error: null,
      }))
      const note = createNoteState()
      dispatch({
        type: 'LOAD_NOTE',
        note: {
          ...note,
          id: record.id,
          title: record.title,
          titleTouched: true,
          createdAt: record.createdAt,
          pages,
          activePageId: pages[0]?.id ?? null,
          targetLang: record.targetLang,
          translation: record.translation,
          reviewed: record.reviewed,
        },
      })
    },
    [stopEverything],
  )

  const setTargetLang = useCallback(
    (targetLang: string) => {
      abortTranslation()
      dispatch({ type: 'SET_TARGET_LANG', targetLang })
    },
    [abortTranslation],
  )

  const translate = useCallback(async () => {
    const blocks = state.pages.flatMap((page) =>
      page.blocks
        .filter((block) => block.text.trim().length > 0)
        .map((block) => ({ id: block.id, text: block.text })),
    )
    if (blocks.length === 0) return

    abortTranslation()
    const controller = new AbortController()
    translationControllerRef.current = controller
    translationTargetRef.current = state.targetLang
    dispatch({ type: 'TRANSLATION_START', targetLang: state.targetLang })

    const language = documentLanguage(state)
    const source = language && !language.mixed ? language.code : 'auto'
    let terminal = false

    try {
      await streamTranslationRequest({
        source,
        target: state.targetLang,
        blocks,
        signal: controller.signal,
        onEvent: (event) => {
          if (translationTargetRef.current !== state.targetLang) return
          if (event.type === 'block') {
            dispatch({ type: 'TRANSLATION_BLOCK', blockId: event.block.id, text: event.block.text })
          } else if (event.type === 'done') {
            terminal = true
            dispatch({ type: 'TRANSLATION_DONE', blocks: event.blocks, meta: event.meta })
          } else if (event.type === 'error') {
            terminal = true
            dispatch({ type: 'TRANSLATION_ERROR', error: event.error })
          }
        },
      })
      if (!terminal && !controller.signal.aborted) {
        dispatch({
          type: 'TRANSLATION_ERROR',
          error: apiError('BAD_MODEL_OUTPUT', 'Translation ended early. Try again.', true),
        })
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return
      dispatch({ type: 'TRANSLATION_ERROR', error: toApiError(error) })
    } finally {
      if (translationControllerRef.current === controller) {
        translationControllerRef.current = null
        translationTargetRef.current = null
      }
    }
  }, [abortTranslation, state])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      )
      if (files.length === 0) return
      event.preventDefault()
      void addFiles(files)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addFiles])

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- abort whatever is in flight at unmount
      for (const controller of controllersRef.current.values()) controller.abort()
      translationControllerRef.current?.abort()
      for (const page of pagesRef.current) URL.revokeObjectURL(page.previewUrl)
    }
  }, [])

  return {
    state,
    dispatch,
    addFiles,
    addSample,
    retryPage,
    removePage,
    reset,
    loadNote,
    translate,
    cancelTranslation,
    setTargetLang,
  }
}

function queuePage(input: {
  id: string
  name: string
  blob: Blob
  previewUrl: string
  width: number
  height: number
}) {
  return {
    ...input,
    status: 'queued' as const,
    blocks: [],
    detectedLanguage: null,
    warnings: [],
    meta: null,
    error: null,
  }
}
