import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'pomodoro_tasks_v1'
const FLOATING_WINDOW_WIDTH = 220
const FLOATING_WINDOW_HEIGHT = 170

function parsePositiveInteger(value, options = {}) {
  const { allowEmpty = false } = options
  const normalized = String(value ?? '').trim()
  if (!normalized) return allowEmpty ? undefined : null
  if (!/^\d+$/.test(normalized)) return null

  const numeric = Number(normalized)
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return null
  return numeric
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds)
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function createTask(title, durationMin) {
  const durationSec = durationMin * 60
  return {
    id: crypto.randomUUID(),
    title,
    durationSec,
    remainingSec: durationSec,
    status: 'idle',
  }
}

function clampFloatingPosition(x, y) {
  const maxX = Math.max(0, window.innerWidth - FLOATING_WINDOW_WIDTH)
  const maxY = Math.max(0, window.innerHeight - FLOATING_WINDOW_HEIGHT)

  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  }
}

function getDefaultFloatingPosition() {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 }
  }

  return {
    x: Math.max(0, window.innerWidth - FLOATING_WINDOW_WIDTH - 20),
    y: Math.max(0, window.innerHeight - FLOATING_WINDOW_HEIGHT - 20),
  }
}

function getInitialAppState() {
  const fallback = {
    tasks: [],
    activeTaskId: null,
    isFloatingVisible: true,
    floatingPosition: getDefaultFloatingPosition(),
    breakMin: 5,
    phase: 'idle',
    isOrchestrationRunning: false,
    currentTaskIndex: 0,
    breakRemainingSec: 0,
  }

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.tasks)) return fallback

    const restoredTasks = parsed.tasks.map((task) => ({
      ...task,
      status: task.status === 'running' ? 'paused' : task.status,
    }))

    return {
      ...fallback,
      tasks: restoredTasks,
      activeTaskId: parsed.activeTaskId ?? null,
      isFloatingVisible: parsed.isFloatingVisible ?? true,
      floatingPosition: parsed.floatingPosition
        ? clampFloatingPosition(
            parsed.floatingPosition.x ?? 0,
            parsed.floatingPosition.y ?? 0,
          )
        : fallback.floatingPosition,
      breakMin: parsePositiveInteger(parsed.breakMin) ?? 5,
      phase: parsed.phase ?? 'idle',
      isOrchestrationRunning: false,
      currentTaskIndex: parsed.currentTaskIndex ?? 0,
      breakRemainingSec: parsed.breakRemainingSec ?? 0,
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return fallback
  }
}

let cachedInitialAppState = null

function getCachedInitialAppState() {
  if (cachedInitialAppState === null) {
    cachedInitialAppState = getInitialAppState()
  }
  return cachedInitialAppState
}

