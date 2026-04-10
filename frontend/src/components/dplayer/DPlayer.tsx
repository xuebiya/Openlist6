import DPlayer from "dplayer"
import Hls from "hls.js"
import mpegts from "mpegts.js"
import "./dplayer-plugin-ass"

export interface DPlayerOptions {
  container: HTMLElement
  url: string
  title?: string
  autoplay?: boolean
  theme?: string
  loop?: boolean
  screenshot?: boolean
  hotkey?: boolean
  fullscreen?: boolean
  subtitles?: Array<{
    url: string
    name: string
    lang?: string
  }>
  defaultSubtitleIndex?: number
  quality?: Array<{
    url: string
    name: string
  }>
  danmaku?: {
    url: string
  }
  onReady?: () => void
  onEnded?: () => void
  onError?: () => void
  onFullscreenChange?: (fullscreen: boolean) => void
  onTimeUpdate?: (currentTime: number) => void
}

let instance: any = null

export class DPlayerComponent {
  private dp: any
  private container: HTMLElement
  private options: DPlayerOptions

  constructor(options: DPlayerOptions) {
    this.options = options
    this.container = options.container
    this.dp = null
  }

  init() {
    const dpOptions: any = {
      container: this.container,
      autoplay: this.options.autoplay ?? false,
      theme: this.options.theme ?? "#1890ff",
      loop: this.options.loop ?? false,
      screenshot: this.options.screenshot ?? false,
      hotkey: this.options.hotkey ?? true,
      fullscreen: this.options.fullscreen ?? true,
      playbackSpeed: true,
      airplay: true,
      logo: undefined,
      video: {
        url: this.options.url,
        type: "auto",
        customType: {
          m3u8: (video: HTMLMediaElement, url: string) => {
            if (Hls.isSupported()) {
              const hls = new Hls()
              hls.loadSource(url)
              hls.attachMedia(video)
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
              video.src = url
            }
          },
          flv: (video: HTMLMediaElement, url: string) => {
            if (mpegts.isSupported()) {
              const flvPlayer = mpegts.createPlayer(
                { type: "flv", url },
                { referrerPolicy: "same-origin" }
              )
              flvPlayer.attachMediaElement(video)
              flvPlayer.load()
              ;(video as any)._flvPlayer = flvPlayer
            }
          },
        },
      },
      contextmenu: [],
      highlight: [],
      danmaku: this.options.danmaku
        ? {
            id: `danmaku-${Date.now()}`,
            api: "https://api.dplayer.cn/",
            token: "tokendemo",
            addition: [this.options.danmaku.url],
            user: "OpenList",
          }
        : undefined,
    }

    // 添加字幕配置
    if (this.options.subtitles && this.options.subtitles.length > 0) {
      dpOptions.subtitle = {
        url: this.options.subtitles[0].url,
        type: "webvtt",
        fontSize: "20px",
        bottom: "40px",
        color: "#fff",
      }
    }

    // 质量切换
    if (this.options.quality && this.options.quality.length > 0) {
      dpOptions.video.quality = this.options.quality
      dpOptions.video.defaultQuality = this.options.quality.length - 1
    }

    this.dp = new DPlayer(dpOptions)

    // 设置初始字幕
    if (this.options.subtitles && this.options.defaultSubtitleIndex !== undefined) {
      const track = this.dp.video.textTracks[0]
      if (track) {
        track.mode = "hidden"
      }
    }

    // 注册 ASS 字幕插件（如果需要）
    if (
      this.options.subtitles &&
      this.options.subtitles.some((s) => s.url.toLowerCase().endsWith(".ass"))
    ) {
      this.initAssPlugin()
    }

    this.bindEvents()
    return this
  }

  private initAssPlugin() {
    if (typeof window !== "undefined" && window.DPlayerSubtitleOctopus) {
      window.DPlayerSubtitleOctopus.init(this.dp)
    }
  }

  private bindEvents() {
    if (!this.dp) return

    this.dp.on("ready", () => {
      this.options.onReady?.()
    })

    this.dp.on("ended", () => {
      this.options.onEnded?.()
    })

    this.dp.on("error", () => {
      this.options.onError?.()
    })

    this.dp.on("fullscreen", () => {
      this.options.onFullscreenChange?.(true)
    })

    this.dp.on("fullscreen_exit", () => {
      this.options.onFullscreenChange?.(false)
    })

    this.dp.on("timeupdate", () => {
      this.options.onTimeUpdate?.(this.dp.video.currentTime)
    })
  }

  // 公开 API
  get video() {
    return this.dp?.video
  }

  get playing() {
    return this.dp?.playing
  }

  get currentTime() {
    return this.dp?.video?.currentTime
  }

  set currentTime(time: number) {
    if (this.dp?.video) {
      this.dp.video.currentTime = time
    }
  }

  play() {
    this.dp?.play()
  }

  pause() {
    this.dp?.pause()
  }

  destroy() {
    // 销毁 FLV 播放器
    if (this.dp?.video?._flvPlayer) {
      this.dp.video._flvPlayer.destroy()
    }

    // 销毁 ASS 插件实例
    if (window.DPlayerSubtitleOctopusInstance) {
      window.DPlayerSubtitleOctopusInstance.dispose()
      window.DPlayerSubtitleOctopusInstance = null
    }

    this.dp?.destroy()
    this.dp = null
  }

  switchSubtitle(url: string) {
    if (!this.dp) return

    const isAss = url.toLowerCase().endsWith(".ass")

    if (isAss) {
      // 使用 ASS 渲染
      this.dp.video.textTracks[0].mode = "hidden"
      window.DPlayerSubtitleOctopus?.switchTrack(url)
    } else {
      // 使用原生字幕
      window.DPlayerSubtitleOctopus?.hide()
      this.dp.subtitle.change(url)
      this.dp.video.textTracks[0].mode = "showing"
    }
  }

  showSubtitle() {
    if (!this.dp) return

    // 隐藏 ASS 画布
    if (window.DPlayerSubtitleOctopusInstance) {
      window.DPlayerSubtitleOctopusInstance.canvasParent.style.display = "block"
    }

    // 显示原生字幕
    if (this.dp.video.textTracks[0]) {
      this.dp.video.textTracks[0].mode = "showing"
    }
  }

  hideSubtitle() {
    if (!this.dp) return

    // 隐藏 ASS 画布
    if (window.DPlayerSubtitleOctopusInstance) {
      window.DPlayerSubtitleOctopusInstance.canvasParent.style.display = "none"
    }

    // 隐藏原生字幕
    if (this.dp.video.textTracks[0]) {
      this.dp.video.textTracks[0].mode = "hidden"
    }
  }

  toggleSubtitle() {
    if (!this.dp) return

    const track = this.dp.video.textTracks[0]
    if (track) {
      if (track.mode === "showing") {
        this.hideSubtitle()
      } else {
        this.showSubtitle()
      }
    }
  }
}

// 全局 ASS 字幕插件实例
declare global {
  interface Window {
    DPlayerSubtitleOctopus: any
    DPlayerSubtitleOctopusInstance: any
  }
}

export default DPlayerComponent