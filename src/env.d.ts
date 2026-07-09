declare module "culori" {
  function parse(color: string): Record<string, number> | undefined;
  function converter(
    mode: string,
  ): (color: Record<string, number>) => Record<string, number>;
  function formatHex(color: Record<string, number>): string;
  function formatRgb(color: Record<string, number>): string;
}

interface ViewTransition {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
}

interface Document {
  startViewTransition?: (callback: () => void) => ViewTransition;
}
