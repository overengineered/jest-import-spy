const Base = require("jest-runtime").default;
const path = require("path");

const observers = new Set();

function collectImports(fnOrOptions, maybeFn) {
  const options = typeof fnOrOptions === "function" ? {} : fnOrOptions;
  const fn = typeof fnOrOptions === "function" ? fnOrOptions : maybeFn;
  const processor = options.output ? options.output : moduleList(options);
  const analyze = isStandardProcessor(processor) ? processor() : processor;
  return execute(fn, analyze);
}

function modulePath(from, moduleName) {
  return typeof moduleName !== "string"
    ? moduleName
    : moduleName.startsWith(".")
    ? "./" + path.relative(".", path.join(path.dirname(from), moduleName))
    : moduleName;
}

function isSynthetic(moduleName) {
  return (
    moduleName.startsWith("@babel/runtime") ||
    moduleName.startsWith("regenerator-runtime") ||
    moduleName.startsWith("./node_modules/@babel/runtime")
  );
}

function isInsideLibrary(from = "") {
  return from.startsWith("./node_modules");
}

function isStandardProcessor(processor) {
  return processor === impactGraph || processor === moduleList;
}

function moduleList({
  libraries = "entry-point",
  excludeSynthetic = true,
  sorted = true,
} = {}) {
  return (measurements) => {
    const relevant = measurements.filter((measurement) => {
      const shouldSkip =
        (excludeSynthetic && isSynthetic(measurement.target)) ||
        (libraries === "entry-point" && isInsideLibrary(measurement.file));
      return !shouldSkip;
    });
    const arrange = sorted ? (a) => Array.from(new Set(a)).sort() : (a) => a;
    return arrange(relevant.map((it) => it.target));
  };
}

function hasGaps(list) {
  return list.slice(0, -1).find((node) => node.children.length > 0);
}

function detect(regex) {
  return (all) => {
    const tree = buildTree(all, (node) => !regex.test(node.data.target));
    const results = new Map();
    tree.forEach((root) =>
      traverse(
        root,
        (item, { withHead = () => "", depth = 0, source = "" } = {}) => {
          const id = item.data.target;
          const match = regex.exec(id);
          if (match) {
            const combo = source + "+++" + id;
            const markedId =
              id.slice(0, match.index) +
              "\x1b[4m" +
              match[0] +
              "\x1b[24m" +
              id.slice(match.index + match[0].length);
            if (!results.has(combo) || results.get(combo)[0] > depth) {
              results.set(combo, [depth, withHead(markedId).substring(3)]);
            }
          }
          const buildPath = (next) => `${withHead(item.path)} ➤ ${next}`;
          return { withHead: buildPath, depth: depth + 1, source: id };
        }
      )
    );
    return [...results.values()].map((a) => a[1]);
  };
}

function impactGraph({ minDuration = 200 } = {}) {
  return (all) => {
    const list = all.filter((it) => !isSynthetic(it.target));
    const selectMax = (max, it) => Math.max(formatInt(it.duration).length, max);
    const maxDurationChars = list.reduce(selectMax, 1);
    const tree = buildTree(list, (_, it) => it.data.duration >= minDuration);
    const result = [];
    tree.forEach((root) =>
      traverse(root, (item, tag = { base: "" }) => {
        const duration = formatInt(item.data.duration, maxDurationChars);
        const moduleName = item.description ?? item.data.target;
        const suffix = !tag.endNode ? "  " : tag.endNode === item ? "└ " : "├ ";
        const indentation = tag.base + (tag.base === "" ? "" : suffix);
        result.push(`[${duration}] ${indentation.slice(2)}${moduleName}`);
        const endNode = hasGaps(item.children)
          ? item.children[item.children.length - 1]
          : undefined;
        const ending = tag.endNode && tag.endNode !== item ? "│ " : "  ";
        return { base: tag.base + ending, endNode };
      })
    );
    return result;
  };
}

function description(target, path) {
  return target.startsWith(".") ? path : `${target} (${path})`;
}

