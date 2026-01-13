"use client";

import Lottie from "lottie-react";
import winkingAnimation from "@/public/animations/winking-face.json";

interface WinkingFaceProps {
  size?: number;
}

export default function WinkingFace({ size = 32 }: WinkingFaceProps) {
  return (
    <Lottie
      animationData={winkingAnimation}
      loop={true}
      style={{ width: size, height: size }}
    />
  );
}
