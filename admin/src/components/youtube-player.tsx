import React, {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerHandle {
  seekTo: (seconds: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
}

interface YouTubePlayerProps {
  videoId: string;
  className?: string;
  onReady?: () => void;
}

export function timestampToSeconds(timestamp: string): number {
  if (!timestamp) return 0;
  const parts = timestamp.trim().split(":").map(Number);
  if (parts.some((p) => isNaN(p))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  ({ videoId, className, onReady }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerInstanceRef = useRef<any>(null);
    const [isApiReady, setIsApiReady] = useState<boolean>(false);
    const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);

    // 1. Ensure YouTube IFrame API script is loaded
    useEffect(() => {
      if (window.YT && window.YT.Player) {
        setIsApiReady(true);
        return;
      }

      const existingScript = document.getElementById("youtube-iframe-api");
      if (!existingScript) {
        const tag = document.createElement("script");
        tag.id = "youtube-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        setIsApiReady(true);
      };

      const checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          setIsApiReady(true);
          clearInterval(checkInterval);
        }
      }, 200);

      return () => {
        clearInterval(checkInterval);
      };
    }, []);

    // 2. Instantiate player once API is ready and container is mounted
    useEffect(() => {
      if (!isApiReady || !containerRef.current || !videoId) return;

      let isMounted = true;

      // Create a dedicated inner element for YouTube to replace
      const targetElement = document.createElement("div");
      targetElement.style.width = "100%";
      targetElement.style.height = "100%";
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(targetElement);

      try {
        const player = new window.YT.Player(targetElement, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
          },
          events: {
            onReady: () => {
              if (isMounted) {
                playerInstanceRef.current = player;
                setIsPlayerReady(true);
                onReady?.();
              }
            },
          },
        });
      } catch (err) {
        console.error("Failed to initialize YouTube Player:", err);
      }

      return () => {
        isMounted = false;
        setIsPlayerReady(false);
        if (playerInstanceRef.current) {
          try {
            playerInstanceRef.current.destroy();
          } catch (e) {
            // ignore cleanup errors
          }
          playerInstanceRef.current = null;
        }
      };
    }, [isApiReady, videoId]);

    // 3. Expose imperative methods to parent
    useImperativeHandle(
      ref,
      () => ({
        seekTo: (seconds: number) => {
          if (playerInstanceRef.current && typeof playerInstanceRef.current.seekTo === "function") {
            playerInstanceRef.current.seekTo(seconds, true);
            playerInstanceRef.current.playVideo?.();
          }
        },
        playVideo: () => {
          playerInstanceRef.current?.playVideo?.();
        },
        pauseVideo: () => {
          playerInstanceRef.current?.pauseVideo?.();
        },
      }),
      []
    );

    return (
      <div
        className={`relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-lg border border-border ${
          className || ""
        }`}
      >
        <div ref={containerRef} className="w-full h-full" />
        {!isPlayerReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/90 text-muted-foreground gap-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Loading YouTube player...</span>
          </div>
        )}
      </div>
    );
  }
);

YouTubePlayer.displayName = "YouTubePlayer";
