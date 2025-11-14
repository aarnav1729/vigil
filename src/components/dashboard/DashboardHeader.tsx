// src/components/dashboard/DashboardHeader.tsx
import React, { useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
// IMPORTANT: use ?url so Vite treats the GLB as a static asset, not JS
import vigilModelUrl from "@/components/assets/obot.glb?url";

interface DashboardHeaderProps {
  onAddApplication: () => void;
}

/* --- TSX typing for <model-viewer> --- */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        alt?: string;
        "camera-controls"?: boolean;
        "disable-zoom"?: boolean;
        "disable-pan"?: boolean;
        autoplay?: boolean;
        "auto-rotate"?: boolean;
        "auto-rotate-delay"?: string | number;
        "rotation-per-second"?: string;
        "camera-orbit"?: string;
        "camera-target"?: string;
        "min-camera-orbit"?: string;
        "max-camera-orbit"?: string;
        exposure?: string | number;
        "shadow-intensity"?: string | number;
        "shadow-softness"?: string | number;
        ar?: boolean;
        "ar-modes"?: string;
      };
    }
  }
}

/* --- GLB logo component: self-hosted model-viewer, CSP-safe --- */
const VigilGLBLogo: React.FC = () => {
  useEffect(() => {
    // Only run in browser
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    // If model-viewer is already registered, don't inject again
    if (customElements.get("model-viewer")) {
      return;
    }

    // Load local model-viewer script served from /public (CSP: script-src 'self')
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/model-viewer.min.js";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // We don't remove the script on unmount; once loaded, it's reusable.
    };
  }, []);

  return (
    // Small wrapper controls header height; model itself is much larger and can overflow
    <div className="relative h-24 w-24 sm:h-18 sm:w-18 overflow-visible flex items-center justify-center">
      <model-viewer
        src={vigilModelUrl}
        alt="Vigil 3D Logo"
        camera-controls
        disable-zoom
        disable-pan
        autoplay
        auto-rotate
        auto-rotate-delay="0"
        rotation-per-second="25deg"
        // lock vertical angle & zoom; allow only horizontal (side-to-side) orbit
        camera-orbit="0deg 70deg 120%"
        min-camera-orbit="-180deg 70deg 120%"
        max-camera-orbit="180deg 70deg 120%"
        exposure="1.1"
        shadow-intensity="1"
        shadow-softness="1"
        ar
        ar-modes="webxr scene-viewer quick-look"
        // 🔥 Doubled visual size; it will “float” outside the small wrapper
        style={{ width: "200%", height: "200%" }}
      />
    </div>
  );
};

const DashboardHeader = ({ onAddApplication }: DashboardHeaderProps) => {
  return (
    <header className="relative border-b border-card-border bg-background/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-2">
        {/* Left: compact header, GLB visually huge due to overflow */}
        <div className="flex items-center gap-3">
          <VigilGLBLogo />
        </div>

        {/* Right: + button only */}
        <div className="flex items-center gap-2 mr-12">
          <Button
            onClick={onAddApplication}
            className="bg-gradient-primary hover:opacity-90 transition-opacity shadow-elegant"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
