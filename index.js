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

function impactGraph() {
  return (all) => {
    const measurements = all.filter((it) => it.duration >= 80);
    const selectMax = (max, it) => Math.max(formatInt(it.duration).length, max);
    const maxDurationChars = measurements.reduce(selectMax, 1);
    const tree = buildTree(measurements);
    const result = [];
    tree.forEach((root) =>
      traverse(root, (item, depth) => {
        const duration = formatInt(item.data.duration, maxDurationChars);
        const indentation = space(depth * 2);
        const moduleName = item.path ?? item.data.target;
        result.push(`[${duration}] ${indentation}${moduleName}`);
      })
    );
    return result;
  };
}

function buildTree(measurements) {
  const nodes = [];
  const roots = new Set();
  measurements.forEach((data) => {
    const node = { data, children: [] };
    roots.add(node);
    nodes.forEach((other) => {
      if (other.data.target === data.title) {
        other.path = data.file;
        other.children.push(node);
        roots.delete(node);
      } else if (other.data.title === data.target) {
        node.path = other.data.file;
        node.children.push(other);
        roots.delete(other);
      }
    });
    nodes.push(node);
  });
  return Array.from(roots.values());
}

function traverse(node, visit, depth = 0) {
  visit(node, depth);
  node.children.forEach((child) => traverse(child, visit, depth + 1));
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

class ModuleImportSpy extends Base {
  init = Date.now();
  cause = "jest";

  requireModule(from, moduleName, options) {
    if (moduleName === "jest-import-spy") {
      return { collectImports, moduleList, impactGraph };
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
  moduleList: { value: moduleList },
  impactGraph: { value: impactGraph },
});
