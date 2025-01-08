import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function addJsExtensions(dir: string) {
	for (const file of await readdir(dir)) {
		const filePath = join(dir, file)
		if ((await stat(filePath)).isFile() && filePath.endsWith('.js')) {
			let content = (await readFile(filePath, 'utf-8')).toString()
			content = "import { dirname } from 'node:path'\n" + content
			content = "import { fileURLToPath } from 'node:url'\n" + content
			content = content.replace(/from\s+['"](\..*?)(?<!\.js)['"]/g, "from '$1.js'")
			content = content.replaceAll('__dirname', 'dirname(fileURLToPath(import.meta.url))')
			await writeFile(filePath, content, 'utf-8')
		}
	}
}
addJsExtensions('esm').catch(error => { throw error }).then()
