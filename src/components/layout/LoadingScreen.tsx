import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Props for the LoadingScreen component.
 */
interface LoadingScreenProps {
  /** Current progress value (0-100) */
  progress: number;
  /** Text to display below the progress bar */
  stage: string;
}

/**
 * A full-screen loading component displayed during app initialization.
 * Shows the app name, an animated progress bar, and the current loading stage.
 */
function LoadingScreen({ progress, stage }: LoadingScreenProps) {
  return (
    <div
      className={cn(
        "flex h-screen w-screen flex-col items-center justify-center",
        "bg-background text-foreground",
      )}
    >
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">ZeroSort</h1>
      <div className="w-64">
        <Progress value={progress} className="h-1" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{stage}</p>
    </div>
  );
}

export { LoadingScreen };
