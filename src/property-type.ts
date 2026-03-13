import { readFileSync } from 'node:fs'
import { dirname }      from 'node:path'
import { normalize }    from 'node:path'
import ts               from 'typescript'

export type Canonical = BigInt | Boolean | Number | Object | String | Symbol | undefined

type LiteralValue = boolean | number | null | string | undefined

type Type<T extends object = object> = new (...args: unknown[]) => T

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

type DeferredModule = Record<string, Type | undefined>
export class DeferredType<T extends DeferredModule = DeferredModule>
{
	constructor(public module: T, public exportedName: keyof T) {}
	resolve() { return this.module[this.exportedName] }
}

export class RecordType extends PropertyType
{ constructor(public keyType: PropertyType, public elementType: PropertyType) { super(Object) } }

export class IntersectionType extends CompositeType
{}

export class LiteralType extends PropertyType
{ constructor(public value: LiteralValue) { super(literalValueType(value)) } }

export class TypeType extends PropertyType
{
	constructor(type: DeferredType | Type, public args?: PropertyType[]) { super(type) }
	get lead() {
		if ((this.type instanceof DeferredType) && this.type.resolve()) {
			this.type = this.type.resolve()
		}
		return this.type
	}
}

export class UnionType extends CompositeType
{}

export class UnknownType extends PropertyType
{ constructor(public raw: string) { super(undefined) } }

export type PropertyTypes<T extends object = object, K extends keyof T = keyof T> = Record<K, PropertyType>

type TypeAliases = Record<string, ts.TypeNode>
type TypeImports = Record<string, { import: string, name: string }>

function getPropertyName(name: ts.PropertyName): string | undefined
{
	return (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
		? name.text
		: undefined
}

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

function literalUnionToCanonicalType(types: PropertyType[]): CanonicalType | void
{
	if (!types.length) return
	if (!types.every(type => type instanceof LiteralType)) return

	const firstType = types[0].type
	if (firstType === undefined) return

	if (types.every(type => type.type === firstType)) {
		return new CanonicalType(firstType as Canonical)
	}
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

function nodeToType(node: ts.TypeNode, typeImports: TypeImports, typeAliases: TypeAliases): PropertyType
{
	if (ts.isArrayTypeNode(node)) {
		return new CollectionType(Array, nodeToType(node.elementType, typeImports, typeAliases))
	}
	if (ts.isIntersectionTypeNode(node)) {
		return new IntersectionType(node.types.map(node => nodeToType(node, typeImports, typeAliases)))
	}
	if (ts.isUnionTypeNode(node)) {
		const types = node.types.map(node => nodeToType(node, typeImports, typeAliases))
		return literalUnionToCanonicalType(types) ?? new UnionType(types)
	}
	return nodeToCanonicalType(node)
		?? nodeToLiteralType(node)
		?? nodeToTypeType(node, typeImports, typeAliases)
		?? new UnknownType(node.getText())
}

function nodeToTypeType(
	node: ts.TypeNode,
	typeImports: TypeImports,
	typeAliases: TypeAliases
): RecordType | TypeType | PropertyType | void
{
	if (!ts.isTypeReferenceNode(node)) return

	const name = node.typeName.getText()
	const args = node.typeArguments?.map(node => nodeToType(node, typeImports, typeAliases))

	if ((name === 'Record') && (args?.length === 2)) {
		return new RecordType(args[0], args[1])
	}

	const alias = typeAliases[name]
	if (alias) {
		return nodeToType(alias, typeImports, typeAliases)
	}

	return new TypeType(strToType(name, typeImports), args)
}

export function propertyTypesFromFile<T extends object = object>(file: string): PropertyTypes<T>
{
	const content    = readFile(file)
	const filePath   = dirname(file)
	const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true)

	const propertyTypes = {} as PropertyTypes<T>
	const typeAliases   = {} as TypeAliases
	const typeImports   = {} as TypeImports

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
					const alias = importSpecifier.name.getText()
					const name  = importSpecifier.propertyName?.getText() ?? alias
					typeImports[alias] = { import: importFile, name }
				}
			}
		}

		if (
			ts.isTypeAliasDeclaration(node)
			&& node.name
			&& node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
		) {
			typeAliases[node.name.getText()] = node.type
		}

		if (
			ts.isClassDeclaration(node)
			&& node.name
			&& node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
		) {
			const className        = node.name.getText()
			typeImports[className] = { import: file, name: className }
			for (const member of node.members) {
				if (!ts.isPropertyDeclaration(member) || !member.type) continue
				const type    = nodeToType(member.type, typeImports, typeAliases)
				type.optional = !!member.questionToken
				propertyTypes[getPropertyName(member.name) as keyof T] = type
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
		console.error('property-type: error reading file', file)
		throw exception
	}
}

function strToType(type: string, typeImports: TypeImports): DeferredType | Type
{
	const typeImport = typeImports[type]
	if (typeImport) {
		const required     = require(typeImport.import)
		const importedType = required[typeImport.name]
		return (importedType === undefined)
			? new DeferredType(required, typeImport.name)
			: importedType
	}
	return (globalThis as any)[type]
}
