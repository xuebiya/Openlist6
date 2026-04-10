import SubtitlesOctopus from "libass-wasm"
import { useCDN } from "~/hooks"

// 获取 CDN 路径的工具函数（在运行时调用）
function getLibAssPath(): string {
  const { libAssPath } = useCDN()
  return libAssPath()
}

function getFontsPath(): string {
  const { fontsPath } = useCDN()
  return fontsPath()
}

function getWorkerUrl(): string {
  return `${getLibAssPath()}/subtitles-octopus-worker.js`
}

function getWasmUrl(): string {
  return `${getLibAssPath()}/subtitles-octopus-worker.wasm`
}

function getTimesNewRomanFont(): string {
  // 如果字体文件不存在，返回空字符串
  const fontPath = `${getFontsPath()}/TimesNewRoman.ttf`
  return fontPath
}

function getFallbackFont(): string {
  // 如果字体文件不存在，返回空字符串
  const fontPath = `${getFontsPath()}/SourceHanSansCN-Bold.woff2`
  return fontPath
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//.test(url)
}

function toAbsoluteUrl(url: string): string {
  if (isAbsoluteUrl(url)) return url
  return new URL(url, document.baseURI).toString()
}

function loadWorker(workerUrl: string, wasmUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log("[DPlayer ASS] Loading worker from:", workerUrl)
    console.log("[DPlayer ASS] WASM URL:", wasmUrl)
    
    fetch(workerUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch worker: ${res.status}`)
        }
        return res.text()
      })
      .then((text) => {
        let workerScriptContent = text

        workerScriptContent = workerScriptContent.replace(
          /wasmBinaryFile\s*=\s*"(subtitles-octopus-worker\.wasm)"/g,
          (_match, _wasm) => {
            const resolvedWasmUrl = toAbsoluteUrl(wasmUrl)
            console.log("[DPlayer ASS] Replaced wasmBinaryFile with:", resolvedWasmUrl)
            return `wasmBinaryFile = "${resolvedWasmUrl}"`
          }
        )

        const workerBlob = new Blob([workerScriptContent], {
          type: "text/javascript",
        })
        resolve(URL.createObjectURL(workerBlob))
      })
      .catch((err) => {
        console.error("[DPlayer ASS] Failed to load worker:", err)
        reject(err)
      })
  })
}

// DPlayer ASS 字幕插件
export interface DPlayerSubtitleOctopusPlugin {
  init: (dp: any, subUrl?: string) => void
  switchTrack: (url: string) => void
  hide: () => void
  show: () => void
  setOffset: (offset: number) => void
  dispose: () => void
}

class DPlayerSubtitleOctopus {
  private instance: any = null
  private dp: any = null
  private currentSubUrl: string = ""
  private offset: number = 0

  async init(dp: any, subUrl?: string) {
    if (this.instance) {
      this.dispose()
    }

    this.dp = dp
    const video = dp.video

    // 如果传入了字幕 URL，直接使用它
    // 否则从 DPlayer 配置中查找 ASS 字幕
    let assSubtitle = subUrl || findAssSubtitle(dp)
    if (!assSubtitle) {
      console.log("[DPlayer ASS] No ASS subtitle found")
      return
    }

    this.currentSubUrl = assSubtitle
    console.log("[DPlayer ASS] Initializing with subtitle URL:", assSubtitle)

    try {
      const loadedWorkerUrl = await loadWorker(getWorkerUrl(), getWasmUrl())
      console.log("[DPlayer ASS] Worker loaded successfully")

      // 构建选项
      const options: any = {
        workerUrl: loadedWorkerUrl,
        video: video,
        subUrl: toAbsoluteUrl(this.currentSubUrl),
        onReady: () => {
          console.log("[DPlayer ASS] SubtitlesOctopus is ready")
        },
        onError: (error: any) => {
          console.error("[DPlayer ASS] Error:", error)
        },
        debug: true,
      }

      // 只有当字体 URL 有效时才添加
      const timesNewRomanFont = toAbsoluteUrl(getTimesNewRomanFont())
      const fallbackFont = toAbsoluteUrl(getFallbackFont())
      
      if (timesNewRomanFont) {
        options.availableFonts = {
          "times new roman": timesNewRomanFont,
        }
      }
      
      if (fallbackFont) {
        options.fallbackFont = fallbackFont
      }

      this.instance = new SubtitlesOctopus(options)

      // 设置画布样式
      this.instance.canvasParent.className = "dplayer-plugin-ass"
      this.instance.canvasParent.style.cssText = `
        position: absolute;
        width: 100%;
        height: 100%;
        user-select: none;
        pointer-events: none;
        z-index: 10;
      `

      // 隐藏原生字幕，让 ASS 字幕显示
      if (video.textTracks && video.textTracks[0]) {
        video.textTracks[0].mode = "hidden"
      }

      // 绑定 DPlayer 事件
      this.bindEvents()

      // 保存全局实例
      if (typeof window !== "undefined") {
        ;(window as any).DPlayerSubtitleOctopusInstance = this
      }
    } catch (error) {
      console.error("[DPlayer ASS] Failed to initialize ASS subtitle:", error)
    }
  }

  private bindEvents() {
    if (!this.dp) return

    // 监听视频时间更新，同步 ASS 字幕
    this.dp.on("timeupdate", () => {
      if (this.instance) {
        this.instance.setCurrentTime(this.dp.video.currentTime + this.offset)
      }
    })

    // 监听暂停/播放状态
    this.dp.on("pause", () => {
      if (this.instance) {
        this.instance.setIsPaused(true, this.dp.video.currentTime)
      }
    })

    this.dp.on("play", () => {
      if (this.instance) {
        this.instance.setIsPaused(false, this.dp.video.currentTime)
      }
    })

    // 监听视频尺寸变化
    this.dp.on("resize", () => {
      if (this.instance) {
        this.instance.resize()
      }
    })
  }

  switchTrack(url: string) {
    if (!this.instance) return

    this.currentSubUrl = url
    this.instance.freeTrack()
    this.instance.setTrackByUrl(toAbsoluteUrl(url))

    // 确保画布可见
    this.show()
  }

  hide() {
    if (this.instance?.canvasParent) {
      this.instance.canvasParent.style.display = "none"
    }
  }

  show() {
    if (this.instance?.canvasParent) {
      this.instance.canvasParent.style.display = "block"
    }
  }

  setOffset(offset: number) {
    this.offset = offset
    if (this.instance) {
      this.instance.timeOffset = offset
    }
  }

  dispose() {
    if (this.instance) {
      this.instance.dispose()
      this.instance = null
    }
    this.dp = null
    this.currentSubUrl = ""
    this.offset = 0

    if (typeof window !== "undefined") {
      ;(window as any).DPlayerSubtitleOctopusInstance = null
    }
  }
}

// 从 DPlayer 配置中查找 ASS 字幕
function findAssSubtitle(dp: any): string | null {
  // DPlayer 的字幕可以通过 subtitle api 获取
  // 这里假设第一个 .ass 字幕就是我们要用的
  const subtitles = dp.options.subtitle
  if (subtitles && subtitles.url) {
    if (typeof subtitles.url === "string") {
      if (subtitles.url.toLowerCase().endsWith(".ass")) {
        return subtitles.url
      }
    } else if (Array.isArray(subtitles.url)) {
      for (const sub of subtitles.url) {
        if (sub.url && sub.url.toLowerCase().endsWith(".ass")) {
          return sub.url
        }
      }
    }
  }
  return null
}

// 创建单例
const DPlayerSubtitleOctopusInstance = new DPlayerSubtitleOctopus()

// 导出插件
export const DPlayerSubtitleOctopusPlugin: DPlayerSubtitleOctopusPlugin = {
  init: (dp: any, subUrl?: string) => {
    DPlayerSubtitleOctopusInstance.init(dp, subUrl)
  },
  switchTrack: (url: string) => {
    DPlayerSubtitleOctopusInstance.switchTrack(url)
  },
  hide: () => {
    DPlayerSubtitleOctopusInstance.hide()
  },
  show: () => {
    DPlayerSubtitleOctopusInstance.show()
  },
  setOffset: (offset: number) => {
    DPlayerSubtitleOctopusInstance.setOffset(offset)
  },
  dispose: () => {
    DPlayerSubtitleOctopusInstance.dispose()
  },
}

// 注册到全局
if (typeof window !== "undefined") {
  ;(window as any).DPlayerSubtitleOctopus = DPlayerSubtitleOctopusPlugin
}

export default DPlayerSubtitleOctopusPlugin