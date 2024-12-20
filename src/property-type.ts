import Type from '@itrocks/class-type'
import fs   from 'node:fs'
import path from 'node:path'
import ts   from 'typescript'

export class CollectionType<T extends object = object, PT extends object = object>
{
	constructor(public containerType: Type<T>, public elementType: PrimitiveType | Type<PT>) {}
}

export type PrimitiveType = typeof BigInt | Boolean | Number | Object | String | Symbol | undefined

export type PropertyType<T extends object = object, PT extends object = object>
	= CollectionType<T, PT> | PrimitiveType | Type<PT>

export type PropertyTypes<T extends object = object> = Record<string, PropertyType<T>>

type TypeImports = Record<string, { import: string, name: string }>

export default propertyTypesFromFile
export function propertyTypesFromFile<T extends object = object>(file: string)
{
	const content    = fs.readFileSync(file.substring(0, file.lastIndexOf('.')) + '.d.ts', 'utf8')
	const filePath   = file.slice(0, file.lastIndexOf('/'))
	const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true)

	const propertyTypes: PropertyTypes<T> = {}
	const typeImports:   TypeImports      = {}

	const parseNode = (node: ts.Node) => {

		if (ts.isImportDeclaration(node) && node.importClause) {
			const importFile = path.normalize(filePath + '/' + (node.moduleSpecifier as ts.StringLiteral).text)
			if (node.importClause.name) {
				typeImports[node.importClause.name.getText()] = { import: importFile, name: 'default' }
			}
			const namedBindings = node.importClause.namedBindings
			if (namedBindings && ts.isNamedImports(namedBindings)) {
				for (const importSpecifier of namedBindings.elements) {
					const name  = importSpecifier.name.getText()
					const alias = importSpecifier.propertyName?.getText() ?? name
					typeImports[alias] = { import: importFile, name }
				}
			}
		}

		if (ts.isClassDeclaration(node)) {
			node.members.forEach(member => {
				if (ts.isPropertyDeclaration(member) && member.type) {
					propertyTypes[(member.name as ts.Identifier).text] = strToType(member.type.getText(), typeImports)
				}
			})
			return
		}

		ts.forEachChild(node, parseNode)
	}

	parseNode(sourceFile)
	return propertyTypes
}

function strToCollectionType(type: string, typeImports: TypeImports): CollectionType
{
	let collectionType: string | undefined
	let elementType:    string
	if (type[type.length - 1] === ']') {
		collectionType = 'Array'
		elementType    = type.slice(0, -2)
	}
	else {
		const indexOf  = type.indexOf('<')
		collectionType = type.slice(0, indexOf)
		elementType    = type.slice(indexOf + 1, -1)
	}
	return new CollectionType(
		strToType(collectionType, typeImports) as Type,
		strToType(elementType, typeImports)
	)
}

export function strToPrimitiveType(type: string): PrimitiveType | Type
{
	switch (type[0]) {
		case 'b': return (type[1] === 'i') ? BigInt : Boolean
		case 'n': return Number
		case 'o': return Object
		case 's': return (type[1] === 't') ? String : Symbol
		case 'u': return undefined
	}
	return (globalThis as any)[type] as Type
}

function strToType(type: string, typeImports: TypeImports): PropertyType
{
	const endsWith = type[type.length - 1]
	if ((endsWith === ']') || (endsWith === '>')) {
		return strToCollectionType(type, typeImports)
	}
	const typeImport = typeImports[type]
	return typeImport
		? require(typeImport.import)[typeImport.name]
		: strToPrimitiveType(type)
}