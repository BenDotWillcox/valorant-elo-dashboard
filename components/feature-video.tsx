"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface FeatureVideoProps {
  src: string;
  poster: string;
  title: string;
  className?: string;
}

export function FeatureVideo({ src, poster, title, className }: FeatureVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const shouldAttachSource = shouldLoad && prefersReducedMotion === false;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);

    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      setIsVisible(true);
      return;
    }

    const loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          loadObserver.disconnect();
        }
      },
      { rootMargin: "300px 0px", threshold: 0 }
    );

    const playbackObserver = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35);
      },
      { threshold: [0, 0.35, 0.75] }
    );

    loadObserver.observe(container);
    playbackObserver.observe(container);

    return () => {
      loadObserver.disconnect();
      playbackObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!shouldAttachSource || !isVisible || userPaused) {
      video.pause();
      return;
    }

    void video.play().catch(() => setIsPlaying(false));
  }, [isVisible, shouldAttachSource, userPaused]);

  useEffect(() => {
    if (prefersReducedMotion !== true) return;

    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.removeAttribute("src");
    video.load();
    setIsPlaying(false);
  }, [prefersReducedMotion]);

  useEffect(() => {
    const video = videoRef.current;

    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      setUserPaused(true);
      video.pause();
      return;
    }

    setShouldLoad(true);
    setUserPaused(false);
    if (video.currentSrc) {
      void video.play().catch(() => setIsPlaying(false));
    }
  };

  const playbackLabel = `${isPlaying ? "Pause" : "Play"} ${title} preview`;

  return (
    <div
      ref={containerRef}
      className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900 shadow-2xl"
    >
      <video
        ref={videoRef}
        data-poster={poster}
        src={shouldAttachSource ? src : undefined}
        poster={shouldLoad ? poster : undefined}
        preload="metadata"
        muted
        loop
        playsInline
        aria-hidden="true"
        className={cn(
          "h-full w-full object-cover transition-transform duration-700 group-hover:scale-105",
          className
        )}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {prefersReducedMotion === false && (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={playbackLabel}
          title={playbackLabel}
          className="absolute bottom-3 right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/70 text-white shadow-lg transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
