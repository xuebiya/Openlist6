import { Box, Center } from "@hope-ui/solid"
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useRouter, useLink, useFetch } from "~/hooks"
import { getMainColor, getSettingBool, objStore, password } from "~/store"
import { ObjType, PResp } from "~/types"
import { ext, handleResp, notify, r, pathDir, pathJoin } from "~/utils"
import DPlayer from "dplayer"
import Hls from "hls.js"
import { VideoBox } from "./video_box"
import { useNavigate } from "@solidjs/router"
import { TiWarning } from "solid-icons/ti"
import "./dplayer.css"
import "~/components/dplayer/dplayer-plugin-ass"

export interface Data {
  drive_id: string
  file_id: string
  video_preview_play_info: VideoPreviewPlayInfo
}

export interface VideoPreviewPlayInfo {
  category: string
  live_transcoding_task_list: LiveTranscodingTaskList[]
  meta: Meta
}

export interface LiveTranscodingTaskList {
  stage: string
  status: string
  template_height: number
  template_id: string
  template_name: string
  template_width: number
  url: string
}

export interface Meta {
  duration: number
  height: number
  width: number
}

const Preview = () => {
  const { pathname, searchParams } = useRouter()
  const { proxyLink } = useLink()
  const navigate = useNavigate()
  let dp: any
  let hlsPlayer: Hls | null = null

  const videos = createMemo(() =>
    objStore.objs.filter((obj) => obj.type === ObjType.VIDEO)
  )
  const next_video = () => {
    const index = videos().findIndex((f) => f.name === objStore.obj.name)
    if (index < videos().length - 1) {
      navigate(
        pathJoin(pathDir(location.pathname), videos()[index + 1].name) +
          "?auto_fullscreen=" +
          dp?.fullscreen,
      )
    }
  }
  const previous_video = () => {
    const index = videos().findIndex((f) => f.name === objStore.obj.name)
    if (index > 0) {
      navigate(
        pathJoin(pathDir(location.pathname), videos()[index - 1].name) +
          "?auto_fullscreen=" +
          dp?.fullscreen,
      )
    }
  }

  // 查找字幕文件
  const subtitle = objStore.related.filter((obj) => {
    for (const ext of [".srt", ".ass", ".vtt"]) {
      if (obj.name.endsWith(ext)) {
        return true
      }
    }
    return false
  })

  // 查找弹幕文件
  const danmu = objStore.related.find((obj) => {
    for (const ext of [".xml"]) {
      if (obj.name.endsWith(ext)) {
        return true
      }
    }
    return false
  })

  // 初始字幕URL
  let defaultSubtitleUrl = ""
  let isEnhanceAssMode = false

  if (subtitle.length > 0) {
    const defaultSubtitle = subtitle[0]
    if (ext(defaultSubtitle.name).toLowerCase() === "ass") {
      isEnhanceAssMode = true
      defaultSubtitleUrl = proxyLink(defaultSubtitle, true)
    } else {
      defaultSubtitleUrl = proxyLink(defaultSubtitle, true)
    }
  }

  // 判断是否需要代理视频
  const needProxy = (url: string) => {
    if (url.startsWith("http") && !url.includes(location.origin)) {
      return true
    }
    return false
  }

  // 获取视频URL，如果是外部URL则使用代理
  const getVideoUrl = (url: string) => {
    if (needProxy(url)) {
      return proxyLink(objStore.obj, true)
    }
    return url
  }

  // 初始化 ASS 字幕
  function initAssSubtitle(player: any, subUrl: string) {
    if (typeof window !== "undefined" && window.DPlayerSubtitleOctopus) {
      if (player.video.textTracks[0]) {
        player.video.textTracks[0].mode = "hidden"
      }
      window.DPlayerSubtitleOctopus.init(player)
    }
  }

  // 切换字幕
  function switchSubtitle(url: string) {
    if (!dp) return

    const isAss = url.toLowerCase().endsWith(".ass")
    if (isAss) {
      window.DPlayerSubtitleOctopus?.switchTrack(url)
    } else {
      window.DPlayerSubtitleOctopus?.hide()
      dp.subtitle.change(url)
      if (dp.video.textTracks[0]) {
        dp.video.textTracks[0].mode = "showing"
      }
    }
  }

  // 显示/隐藏字幕
  function setSubtitleVisible(visible: boolean) {
    if (!dp) return

    if (isEnhanceAssMode) {
      if (visible) {
        window.DPlayerSubtitleOctopus?.show()
      } else {
        window.DPlayerSubtitleOctopus?.hide()
      }
    } else {
      if (visible) {
        if (dp.video.textTracks[0]) {
          dp.video.textTracks[0].mode = "showing"
        }
      } else {
        if (dp.video.textTracks[0]) {
          dp.video.textTracks[0].mode = "hidden"
        }
      }
    }
  }

  const [loading, post] = useFetch(
    (): PResp<Data> =>
      r.post("/fs/other", {
        path: pathname(),
        password: password(),
        method: "video_preview",
      })
  )

  let interval: number
  let curSeek: number

  onMount(async () => {
    const resp = await post()
    setWarnVisible(resp.code !== 200)
    handleResp(resp, (data) => {
      const list =
        data.video_preview_play_info.live_transcoding_task_list.filter(
          (l) => l.url
        )
      if (list.length === 0) {
        notify.error("No transcoding video found")
        return
      }

      // 获取视频URL（可能需要代理）
      const videoUrl = list[list.length - 1].url

      // 设置视频URL和清晰度
      const dpOptions: any = {
        container: document.getElementById("video-player"),
        autoplay: getSettingBool("video_autoplay"),
        theme: getMainColor(),
        loop: false,
        screenshot: true,
        hotkey: true,
        fullscreen: true,
        playbackSpeed: true,
        airplay: true,
        logo: undefined,
        video: {
          url: getVideoUrl(videoUrl),
          type: "m3u8",
          customType: {
            m3u8: function (video: HTMLMediaElement, url: string) {
              hlsPlayer = new Hls()
              hlsPlayer.loadSource(url)
              hlsPlayer.attachMedia(video)
              if (!video.src) {
                video.src = url
              }
            },
          },
          quality: list.map((item, i) => {
            return {
              name: item.template_id,
              url: getVideoUrl(item.url),
            }
          }),
          defaultQuality: list.length - 1,
        },
        subtitle: {
          // 设置字幕 URL 以便 ASS 插件能检测到
          url: defaultSubtitleUrl || "",
          type: "webvtt",
        },
        contextmenu: [],
        highlight: [],
      }

      // 添加弹幕配置
      if (danmu) {
        dpOptions.danmaku = {
          id: `danmaku-${Date.now()}`,
          api: "https://api.dplayer.cn/",
          token: "tokendemo",
          addition: [proxyLink(danmu, true)],
          user: "OpenList",
        }
      }

      // 确保容器存在
      const container = document.getElementById("video-player")
      if (!container) return

      dp = new DPlayer(dpOptions)

      // 关键修复：立即移除 crossOrigin 属性，防止 CORS 错误
      const video = dp.video
      try {
        video.crossOrigin = null
      } catch (e) {
        // 某些浏览器可能不支持直接设置
      }
      video.removeAttribute("crossOrigin")
      video.removeAttribute("crossorigin")

      // 处理 ASS 字幕
      if (isEnhanceAssMode && defaultSubtitleUrl) {
        initAssSubtitle(dp, defaultSubtitleUrl)
      }

      // 自动全屏
      let autoFullscreen = false
      switch (searchParams["auto_fullscreen"]) {
        case "true":
          autoFullscreen = true
        case "false":
          autoFullscreen = false
        default:
          autoFullscreen = false
      }
      dp.on("ready", () => {
        if (autoFullscreen) {
          dp.fullScreen.request()
        }
      })

      // 弹幕配置保存
      if (danmu) {
        dp.on("danmaku:config", (option: any) => {
          const {
            speed,
            margin,
            opacity,
            mode,
            modes,
            fontSize,
            antiOverlap,
            synchronousPlayback,
            heatmap,
            visible,
          } = option
          localStorage.setItem(
            "danmuku_config",
            JSON.stringify({
              speed,
              margin,
              opacity,
              mode,
              modes,
              fontSize,
              antiOverlap,
              synchronousPlayback,
              heatmap,
              visible,
            })
          )
        })
      }

      // 视频播放结束
      dp.on("ended", () => {
        if (!autoNext()) return
        next_video()
      })

      // 定时刷新播放URL
      interval = window.setInterval(resetPlayUrl, 1000 * 60 * 14)
    })

    // 错误处理
    dp?.on("error", () => {
      if (dp.video.crossOrigin) {
        console.log(
          "Error detected. Trying to remove Cross-Origin attribute. Screenshot may not be available."
        )
        dp.video.crossOrigin = null
      }
    })
  })

  async function resetPlayUrl() {
    const resp = await post()
    handleResp(resp, async (data) => {
      const list =
        data.video_preview_play_info.live_transcoding_task_list.filter(
          (l) => l.url
        )
      if (list.length === 0) {
        notify.error("No transcoding video found")
        return
      }

      const quality = list.map((item, i) => {
        return {
          name: item.template_id,
          url: getVideoUrl(item.url),
        }
      })

      if (dp) {
        curSeek = dp.video.currentTime
        let curPlaying = dp.playing
        dp.switchQuality(quality[quality.length - 1].url)
        if (!curPlaying) dp.pause()
        setTimeout(() => {
          dp.seek = curSeek
        }, 1000)
      }
    })
  }

  onCleanup(() => {
    // 清理 ASS 字幕插件
    if (window.DPlayerSubtitleOctopus) {
      window.DPlayerSubtitleOctopus.dispose()
    }

    // 清理播放器
    if (dp) {
      dp.destroy()
    }

    // 清理定时器
    window.clearInterval(interval)

    // 清理 HLS 播放器
    if (hlsPlayer) {
      hlsPlayer.destroy()
    }
  })

  const [autoNext, setAutoNext] = createSignal()
  const [warnVisible, setWarnVisible] = createSignal(false)
  return (
    <VideoBox onAutoNextChange={setAutoNext}>
      <Box w="$full" h="60vh" id="video-player" />
      <Show when={warnVisible()}>
        <Center w="100%" h="60vh" bgColor="black">
          <TiWarning size="4rem" />
        </Center>
      </Show>
    </VideoBox>
  )
}

export default Preview