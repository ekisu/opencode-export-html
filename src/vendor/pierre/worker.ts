import { WorkerPoolManager } from "@pierre/diffs/worker"
import workerCode from "virtual:worker-portable"

let _workerBlobUrl: string | undefined

export function workerFactory(): Worker {
  if (!_workerBlobUrl) {
    const blob = new Blob([workerCode], { type: "application/javascript" })
    _workerBlobUrl = URL.createObjectURL(blob)
  }
  return new Worker(_workerBlobUrl)
}

function createPool(lineDiffType: "none" | "word-alt") {
  const pool = new WorkerPoolManager(
    { workerFactory, poolSize: 2 },
    { theme: "OpenCode", lineDiffType, preferredHighlighter: "shiki-js" },
  )
  void pool.initialize()
  return pool
}

export type WorkerPoolStyle = "unified" | "split"

let _unified: WorkerPoolManager | undefined
let _split: WorkerPoolManager | undefined

export function getWorkerPool(style: WorkerPoolStyle | undefined): WorkerPoolManager | undefined {
  if (typeof window === "undefined") return
  if (style === "split") {
    if (!_split) _split = createPool("word-alt")
    return _split
  }
  if (!_unified) _unified = createPool("none")
  return _unified
}

export function getWorkerPools() {
  return {
    unified: getWorkerPool("unified"),
    split: getWorkerPool("split"),
  }
}
