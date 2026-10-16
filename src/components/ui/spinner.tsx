import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ColorfulSpinner({ className, size = "md" }: SpinnerProps) {
  const dotSize = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };
  const delays = ["0s", "0.12s", "0.24s"];

  return (
    <>
      <style>{`
        @keyframes strong-bounce {
          0%, 100% { transform: translateY(-50%); animation-timing-function: cubic-bezier(.8,0,1,1); }
          50% { transform: translateY(50%); animation-timing-function: cubic-bezier(0,0,.2,1); }
        }
      `}</style>
      <div className={cn("flex items-center gap-1", className)}>
        {delays.map((delay, i) => (
          <span
            key={i}
            className={cn("rounded-full bg-muted-foreground/40", dotSize[size])}
            style={{
              animation: `strong-bounce 1s infinite`,
              animationDelay: delay,
            }}
          />
        ))}
      </div>
    </>
  );
}
