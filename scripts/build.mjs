import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDirectory, '..');
const outputDirectory = join(projectRoot, 'dist');

async function build() {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  await cp(join(projectRoot, 'manifest.json'), join(outputDirectory, 'manifest.json'));
  await cp(join(projectRoot, 'README.md'), join(outputDirectory, 'README.md'));
  await cp(join(projectRoot, 'LICENSE'), join(outputDirectory, 'LICENSE'));
  await cp(join(projectRoot, 'public'), join(outputDirectory, 'public'), { recursive: true });
  await cp(join(projectRoot, 'src'), join(outputDirectory, 'src'), { recursive: true });

  console.log(`Built extension files in ${outputDirectory}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});