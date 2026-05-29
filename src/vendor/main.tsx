import { render } from "solid-js/web"
import { createMemo, createSignal, For, onMount, Show } from "solid-js"
import { DataProvider, useData } from "../../upstream/packages/ui/src/context"
import { FileComponentProvider } from "../../upstream/packages/ui/src/context/file"
import { I18nProvider, useI18n, type UiI18n } from "../../upstream/packages/ui/src/context/i18n"
import { MarkedProvider } from "../../upstream/packages/ui/src/context/marked"
import { DialogProvider } from "../../upstream/packages/ui/src/context/dialog"
import { Mark, Logo } from "../../upstream/packages/ui/src/components/logo"
import { ProviderIcon } from "../../upstream/packages/ui/src/components/provider-icon"
import { SessionTurn } from "../../upstream/packages/ui/src/components/session-turn"
import { FileSSR } from "../../upstream/packages/ui/src/components/file-ssr"
import { Icon } from "../../upstream/packages/ui/src/components/icon"
import { WorkerPoolProvider } from "../../upstream/packages/ui/src/context/worker-pool"
import { getWorkerPools } from "./pierre/worker"
import { dict as en } from "../../upstream/packages/ui/src/i18n/en"
import { DateTime } from "luxon"
import "./styles/index.css"

const i18nValue: UiI18n = {
  locale: () => "en",
  t: (key, params) => {
    const text = en[key] ?? String(key)
    if (!params) return text
    return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, k) => {
      const v = params[String(k)]
      return v === undefined ? "" : String(v)
    })
  },
}

type ExportData = {
  session: any
  messages: { info: any; parts: any[] }[]
}

function TitleHeader(props: { info: any; model?: { id: string; name: string; providerID: string } }) {
  const provider = () => props.model?.providerID ?? (props.info.providerID as string | undefined)
  const modelID = () => props.model?.id ?? (props.info.modelID as string | undefined)
  const modelName = () => props.model?.name ?? modelID()

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 sm:items-center sm:h-8 justify-start self-stretch">
        <div class="pl-[2.5px] pr-2 flex items-center gap-1.75 bg-surface-strong shadow-xs-border-base w-fit">
          <Mark class="shrink-0 w-3 my-0.5" />
          <div class="text-12-mono text-text-base">v{props.info.version ?? "0.0.1"}</div>
        </div>
        <div class="flex gap-4 items-center">
          <div class="flex gap-2 items-center">
            <Show when={provider()}>
              <ProviderIcon id={provider()!} class="size-3.5 shrink-0 text-icon-strong-base" />
            </Show>
            <div class="text-12-regular text-text-base">{modelName()}</div>
          </div>
          <Show when={props.info.time?.created}>
            <div class="text-12-regular text-text-weaker">
              {DateTime.fromMillis(props.info.time.created).toFormat("dd MMM yyyy, HH:mm")}
            </div>
          </Show>
        </div>
      </div>
      <div class="text-left text-16-medium text-text-strong">{props.info.title ?? "OpenCode Session"}</div>
    </div>
  )
}

