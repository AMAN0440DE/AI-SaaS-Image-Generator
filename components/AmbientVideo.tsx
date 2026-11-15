"use client";

import { useEffect, useRef } from "react";

type AmbientVideoProps = {
  className: string;
  poster?: string;
  src: string;
};

export function AmbientVideo({ className, poster, src }: AmbientVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let observer: IntersectionObserver | undefined;

    const observeVideo = () => {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            observer?.disconnect();
            void video.play().catch((error: unknown) => {
              if (error instanceof DOMException && error.name === "NotAllowedError") {
                return;
              }
              console.error("Failed to play ambient video.", error);
            });
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(video);
    };

    if (document.readyState === "complete") {
      observeVideo();
    } else {
      window.addEventListener("load", observeVideo, { once: true });
    }

    return () => {
      window.removeEventListener("load", observeVideo);
      observer?.disconnect();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className={className}
      loop
      muted
      playsInline
      preload="none"
      poster={poster}
      aria-hidden="true"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
