export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      {/* Pitch background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-white/5" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5" />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="font-display text-4xl text-turf-400 tracking-widest">POOL'EM</a>
        </div>
        {children}
      </div>
    </div>
  )
}
