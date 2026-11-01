import { useRef, useState, type ComponentProps, type ReactNode, type SetStateAction } from "react"
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const SCALE_STEP = 0.25

interface ZoomableImageProps extends Omit<ComponentProps<"img">, "src" | "alt" | "className"> {
  src: string
  alt?: string
  className?: string
  imageClassName?: string
  /** Mermaid 保留内联 SVG 预览，弹层则使用独立的图片文档，避免 SVG ID 冲突。 */
  preview?: ReactNode
}

export function ZoomableImage({
  src,
  alt = "",
  className,
  imageClassName,
  preview,
  ...imageProps
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false)
  const [scale, setScale] = useState(1)
  const [fittedSize, setFittedSize] = useState<{ width: number; height: number } | null>(null)
  const dialogImageRef = useRef<HTMLImageElement>(null)

  function resetZoom() {
    setScale(1)
    setFittedSize(null)
  }

  function changeScale(next: SetStateAction<number>) {
    if (!fittedSize) {
      const rect = dialogImageRef.current?.getBoundingClientRect()
      if (!rect?.width || !rect.height) return
      // 以适应当前窗口后的尺寸为基准，避免大图第一次放大时跳变。
      setFittedSize({ width: rect.width, height: rect.height })
    }
    setScale((current) => {
      const requested = typeof next === "function" ? next(current) : next
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, requested))
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    resetZoom()
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          "group/zoomable-image relative inline-block max-w-full cursor-zoom-in align-top",
          className,
        )}
        aria-label={`放大查看${alt || "图片"}`}
        title="点击放大查看"
        onClick={(event) => {
          // 图片位于链接中时，只打开预览，不触发外层链接。
          event.preventDefault()
          event.stopPropagation()
          resetZoom()
          setOpen(true)
        }}
      >
        {preview ?? (
          <img
            {...imageProps}
            src={src}
            alt={alt}
            className={imageClassName}
          />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover/zoomable-image:opacity-100 group-focus-visible/zoomable-image:opacity-100"
        >
          <Maximize2 className="size-4" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-none"
          onKeyDown={(event) => {
            if (event.key === "+" || event.key === "=") {
              event.preventDefault()
              changeScale((current) => current + SCALE_STEP)
            } else if (event.key === "-") {
              event.preventDefault()
              changeScale((current) => current - SCALE_STEP)
            } else if (event.key === "0") {
              event.preventDefault()
              resetZoom()
            }
          }}
        >
          <div className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm">{alt || "图片预览"}</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                双击图片缩放，按 + / - 调整，按 0 还原，Esc 关闭
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="缩小（-）"
                aria-label="缩小"
                disabled={scale <= MIN_SCALE}
                onClick={() => changeScale((current) => current - SCALE_STEP)}
              >
                <Minus />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-w-[4.5rem] gap-1 px-2 text-xs tabular-nums"
                title="适应窗口（0）"
                onClick={resetZoom}
              >
                <RotateCcw />
                {Math.round(scale * 100)}%
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="放大（+）"
                aria-label="放大"
                disabled={scale >= MAX_SCALE}
                onClick={() => changeScale((current) => current + SCALE_STEP)}
              >
                <Plus />
              </Button>
              <div className="mx-1 h-5 w-px bg-border" />
              <DialogClose asChild>
                <Button variant="ghost" size="icon-sm" title="关闭（Esc）" aria-label="关闭">
                  <X />
                </Button>
              </DialogClose>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
            <div className="grid h-max min-h-full w-max min-w-full place-items-center p-6">
              <img
                ref={dialogImageRef}
                src={src}
                alt={alt}
                draggable={false}
                className="max-h-[calc(100dvh-8.5rem)] max-w-[calc(100vw-5rem)] shrink-0 cursor-zoom-in select-none object-contain"
                style={fittedSize ? {
                  width: fittedSize.width * scale,
                  height: fittedSize.height * scale,
                  maxWidth: "none",
                  maxHeight: "none",
                } : undefined}
                onDoubleClick={() => {
                  if (scale === 1) changeScale(2)
                  else resetZoom()
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
