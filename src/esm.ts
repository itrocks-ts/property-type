import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function addJsExtensions(dir: string)
{
	for (const file of await readdir(dir)) {
		if (file === 'esm.js') continue
		const filePath = join(dir, file)
		if ((await stat(filePath)).isFile() && filePath.endsWith('.js')) {
			let content = (await readFile(filePath, 'utf-8')).toString()
			if (content.includes('require(')) {
				content =
					"import { createRequire } from 'module'\n"
					+ "const require = createRequire(import.meta.url)\n"
					+ content
			}
			if (content.includes('__dirname')) {
				if ((content.indexOf('dirname') < 0) || (content.indexOf('dirname') > content.indexOf('__dirname'))) {
					content = "import { dirname } from 'path'\n" + content
				}
				content = "import { fileURLToPath } from 'url'\n"
					+ content.replaceAll('__dirname', 'dirname(fileURLToPath(import.meta.url))')
			}
			content = content
				.replace(/from\s+['"](\..*?)(?<!\.js)['"]/g, "from '$1.js'")
				.replaceAll('__dirname', 'dirname(fileURLToPath(import.meta.url))')
			await writeFile(filePath, content, 'utf-8')
		}
	}
}
addJsExtensions('esm').catch(error => { throw error }).then()