function within(range, slot) {
  return (
    slot.offset >= range.offset && slot.offset <= range.offset + range.duration
  );
}

function buildTree(measurements, shouldAttach) {
  const nodes = [];
  const roots = new Set();
  const detached = new Set();
  measurements.forEach((data) => {
    const node = { data, children: [] };
    roots.add(node);
    nodes.forEach((other) => {
      if (other.data.target === data.title && within(other.data, data)) {
        other.path = data.file;
        other.description = description(other.data.target, data.file);
        if (shouldAttach(other, node)) {
          other.children.push(node);
          roots.delete(node);
        } else {
          detached.add(node);
        }
      } else if (other.data.title === data.target && within(data, other.data)) {
        node.path = other.data.file;
        node.description = description(node.data.target, other.data.file);
        if (shouldAttach(node, other)) {
          node.children.push(other);
          roots.delete(other);
        } else {
          detached.add(other);
        }
      }
    });
    nodes.push(node);
  });
  return Array.from(roots.values()).filter((it) => !detached.has(it));
}

function traverse(node, visit, tag) {
  const next = visit(node, tag);
  node.children.forEach((child) => traverse(child, visit, next));
}

function space(count) {
  return " ".repeat(count);
}

function formatInt(value, length) {
  const formatted = value.toString();
  return length && formatted.length < length
    ? space(length - formatted.length) + formatted
    : formatted;
}

function withCleanup(task, onFinished) {
  let shouldCleanup = false;
  try {
    shouldCleanup = true;
    const output = task();
    shouldCleanup = !(typeof output === "object" && "then" in output);
    if (!shouldCleanup) {
      return output.then(onFinished).catch((error) => {
        onFinished();
        throw error;
      });
    }
  } finally {
    if (shouldCleanup) {
      onFinished();
    }
  }
}

function execute(fn, processResults) {
  const measurements = [];
  const recorder = (measurement) => measurements.push(measurement);
  observers.add(recorder);
  const promise = withCleanup(fn, () => void observers.delete(recorder));
  return promise
    ? promise.then(() => processResults(measurements))
    : processResults(measurements);
}

function measureImports(fnOrOptions, maybeFn) {
  const [graphOptions, fn] =
    typeof maybeFn === "function" ? [fnOrOptions, maybeFn] : [{}, fnOrOptions];
  const options = { output: impactGraph(graphOptions) };
  const list = collectImports(options, fn);
  if (list.length > 0) {
    throw new Error(list.join("\n"));
  }
  return [];
}

class ModuleImportSpy extends Base {
  init = Date.now();
  cause = "jest";

  requireModule(from, moduleName, options) {
    if (moduleName === "jest-import-spy") {
      return {
        collectImports,
        measureImports,
        moduleList,
        impactGraph,
        detect,
      };
    }

    const baseImplementation = Base.prototype.requireModule;
    if (observers.size === 0) {
      return baseImplementation.call(this, from, moduleName, options);
    }

    const source = moduleName ? { file: "./" + path.relative(".", from) } : {};
    const target = modulePath(from, moduleName) ?? from;
    const title = this.cause;

    const start = Date.now();
    this.cause = target;
    const result = baseImplementation.call(this, from, moduleName, options);
    this.cause = title;
    const end = Date.now();

    const duration = end - start;
    const offset = start - this.init;
    const measurement = { title, ...source, target, duration, offset };

    observers.forEach((send) => send(measurement));

    return result;
  }
}

const unsupportedUse = `'jest-import-spy' is designed to be loaded through moduleLoader option in Jest config, see https://github.com/overengineered/jest-import-spy#usage`;

module.exports = Object.defineProperties(ModuleImportSpy, {
  collectImports: {
    get: () => {
      console.log(unsupportedUse);
      return () => {
        throw new Error(unsupportedUse);
      };
    },
  },
  measureImports: {
    get: () => {
      console.log(unsupportedUse);
      return () => {
        throw new Error(unsupportedUse);
      };
    },
  },
  moduleList: { value: moduleList },
  impactGraph: { value: impactGraph },
  detect: { value: detect },
});
