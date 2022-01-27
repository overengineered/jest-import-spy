interface Measurement {
  title: string;
  file?: string;
  target: string;
  duration: number;
  offset: number;
}

type ListOptions = {
  libraries?: "all" | "entry-point";
  excludeSynthetic?: boolean;
  sorted?: boolean;
  output?: never;
};

type ImpactOptions = {
  minDuration?: number;
};

type Interpreter = (imports: Measurement[]) => string[];

type CollectorOptions = ListOptions | { output?: Interpreter };

type Collector1 = (fn: () => void) => string[];
type Collector2 = (options: CollectorOptions, fn: () => void) => string[];

export const collectImports: Collector1 & Collector2;
export const moduleList: (options?: ListOptions) => Interpreter;
export const impactGraph: (options?: ImpactOptions) => Interpreter;