function moveTask(list, fromIndex, toIndex) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= list.length ||
    toIndex < 0 ||
    toIndex > list.length
  ) {
    return list
  }

  const next = [...list]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function App() {
  const [title, setTitle] = useState('')
  const [durationMin, setDurationMin] = useState(25)
  const [insertPositionInput, setInsertPositionInput] = useState('')
  const [tasks, setTasks] = useState(() => getCachedInitialAppState().tasks)
  const [activeTaskId, setActiveTaskId] = useState(
    () => getCachedInitialAppState().activeTaskId,
  )
  const [isFloatingVisible, setIsFloatingVisible] = useState(
    () => getCachedInitialAppState().isFloatingVisible,
  )
  const [floatingPosition, setFloatingPosition] = useState(
    () => getCachedInitialAppState().floatingPosition,
  )
  const [breakMin, setBreakMin] = useState(
    () => String(getCachedInitialAppState().breakMin),
  )
  const [phase, setPhase] = useState(() => getCachedInitialAppState().phase)
  const [isOrchestrationRunning, setIsOrchestrationRunning] = useState(
    () => getCachedInitialAppState().isOrchestrationRunning,
  )
  const [currentTaskIndex, setCurrentTaskIndex] = useState(
    () => getCachedInitialAppState().currentTaskIndex,
  )
  const [breakRemainingSec, setBreakRemainingSec] = useState(
    () => getCachedInitialAppState().breakRemainingSec,
  )
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [dropIndicator, setDropIndicator] = useState(null)
  const [reorderNotice, setReorderNotice] = useState('')
  const [isFocusFullscreen, setIsFocusFullscreen] = useState(false)
  const [isFullscreenExitConfirmVisible, setIsFullscreenExitConfirmVisible] =
    useState(false)
  const isFullscreenActive = isFocusFullscreen && phase !== 'idle'
  const intervalRef = useRef(null)
  const dragRef = useRef({ isDragging: false, offsetX: 0, offsetY: 0 })
  const taskReorderRef = useRef({
    sourceTaskId: null,
    targetTaskId: null,
    placement: 'before',
  })
  const breakMinutes = useMemo(() => parsePositiveInteger(breakMin), [breakMin])
  const focusMinutes = useMemo(
    () => parsePositiveInteger(durationMin),
    [durationMin],
  )
  const parsedInsertPosition = useMemo(
    () => parsePositiveInteger(insertPositionInput, { allowEmpty: true }),
    [insertPositionInput],
  )
  const breakInputError =
    breakMin.trim() === ''
      ? '请输入休息时长（正整数分钟）。'
      : breakMinutes === null
        ? '休息时长仅支持正整数，不能为负数或小数。'
        : ''

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tasks,
        activeTaskId,
        isFloatingVisible,
        floatingPosition,
        breakMin,
        phase,
        isOrchestrationRunning,
        currentTaskIndex,
        breakRemainingSec,
      }),
    )
  }, [
    tasks,
    activeTaskId,
    isFloatingVisible,
    floatingPosition,
    breakMin,
    phase,
    isOrchestrationRunning,
    currentTaskIndex,
    breakRemainingSec,
  ])

  useEffect(() => {
    clearInterval(intervalRef.current)
    intervalRef.current = null

    const shouldRunManualFocus =
      !isOrchestrationRunning &&
      phase === 'focus' &&
      !!activeTaskId &&
      tasks.some((task) => task.id === activeTaskId && task.status === 'running')

    const shouldRunOrchestrationFocus =
      isOrchestrationRunning &&
      phase === 'focus' &&
      !!activeTaskId &&
      tasks.some((task) => task.id === activeTaskId && task.status === 'running')

    if (shouldRunManualFocus || shouldRunOrchestrationFocus) {
      intervalRef.current = setInterval(() => {
        setTasks((prevTasks) => {
          const target = prevTasks.find((task) => task.id === activeTaskId)
          if (!target || target.status !== 'running') return prevTasks

          if (target.remainingSec <= 1) {
            const finalizedTasks = prevTasks.map((task) =>
              task.id === activeTaskId
                ? { ...task, remainingSec: 0, status: 'done' }
                : task,
            )

            if (!isOrchestrationRunning) {
              setActiveTaskId(null)
              setPhase('idle')
              return finalizedTasks
            }

            const finishedIndex = prevTasks.findIndex(
              (task) => task.id === activeTaskId,
            )
            const hasNextTask = finishedIndex >= 0 && finishedIndex + 1 < prevTasks.length

            if (!hasNextTask) {
              setIsOrchestrationRunning(false)
              setPhase('idle')
              setActiveTaskId(null)
              setBreakRemainingSec(0)
              return finalizedTasks
            }

            if (breakMinutes === null) {
              setIsOrchestrationRunning(false)
              setPhase('idle')
              setActiveTaskId(null)
              setBreakRemainingSec(0)
              setReorderNotice('休息时长格式无效，请输入正整数分钟后再开始编排。')
              return finalizedTasks
            }

            setCurrentTaskIndex(finishedIndex)
            setPhase('break')
            setBreakRemainingSec(breakMinutes * 60)
            setActiveTaskId(null)
            return finalizedTasks
          }

          return prevTasks.map((task) =>
            task.id === activeTaskId
              ? { ...task, remainingSec: task.remainingSec - 1 }
              : task,
          )
        })
      }, 1000)

      return () => {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    if (phase === 'break' && isOrchestrationRunning) {
      if (breakRemainingSec <= 0) return

      intervalRef.current = setInterval(() => {
        setBreakRemainingSec((prev) => {
          if (prev <= 1) {
            const nextIndex = currentTaskIndex + 1
            const nextTask = tasks[nextIndex]

            if (!nextTask) {
              setIsOrchestrationRunning(false)
              setPhase('idle')
              setActiveTaskId(null)
              return 0
            }

            setCurrentTaskIndex(nextIndex)
            setActiveTaskId(nextTask.id)
            setPhase('focus')
            setTasks((prevTasks) =>
              prevTasks.map((task) => {
                if (task.id === nextTask.id) return { ...task, status: 'running' }
                if (task.status === 'running') return { ...task, status: 'paused' }
                return task
              }),
            )

            return 0
          }

          return Math.max(0, prev - 1)
        })
      }, 1000)

      return () => {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [
    isOrchestrationRunning,
    phase,
    activeTaskId,
    tasks,
    breakRemainingSec,
    currentTaskIndex,
    breakMinutes,
  ])

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!dragRef.current.isDragging) return
      if (event.pointerType === 'touch') {
        event.preventDefault()
      }

      const nextX = event.clientX - dragRef.current.offsetX
      const nextY = event.clientY - dragRef.current.offsetY
      setFloatingPosition(clampFloatingPosition(nextX, nextY))
    }

    const handlePointerUp = () => {
      dragRef.current.isDragging = false
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  useEffect(() => {
    if (!isFullscreenActive) return

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsFullscreenExitConfirmVisible((prev) => !prev)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreenActive])

  useEffect(() => {
    if (!isFullscreenActive) return
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = ''
    }
  }, [isFullscreenActive])

  const reorderTasks = useCallback(
    (sourceTaskId, targetTaskId, placement) => {
      setTasks((prev) => {
        const fromIndex = prev.findIndex((task) => task.id === sourceTaskId)
        const targetIndex = prev.findIndex((task) => task.id === targetTaskId)
        if (fromIndex < 0 || targetIndex < 0) return prev

        let toIndex = targetIndex + (placement === 'after' ? 1 : 0)
        if (fromIndex < toIndex) toIndex -= 1

        const next = moveTask(prev, fromIndex, toIndex)
        if (next === prev) return prev

        if (activeTaskId) {
          const activeIndex = next.findIndex((task) => task.id === activeTaskId)
          if (activeIndex >= 0) {
            setCurrentTaskIndex(activeIndex)
          }
        }

        return next
      })
    },
    [activeTaskId],
  )

  useEffect(() => {
    if (!draggingTaskId) return

    const handlePointerMove = (event) => {
      if (event.pointerType === 'touch') {
        event.preventDefault()
      }

      const hovered = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.('[data-task-id]')
      const targetTaskId = hovered?.getAttribute('data-task-id')

      if (!targetTaskId || targetTaskId === draggingTaskId) {
        taskReorderRef.current.targetTaskId = null
        setDropIndicator(null)
        return
      }

      const rect = hovered.getBoundingClientRect()
      const placement =
        event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'

      taskReorderRef.current.targetTaskId = targetTaskId
      taskReorderRef.current.placement = placement
      setDropIndicator({ taskId: targetTaskId, placement })
    }

    const finishReorder = () => {
      const { sourceTaskId, targetTaskId, placement } = taskReorderRef.current
      if (sourceTaskId && targetTaskId && sourceTaskId !== targetTaskId) {
        reorderTasks(sourceTaskId, targetTaskId, placement)
      }

      taskReorderRef.current = {
        sourceTaskId: null,
        targetTaskId: null,
        placement: 'before',
      }
      setDraggingTaskId(null)
      setDropIndicator(null)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', finishReorder)
    window.addEventListener('pointercancel', finishReorder)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishReorder)
      window.removeEventListener('pointercancel', finishReorder)
    }
  }, [draggingTaskId, reorderTasks])

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [tasks, activeTaskId],
  )

  const orchestrationTime =
    phase === 'break'
      ? breakRemainingSec
      : activeTask
        ? activeTask.remainingSec
        : 0

  const phaseLabel =
    phase === 'focus' ? '专注中' : phase === 'break' ? '休息中' : '空闲'

  const handleAddTask = (event) => {
    event.preventDefault()
    if (breakMinutes === null) {
      setReorderNotice('休息时长格式无效，请先输入正整数分钟。')
      return
    }

    const cleanTitle = title.trim()
    const minutes = parsePositiveInteger(durationMin)
    const position = parsePositiveInteger(insertPositionInput, {
      allowEmpty: true,
    })

    if (!cleanTitle || minutes === null) return
    if (position === null) return

    const task = createTask(cleanTitle, minutes)
    setTasks((prev) => {
      const maxPosition = prev.length + 1
      const safePosition =
        position === undefined
          ? maxPosition
          : Math.min(Math.max(1, position), maxPosition)
      const insertIndex = safePosition - 1
      return [...prev.slice(0, insertIndex), task, ...prev.slice(insertIndex)]
    })
    setTitle('')
    setDurationMin(25)
    setInsertPositionInput('')
  }

  const handleTaskReorderPointerDown = (event, taskId) => {
    if (isOrchestrationRunning) {
      setReorderNotice('编排运行中，暂停或停止后再调整顺序。')
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return

    event.preventDefault()
    setReorderNotice('')
    setDraggingTaskId(taskId)
    setDropIndicator(null)
    taskReorderRef.current = {
      sourceTaskId: taskId,
      targetTaskId: null,
      placement: 'before',
    }
  }

  const startTask = (taskId) => {
    setIsFocusFullscreen(true)
    setIsFullscreenExitConfirmVisible(false)
    setActiveTaskId(taskId)
    setPhase('focus')
    setIsOrchestrationRunning(false)
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === taskId) {
          return { ...task, status: 'running' }
        }
        if (task.status === 'running') {
          return { ...task, status: 'paused' }
        }
        return task
      }),
    )
  }

  const pauseTask = (taskId) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: 'paused' } : task,
      ),
    )
  }

  const resetTask = (taskId) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, remainingSec: task.durationSec, status: 'idle' }
          : task,
      ),
    )
    if (activeTaskId === taskId) {
      setActiveTaskId(null)
      setPhase('idle')
    }
  }

  const deleteTask = (taskId) => {
    const targetIndex = tasks.findIndex((task) => task.id === taskId)
    setTasks((prev) => prev.filter((task) => task.id !== taskId))
    if (activeTaskId === taskId) {
      setActiveTaskId(null)
      setPhase('idle')
      setIsOrchestrationRunning(false)
    }
    if (targetIndex >= 0 && targetIndex <= currentTaskIndex) {
      setCurrentTaskIndex((prev) => Math.max(0, prev - 1))
    }
  }

  const startOrchestration = () => {
    if (breakMinutes === null) {
      setReorderNotice('休息时长格式无效，请输入正整数分钟后再开始编排。')
      return
    }
    if (!tasks.length) return
    const firstIndex = tasks.findIndex((task) => task.status !== 'done')
    if (firstIndex < 0) return

    const target = tasks[firstIndex]
    setIsFocusFullscreen(true)
    setIsFullscreenExitConfirmVisible(false)
    setCurrentTaskIndex(firstIndex)
    setActiveTaskId(target.id)
    setPhase('focus')
    setBreakRemainingSec(0)
    setIsOrchestrationRunning(true)
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === target.id) return { ...task, status: 'running' }
        if (task.status === 'running') return { ...task, status: 'paused' }
        return task
      }),
    )
  }

  const pauseOrchestration = () => {
    setIsOrchestrationRunning(false)
    if (phase === 'focus' && activeTaskId) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === activeTaskId ? { ...task, status: 'paused' } : task,
        ),
      )
    }
  }

  const resumeOrchestration = () => {
    if (breakMinutes === null) {
      setReorderNotice('休息时长格式无效，请输入正整数分钟后再继续编排。')
      return
    }

    if (phase === 'focus' && activeTaskId) {
      setIsFocusFullscreen(true)
      setIsFullscreenExitConfirmVisible(false)
      setTasks((prev) =>
        prev.map((task) =>
          task.id === activeTaskId ? { ...task, status: 'running' } : task,
        ),
      )
      setIsOrchestrationRunning(true)
      return
    }

    if (phase === 'break' && breakRemainingSec > 0) {
      setIsFocusFullscreen(true)
      setIsFullscreenExitConfirmVisible(false)
      setIsOrchestrationRunning(true)
      return
    }

    startOrchestration()
  }

  const stopOrchestration = () => {
    setIsOrchestrationRunning(false)
    setPhase('idle')
    setBreakRemainingSec(0)
    setActiveTaskId(null)
    setCurrentTaskIndex(0)
    setTasks((prev) =>
      prev.map((task) =>
        task.status === 'running' ? { ...task, status: 'paused' } : task,
      ),
    )
  }

  const handleFloatingPointerDown = (event) => {
    if (!(event.target instanceof HTMLElement)) return
    if (event.target.closest('button')) return

    dragRef.current.isDragging = true
    dragRef.current.offsetX = event.clientX - floatingPosition.x
    dragRef.current.offsetY = event.clientY - floatingPosition.y
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const requestExitFullscreen = () => {
    setIsFullscreenExitConfirmVisible(true)
  }

  const confirmExitFullscreen = () => {
    setIsFocusFullscreen(false)
    setIsFullscreenExitConfirmVisible(false)
  }

  const cancelExitFullscreen = () => {
    setIsFullscreenExitConfirmVisible(false)
  }

  return (
    <>
      {!isFullscreenActive && (
        <main className="app">
          <section className="panel">
        <h1>番茄钟</h1>
        <p className="subtitle">添加任务并按编排顺序自动专注与休息。</p>

        <form className="task-form" onSubmit={handleAddTask}>
          <label className="task-field task-field-wide">
            <span>任务名称</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：需求评审 / 写周报"
              aria-label="任务名称"
            />
          </label>
          <label className="task-field">
            <span>专注时长（分钟）</span>
            <input
              type="number"
              min="1"
              step="1"
              value={durationMin}
              onChange={(event) => setDurationMin(event.target.value)}
              placeholder="例如：25"
              aria-label="时长（分钟）"
            />
          </label>
          <label className="task-field">
            <span>插入位置</span>
            <input
              type="number"
              min="1"
              step="1"
              max={tasks.length + 1}
              value={insertPositionInput}
              onChange={(event) => setInsertPositionInput(event.target.value)}
              aria-label="插入位置"
              placeholder={`1-${tasks.length + 1}（留空=末尾）`}
            />
          </label>
          <button
            type="submit"
            disabled={
              breakMinutes === null ||
              focusMinutes === null ||
              parsedInsertPosition === null
            }
          >
            添加任务
          </button>
        </form>

        <div className="task-form orchestration-controls" style={{ marginTop: 8 }}>
          <label className="task-field task-field-wide">
            <span>休息时长（分钟）</span>
            <input
              type="number"
              min="1"
              step="1"
              value={breakMin}
              onChange={(event) => setBreakMin(event.target.value)}
              placeholder="例如：5"
              aria-label="休息时长（分钟）"
            />
            {breakInputError ? (
              <span className="field-error" role="alert">
                {breakInputError}
              </span>
            ) : null}
          </label>
          <button onClick={startOrchestration} type="button">
            开始编排
          </button>
          {isOrchestrationRunning ? (
            <button onClick={pauseOrchestration} type="button">
              暂停编排
            </button>
          ) : (
            <button onClick={resumeOrchestration} type="button">
              继续编排
            </button>
          )}
          <button onClick={stopOrchestration} type="button">
            停止编排
          </button>
        </div>

        <div className="active-card">
          <span>当前阶段：{phaseLabel}</span>
          <strong>
            {phase === 'break'
              ? '休息时间'
              : activeTask?.title ?? '暂无运行中的任务'}
          </strong>
          <div className="countdown">{formatTime(orchestrationTime)}</div>
        </div>

        <p className={`reorder-notice ${reorderNotice ? 'warn' : ''}`} role="status">
          {reorderNotice || '拖动“排序”手柄可自由编排任务顺序。'}
        </p>

        <ul className={`task-list ${draggingTaskId ? 'reordering' : ''}`}>
          {tasks.map((task) => {
            const className = [
              'task-item',
              task.status,
              draggingTaskId === task.id ? 'dragging' : '',
              dropIndicator?.taskId === task.id
                ? `drop-${dropIndicator.placement}`
                : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <li key={task.id} className={className} data-task-id={task.id}>
                <div>
                  <h3>{task.title}</h3>
                  <p>
                    {formatTime(task.remainingSec)} · {task.status}
                  </p>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className={`drag-handle ${isOrchestrationRunning ? 'disabled' : ''}`}
                    onPointerDown={(event) =>
                      handleTaskReorderPointerDown(event, task.id)
                    }
                    onClick={() => {
                      if (isOrchestrationRunning) {
                        setReorderNotice('编排运行中，暂停或停止后再调整顺序。')
                      }
                    }}
                    aria-label={`排序任务 ${task.title}`}
                    aria-disabled={isOrchestrationRunning}
                  >
                    ↕ 排序
                  </button>
                  {task.status === 'running' ? (
                    <button onClick={() => pauseTask(task.id)}>暂停</button>
                  ) : (
                    <button onClick={() => startTask(task.id)}>开始</button>
                  )}
                  <button onClick={() => resetTask(task.id)}>重置</button>
                  <button onClick={() => deleteTask(task.id)}>删除</button>
                </div>
              </li>
            )
          })}
        </ul>
          </section>

          <button
            className="floating-toggle"
            onClick={() => setIsFloatingVisible((prev) => !prev)}
          >
            {isFloatingVisible ? '隐藏悬浮窗' : '显示悬浮窗'}
          </button>

          {isFloatingVisible && (
            <aside
              className="floating-window"
              style={{ left: floatingPosition.x, top: floatingPosition.y }}
              onPointerDown={handleFloatingPointerDown}
            >
              <p className="floating-title">{phaseLabel}</p>
              <p className="floating-task">
                {phase === 'break' ? '休息中' : activeTask?.title ?? '暂无任务'}
              </p>
              <p className="floating-time">{formatTime(orchestrationTime)}</p>
              {phase === 'focus' && activeTask && activeTask.status === 'running' ? (
                <button onClick={() => pauseTask(activeTask.id)}>暂停</button>
              ) : phase === 'focus' && activeTask ? (
                <button onClick={() => startTask(activeTask.id)}>继续</button>
              ) : null}
            </aside>
          )}
        </main>
      )}

      {isFullscreenActive && (
        <section className="focus-fullscreen" role="dialog" aria-modal="true">
          <p className="focus-fullscreen-phase">{phaseLabel}</p>
          <h2 className="focus-fullscreen-task">
            {phase === 'break'
              ? '休息时间'
              : activeTask?.title ?? '暂无运行中的任务'}
          </h2>
          <div className="focus-fullscreen-time">{formatTime(orchestrationTime)}</div>
          <div className="focus-fullscreen-actions">
            {phase === 'focus' && activeTask ? (
              activeTask.status === 'running' ? (
                <button
                  type="button"
                  className="focus-fullscreen-btn focus-fullscreen-btn-primary"
                  onClick={() => pauseTask(activeTask.id)}
                >
                  暂停
                </button>
              ) : (
                <button
                  type="button"
                  className="focus-fullscreen-btn focus-fullscreen-btn-primary"
                  onClick={() => startTask(activeTask.id)}
                >
                  继续
                </button>
              )
            ) : null}
            <button
              type="button"
              className="focus-fullscreen-btn focus-fullscreen-btn-secondary"
              onClick={requestExitFullscreen}
            >
              退出
            </button>
          </div>

          {isFullscreenExitConfirmVisible && (
            <div className="focus-fullscreen-confirm-backdrop">
              <div className="focus-fullscreen-confirm">
                <h3>确认退出全屏？</h3>
                <p>退出后计时会继续进行。</p>
                <div className="focus-fullscreen-confirm-actions">
                  <button
                    type="button"
                    className="focus-fullscreen-btn focus-fullscreen-btn-secondary"
                    onClick={cancelExitFullscreen}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="focus-fullscreen-btn focus-fullscreen-btn-primary"
                    onClick={confirmExitFullscreen}
                  >
                    确认退出
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )
}

export default App
