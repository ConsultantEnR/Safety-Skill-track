import React from "react";

export default function PageShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main className={`flex-1 overflow-y-auto relative flex flex-col ${className}`}>

      {/* Decorative SVG background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <svg viewBox="0 0 900 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="none">
          <path d="M900 600 Q650 420 400 520 Q150 620 200 360 Q250 100 580 180" stroke="#FCC00E" strokeWidth="3" opacity="0.18"/>
          <path d="M900 480 Q680 320 450 420 Q220 520 260 280 Q300 40 620 120" stroke="#FCC00E" strokeWidth="2" opacity="0.12"/>
          <path d="M900 540 Q670 370 430 470 Q190 570 230 320 Q270 70 600 150" stroke="#27295A" strokeWidth="3" opacity="0.10"/>
          <path d="M900 420 Q700 280 480 370 Q260 460 290 230 Q320 0 640 80" stroke="#27295A" strokeWidth="1.5" opacity="0.07"/>
          <circle cx="450" cy="340" r="220" stroke="#FCC00E" strokeWidth="2.5" opacity="0.10"/>
          <circle cx="520" cy="200" r="140" stroke="#27295A" strokeWidth="2" opacity="0.07"/>
          <circle cx="350" cy="460" r="100" stroke="#FCC00E" strokeWidth="2" opacity="0.12"/>
        </svg>
      </div>

      {/* Page content */}
      <div className="relative z-10 flex-1 p-8">
        {children}
      </div>

      {/* Footer */}
      <footer className="relative z-10 shrink-0 border-t border-gray-200 py-2.5 px-8 text-center text-xs text-gray-400">
        © Aegide International 2026 - Tous droits réservés &nbsp;////&nbsp; Filiale du Groupe Dolfines
      </footer>
    </main>
  );
}
