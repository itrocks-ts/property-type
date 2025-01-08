import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function addJsExtensions(dir: string) {
	for (const file of await readdir(dir)) {
		const filePath = join(dir, file)
		if ((await stat(filePath)).isFile() && filePath.endsWith('.js')) {
			const content =
				"import { createRequire } from 'node:module'\n"
				+ "const require = createRequire(import.meta.url)\n"
				+ (file.includes('demo') ? "import { dirname } from 'node:path'\n" : '')
				+ "import { fileURLToPath } from 'node:url'\n"
				+ (await readFile(filePath, 'utf-8')).toString()
				.replace(/from\s+['"](\..*?)(?<!\.js)['"]/g, "from '$1.js'")
				.replaceAll('__dirname', 'dirname(fileURLToPath(import.meta.url))')
			await writeFile(filePath, content, 'utf-8')
		}
	}
}
addJsExtensions('esm').catch(error => { throw error }).then()
