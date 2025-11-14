// src/App.tsx
import "@google/model-viewer"; // VIGIL_MODEL_VIEWER_IMPORT

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ApplicationDetails from "./pages/ApplicationDetails";
import NotFound from "./pages/NotFound";
// VIGIL_STATUS_IMPORT
import StatusPage from "./pages/StatusPage";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/ThemeToggle";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider defaultTheme="system" storageKey="vigil-theme">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          {/* floating theme toggle */}
          <ThemeToggle />
          <Routes>
            <Route path="/" element={<Index />} />
            {/* VIGIL_STATUS_ROUTE */}
            <Route path="/status" element={<StatusPage />} />
            <Route path="/app/:id" element={<ApplicationDetails />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