function ShareContent() {
  const data = useData()
  const sessionID = createMemo(() => data.store.session?.[0]?.id ?? "default")
  const messages = createMemo(
    () =>
      (data.store.message?.[sessionID()] ?? [])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .sort((a: any, b: any) => (a.time?.created ?? 0) - (b.time?.created ?? 0)),
  )
  const userMessages = createMemo(() => messages().filter((m: any) => m.role === "user"))
  const models = createMemo(() => data.store.model?.[sessionID()] ?? [])
  const firstUser = createMemo(() => userMessages().at(0) as any)
  const titleModel = createMemo(() => {
    const modelID = firstUser()?.model?.modelID ?? firstUser()?.modelID
    return models().find((m: any) => m.id === modelID)
  })
  const sessionInfo = createMemo(() => data.store.session?.[0] ?? {})

  return (
    <div class="relative bg-background-stronger w-screen h-screen overflow-hidden flex flex-col text-text-base">
      <header class="h-12 px-6 py-2 flex items-center justify-between self-stretch bg-background-base border-b border-border-weak-base">
        <a href="https://opencode.ai">
          <Mark />
        </a>
        <div class="flex gap-3 items-center">
          <a href="https://github.com/anomalyco/opencode" target="_blank" class="flex items-center justify-center size-8 rounded-md text-icon-base">
            <Icon name="github" size="normal" />
          </a>
          <a href="https://opencode.ai/discord" target="_blank" class="flex items-center justify-center size-8 rounded-md text-icon-base">
            <Icon name="discord" size="normal" />
          </a>
        </div>
      </header>

      <div class="flex flex-1 min-h-0 w-full overflow-y-auto">
        <div class="relative mt-2 pb-8 min-w-0 w-full">
          <div class="max-w-3xl mx-auto px-4">
            <div class="py-6">
              <TitleHeader info={sessionInfo()} model={titleModel()} />
            </div>
            <div class="flex flex-col gap-15 items-start justify-start mt-4">
              <For each={userMessages()}>
                {(message) => (
                  <SessionTurn
                    sessionID={sessionID()}
                    messageID={message.id}
                    classes={{
                      root: "min-w-0 w-full relative",
                      content: "flex flex-col justify-between !overflow-visible",
                      container: "",
                    }}
                  />
                )}
              </For>
            </div>
            <div class="flex items-center justify-center pt-20 pb-8 shrink-0">
              <Logo class="w-58.5 opacity-12" />
            </div>
          </div>
        </div>


      </div>
    </div>
  )
}

function App() {
  const [raw, setRaw] = createSignal<ExportData | null>(null)

  onMount(() => {
    const el = document.getElementById("session-data")
    if (!el) return
    try {
      const str = atob(el.textContent || "")
      const bytes = new Uint8Array(str.length)
      for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
      setRaw(JSON.parse(new TextDecoder().decode(bytes)))
    } catch {}
  })

  const dataStore = createMemo(() => {
    const d = raw()
    if (!d) return { session: [], message: {}, part: {}, session_status: {}, session_diff: {} }

    const sid = d.session?.id || "default"
    const msgs = d.messages ?? []
    const message: Record<string, any[]> = { [sid]: [] }
    const part: Record<string, any[]> = {}
    const session_diff: Record<string, any[]> = { [sid]: [] }
    const preloadMap: Record<string, unknown> = (d as any).session_diff_preload ?? {}

    // Collect diffs from messages
    const seenDiffs = new Set<string>()
    if (d.session?.summary?.diffs) {
      for (const diff of d.session.summary.diffs) {
        if (!diff.file || seenDiffs.has(diff.file)) continue
        seenDiffs.add(diff.file)
        session_diff[sid].push({ ...diff, preloaded: preloadMap[diff.file] })
      }
    }

    for (const m of msgs) {
      message[sid].push(m.info)
      if (m.info?.id) part[m.info.id] = m.parts ?? []

      // Collect diffs from message summaries
      for (const diff of m.info?.summary?.diffs ?? []) {
        if (!diff.file || seenDiffs.has(diff.file)) continue
        seenDiffs.add(diff.file)
        session_diff[sid].push({ ...diff, preloaded: preloadMap[diff.file] })
      }
    }

    const sessionModel = d.session?.model
    const models = sessionModel?.id
      ? [{ id: sessionModel.id, name: sessionModel.name ?? sessionModel.id, providerID: sessionModel.providerID ?? "" }]
      : []

    return {
      session: [d.session],
      message,
      part,
      session_status: { [sid]: { type: "idle" } },
      session_diff,
      model: { [sid]: models },
    }
  })

  const directory = createMemo(() => dataStore().session?.[0]?.directory ?? "")

  return (
    <Show when={raw()}>
      <DataProvider data={dataStore() as any} directory={directory()}>
        <I18nProvider value={i18nValue}>
          <MarkedProvider>
            <FileComponentProvider component={FileSSR}>
              <WorkerPoolProvider pools={getWorkerPools()}>
                <DialogProvider>
                  <ShareContent />
                </DialogProvider>
              </WorkerPoolProvider>
            </FileComponentProvider>
          </MarkedProvider>
        </I18nProvider>
      </DataProvider>
    </Show>
  )
}

function init() {
  const root = document.getElementById("root")
  if (!root) return
  render(() => <App />, root)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
