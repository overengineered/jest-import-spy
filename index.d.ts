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

type AsyncFn = () => Promise<any>;
type Collect1A = (fn: AsyncFn) => Promise<string[]>;
type Collect1 = (fn: () => void) => string[];
type Collect2A = (options: CollectorOptions, fn: AsyncFn) => Promise<string[]>;
type Collect2 = (options: CollectorOptions, fn: () => void) => string[];
type Measure2 = (options: ImpactOptions, fn: () => void) => string[];

export const collectImports: Collect1A & Collect1 & Collect2A & Collect2;
export const measureImports: Collect1 & Measure2;
export const moduleList: (options?: ListOptions) => Interpreter;
export const impactGraph: (options?: ImpactOptions) => Interpreter;
export const detect: (regex: RegExp) => Interpreter;
