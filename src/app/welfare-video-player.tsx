'use client';

import { useEffect, useRef } from 'react';
import 'plyr/dist/plyr.css';

type WelfareVideoPlayerProps = {
  refreshKey: number;
  videoSrc: string;
  subtitleSrc: string;
  className?: string;
  onLoadedData?: () => void;
  onError?: () => void;
};

export default function WelfareVideoPlayer({
  refreshKey,
  videoSrc,
  subtitleSrc,
  className,
  onLoadedData,
  onError,
}: WelfareVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    let disposed = false;

    const mountPlayer = async () => {
      try {
        const plyrModule = await import('plyr');
        if (disposed || !videoRef.current) return;

        const Plyr = plyrModule.default;
        const player = new Plyr(videoRef.current, {
          controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'fullscreen'],
          captions: {
            active: true,
            language: 'zh-CN',
            update: true,
          },
          settings: ['captions', 'speed'],
        });

        playerRef.current = player as unknown as { destroy: () => void };
      } catch {
        // Plyr 加载失败时，保持原生 video 可播放。
      }
    };

    mountPlayer();

    return () => {
      disposed = true;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [refreshKey]);

  return (
    <video
      key={refreshKey}
      ref={videoRef}
      src={videoSrc}
      controls
      preload="metadata"
      playsInline
      onLoadedData={onLoadedData}
      onError={onError}
      className={className}
    >
      <track
        kind="subtitles"
        src={subtitleSrc}
        srcLang="zh-CN"
        label="中文字幕"
        default
      />
    </video>
  );
}
