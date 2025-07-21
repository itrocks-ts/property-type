import { Type }               from '@itrocks/class-type'
import { readFileSync }       from 'node:fs'
import { dirname, normalize } from 'node:path'
import ts                     from 'typescript'

type LiteralValue = boolean | number | null | string | undefined

export type Canonical = BigInt | Boolean | Number | Object | String | Symbol | undefined

export class PropertyType
{
	constructor(public type: Canonical, public optional = false) {}
	get lead() { return this.type }
}

export class CanonicalType extends PropertyType
{ constructor(type: Canonical) { super(type) } }

export class CollectionType extends PropertyType
{ constructor(type: Type, public elementType: PropertyType) { super(type) } }

export class CompositeType extends PropertyType
{
	constructor(public types: PropertyType[]) { super(types[0].type) }
	get lead() { return this.types[0].lead }
}

export class RecordType extends PropertyType
{ constructor(public keyType: PropertyType, public elementType: PropertyType) { super(Object) } }

export class IntersectionType extends CompositeType
{}

export class LiteralType extends PropertyType
{ constructor(public value: LiteralValue) { super(literalValueType(value)) } }

export class TypeType extends PropertyType
{ constructor(type: Type, public args?: PropertyType[]) { super(type) } }

export class UnionType extends CompositeType
{}

export class UnknownType extends PropertyType
{
	constructor(public raw: string) { super(undefined) }
}

export type PropertyTypes = Record<string, PropertyType>

type TypeImports = Record<string, { import: string, name: string }>

export function isCanonical(propertyType: PropertyType, type?: Canonical): boolean
{
	return (propertyType instanceof CanonicalType) && ((arguments.length === 1) || (propertyType.type === type))
}

export function isLiteral(propertyType: PropertyType, literal?: LiteralValue): boolean
{
	return (propertyType instanceof LiteralType) && ((arguments.length === 1) || (propertyType.value === literal))
}

export function isType(propertyType: PropertyType, type?: Type): boolean
{
	return (propertyType instanceof TypeType) && ((arguments.length === 1) || (propertyType.type === type))
}

function literalValueType(literal: LiteralValue)
{
	switch (typeof literal) {
		case 'bigint':  return BigInt
		case 'boolean': return Boolean
		case 'number':  return Number
		case 'string':  return String
		case 'symbol':  return Symbol
	}
}

function nodeToCanonicalType(node: ts.TypeNode): CanonicalType | void
{
	const kind  = node.kind
	const kinds = ts.SyntaxKind
	switch (kind) {
		case kinds.BigIntKeyword:  return new CanonicalType(BigInt)
		case kinds.BooleanKeyword: return new CanonicalType(Boolean)
		case kinds.NumberKeyword:  return new CanonicalType(Number)
		case kinds.ObjectKeyword:  return new CanonicalType(Object)
		case kinds.StringKeyword:  return new CanonicalType(String)
		case kinds.SymbolKeyword:  return new CanonicalType(Symbol)
	}
}

function nodeToLiteralType(node: ts.TypeNode): LiteralType | void
{
	if (!ts.isLiteralTypeNode(node)) return
	const kinds   = ts.SyntaxKind
	const literal = node.literal
	switch (literal.kind) {
		case kinds.FalseKeyword:     return new LiteralType(false)
		case kinds.NullKeyword:      return new LiteralType(null)
		case kinds.TrueKeyword:      return new LiteralType(true)
		case kinds.UndefinedKeyword: return new LiteralType(undefined)
	}
	if (ts.isNumericLiteral(literal)) {
		return new LiteralType(+literal.text)
	}
	if (ts.isStringLiteral(literal)) {
		return new LiteralType(literal.text)
	}
}

function nodeToType(node: ts.TypeNode, typeImports: TypeImports): PropertyType
{
	if (ts.isArrayTypeNode(node)) {
		return new CollectionType(Array, nodeToType(node.elementType, typeImports))
	}
	if (ts.isIntersectionTypeNode(node)) {
		return new IntersectionType(node.types.map(node => nodeToType(node, typeImports)))
	}
	if (ts.isUnionTypeNode(node)) {
		return new UnionType(node.types.map(node => nodeToType(node, typeImports)))
	}
	return nodeToCanonicalType(node)
		?? nodeToLiteralType(node)
		?? nodeToTypeType(node, typeImports)
		?? new UnknownType(node.getText())
}

function nodeToTypeType(node: ts.TypeNode, typeImports: TypeImports): RecordType | TypeType | void
{
	if (!ts.isTypeReferenceNode(node)) return
	const name = node.typeName.getText()
	const args = node.typeArguments?.map(node => nodeToType(node, typeImports))
	return ((name === 'Record') && (args?.length === 2))
		? new RecordType(args[0], args[1])
		: new TypeType(strToType(name, typeImports), args)
}

export function propertyTypesFromFile(file: string): PropertyTypes
{
	const content    = readFile(file)
	const filePath   = dirname(file)
	const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true)

	const propertyTypes: PropertyTypes = {}
	const typeImports:   TypeImports   = {}

	function parseNode(node: ts.Node)
	{
		if (ts.isImportDeclaration(node) && node.importClause) {
			let importPath = (node.moduleSpecifier as ts.StringLiteral).text
			if ((importPath[0] === '.') && !importPath.endsWith('.js')) {
				importPath += '.js'
			}
			const importFile = (importPath[0] === '.')
				? normalize(filePath + '/' + importPath)
				: importPath
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

		if (
			ts.isClassDeclaration(node)
			&& node.name
			&& node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
		) {
			const className        = node.name.getText()
			typeImports[className] = { import: file, name: className }
			for (const member of node.members) {
				if (ts.isPropertyDeclaration(member) && member.type) {
					const type    = nodeToType(member.type, typeImports)
					type.optional = !!member.questionToken
					propertyTypes[(member.name as ts.Identifier).text] = type
				}
			}
			return
		}

		ts.forEachChild(node, parseNode)
	}

	parseNode(sourceFile)
	return propertyTypes
}

function readFile(file: string)
{
	try {
		return readFileSync(file.substring(0, file.lastIndexOf('.')) + '.d.ts', 'utf8')
	}
	catch (exception) {
		console.error('file', file)
		throw exception
	}
}

function strToType(type: string, typeImports: TypeImports): Type
{
	const typeImport = typeImports[type]
	return typeImport
		? require(typeImport.import)[typeImport.name]
		: (globalThis as any)[type]
}
