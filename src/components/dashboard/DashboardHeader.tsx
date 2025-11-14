// src/components/dashboard/DashboardHeader.tsx
import React, { useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
// IMPORTANT: use ?url so Vite treats the GLB as a static asset, not JS
import vigilModelUrl from "@/components/assets/bot.glb?url";

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
        autoplay?: boolean;
        "auto-rotate"?: boolean;
        "auto-rotate-delay"?: string | number;
        "rotation-per-second"?: string;
        "camera-orbit"?: string;
        "camera-target"?: string;
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
    <div className="relative h-40 w-40 sm:h-48 sm:w-48 lg:h-56 lg:w-56 overflow-visible flex items-center justify-center">
      <model-viewer
        src={vigilModelUrl}
        alt="Vigil 3D Logo"
        camera-controls
        disable-zoom
        autoplay
        auto-rotate
        auto-rotate-delay="0"
        rotation-per-second="25deg"
        camera-orbit="auto 70deg 120%"
        exposure="1.15"
        shadow-intensity="1"
        shadow-softness="1"
        ar
        ar-modes="webxr scene-viewer quick-look"
        className="pointer-events-none"
        // Large model; visually spills outside the header
        style={{ width: 280, height: 280 }}
      />
    </div>
  );
};

const DashboardHeader = ({ onAddApplication }: DashboardHeaderProps) => {
  return (
    <div className="relative flex items-center justify-between p-6 border-b border-card-border overflow-visible">
      {/* Left side: big GLB floating, no visible container */}
      <div className="flex items-center gap-4">
        <div className="relative -mt-10">
          <VigilGLBLogo />
        </div>
      </div>

      {/* Right side: CTA button unchanged */}
      <Button
        onClick={onAddApplication}
        className="bg-gradient-primary hover:opacity-90 transition-opacity shadow-elegant"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Application
      </Button>
    </div>
  );
};

export default DashboardHeader;
