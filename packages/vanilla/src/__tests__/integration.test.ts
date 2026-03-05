import fs from 'fs';
import path from 'path';

describe('zero-React contract', () => {
  it('packages/vanilla/package.json has no React in dependencies or peerDependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    expect(pkg.dependencies?.react).toBeUndefined();
    expect(pkg.peerDependencies?.react).toBeUndefined();
    expect(pkg.dependencies?.['@compiled/react']).toBeUndefined();
  });

  it('packages/runtime/package.json has no React in dependencies or peerDependencies', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../../packages/runtime/package.json'), 'utf8')
    );
    expect(pkg.dependencies?.react).toBeUndefined();
    expect(pkg.peerDependencies?.react).toBeUndefined();
  });

  it('no source files in packages/vanilla/src/ import from react', () => {
    const srcDir = path.join(__dirname, '../../');
    const files = getAllTsFiles(srcDir);
    for (const file of files) {
      if (file.includes('__tests__')) continue;
      const content = fs.readFileSync(file, 'utf8');
      expect({ file, hasReactImport: /from ['"](react|react-dom)['"]/m.test(content) }).toEqual({
        file,
        hasReactImport: false,
      });
    }
  });

  it('no source files in packages/runtime/src/ import from react', () => {
    const srcDir = path.join(__dirname, '../../../../packages/runtime/src/');
    const files = getAllTsFiles(srcDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect({ file, hasReactImport: /from ['"](react|react-dom)['"]/m.test(content) }).toEqual({
        file,
        hasReactImport: false,
      });
    }
  });
});

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}
