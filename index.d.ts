type Options = {
  libraries?: "all" | "entry-point";
  excludeSynthetic?: boolean;
  sorted?: boolean;
};
type Collector1 = (fn: () => void) => string[];
type Collector2 = (options: Options, fn: () => void) => string[];
export const collectImports: Collector1 & Collector2;
