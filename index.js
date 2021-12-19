const Base = require("jest-runtime").default;
const path = require("path");

const observers = new Set();

function collectImports(fnOrOptions, maybeFn) {
  const options = typeof fnOrOptions === "function" ? {} : fnOrOptions;
  const fn = typeof fnOrOptions === "function" ? fnOrOptions : maybeFn;
  return execute(options, fn);
}

function modulePath(from, moduleName) {
  return typeof moduleName !== "string"
    ? moduleName
    : moduleName.startsWith(".")
    ? "./" + path.relative(".", path.join(path.dirname(from), moduleName))
    : moduleName;
}

function isSynthetic(moduleName) {
  return moduleName.startsWith("@babel/runtime");
}

function isImportedFromLibrary(from) {
  return path.relative(".", from).startsWith("node_modules");
}

function record(results, libraries, excludeSynthetic) {
  return (from, moduleName) => {
    const skip =
      (excludeSynthetic && isSynthetic(moduleName)) ||
      (libraries === "entry-point" && isImportedFromLibrary(from));
    if (!skip) {
      results.push(modulePath(from, moduleName));
    }
  };
}

function execute(
  { libraries = "entry-point", excludeSynthetic = true, sorted = true },
  fn
) {
  const results = [];
  const recorder = record(results, libraries, excludeSynthetic);
  observers.add(recorder);
  try {
    fn();
  } finally {
    observers.delete(recorder);
  }
  if (sorted) {
    return Array.from(new Set(results)).sort();
  }
  return results;
}

class ModuleImportSpy extends Base {
  requireModule(from, moduleName, options) {
    if (moduleName === "jest-import-spy") {
      return { collectImports };
    }

    observers.forEach((invoke) => invoke(from, moduleName, options));

    return Base.prototype.requireModule.call(this, from, moduleName, options);
  }
}

module.exports = ModuleImportSpy;
