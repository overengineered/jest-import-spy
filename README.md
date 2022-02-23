# Enables inspecting imports in Jest tests

## Usage

```JavaScript
// Jest config
{
  "moduleLoader": "jest-import-spy"
}
```

```TypeScript
import {collectImports} from 'jest-import-spy';

test('imports', () => {
  const imports = collectImports(() => {
    jest.isolateModules(() => {
      require('./src');
    });
  });
  expect(imports).toEqual(['./src/index.js', './src/utils.js', 'lodash']);
});
```
