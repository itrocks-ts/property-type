import { parse }                   from '@itrocks/ast'
import { type TypeNode }           from '@itrocks/ast'
import { readFileSync }            from 'node:fs'
import { dirname }                from 'node:path'
import { normalize }              from 'node:path'
import { resolve }                from 'node:path'

export type Canonical = BigInt | Boolean | Number | Object | String | Symbol | undefined

type LiteralValue = boolean | number | null | string | undefined

type Type<T extends object = object> = new (...args: unknown[]) => T

export class PropertyType
{
	constructor(public type: Canonical, public optional = false) {}
	get lead() { return this.type }
}

export class CanonicalType extends PropertyType
{
	constructor(type: Canonical) { super(type) }
}

export class CollectionType extends PropertyType
{
	constructor(type: Type, public elementType: PropertyType) { super(type) }
}

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
{
	constructor(public keyType: PropertyType, public elementType: PropertyType) { super(Object) }
}

export class IntersectionType extends CompositeType
{}

export class LiteralType extends PropertyType
{
	constructor(public value: LiteralValue) { super(literalValueType(value)) }
}

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
{
	constructor(public raw: string) { super(undefined) }
}

export type PropertyTypes<T extends object = object, K extends keyof T = keyof T> = Record<K, PropertyType>

type TypeAliases = Record<string, TypeNode>
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

function nodeToCanonicalType(node: TypeNode): CanonicalType | void
{
	if (node.kind !== 'primitive') return
	switch (node.name) {
		case 'bigint':  return new CanonicalType(BigInt)
		case 'boolean': return new CanonicalType(Boolean)
		case 'number':  return new CanonicalType(Number)
		case 'object':  return new CanonicalType(Object)
		case 'string':  return new CanonicalType(String)
		case 'symbol':  return new CanonicalType(Symbol)
	}
}

function nodeToLiteralType(node: TypeNode): LiteralType | void
{
	return (node.kind === 'literal') ? new LiteralType(node.value) : undefined
}

function nodeToType(node: TypeNode, typeImports: TypeImports, typeAliases: TypeAliases): PropertyType
{
	if (node.kind === 'array') {
		return new CollectionType(Array, nodeToType(node.element, typeImports, typeAliases))
	}
	if (node.kind === 'intersection') {
		return new IntersectionType(node.types.map(node => nodeToType(node, typeImports, typeAliases)))
	}
	if (node.kind === 'union') {
		const types = node.types.map(node => nodeToType(node, typeImports, typeAliases))
		return literalUnionToCanonicalType(types) ?? new UnionType(types)
	}
	return nodeToCanonicalType(node)
		?? nodeToLiteralType(node)
		?? nodeToTypeType(node, typeImports, typeAliases)
		?? new UnknownType(node.kind === 'unknown' ? node.raw : '')
}

function nodeToTypeType(
	node: TypeNode,
	typeImports: TypeImports,
	typeAliases: TypeAliases
): RecordType | TypeType | PropertyType | void
{
	if (node.kind !== 'reference') return

	const name = node.name
	const args = node.arguments.map(node => nodeToType(node, typeImports, typeAliases))

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
	const runtimeFile     = resolve(file)
	const declarationFile = runtimeFile.substring(0, runtimeFile.lastIndexOf('.')) + '.d.ts'
	const filePath        = dirname(runtimeFile)
	const module        = parse(readFileSync(declarationFile, 'utf8'), declarationFile)
	const propertyTypes = {} as PropertyTypes<T>
	const typeAliases   = {} as TypeAliases
	const typeImports   = {} as TypeImports

	for (const declaration of module.imports) {
		let importPath = declaration.from
		if ((importPath[0] === '.') && !importPath.endsWith('.js')) {
			importPath += '.js'
		}
		const importFile = (importPath[0] === '.')
			? normalize(filePath + '/' + importPath)
			: importPath
		if (declaration.default) {
			typeImports[declaration.default] = { import: importFile, name: 'default' }
		}
		for (const specifier of declaration.named) {
			typeImports[specifier.local] = { import: importFile, name: specifier.imported }
		}
	}

	for (const declaration of module.declarations) {
		if ((declaration.kind === 'type-alias') && declaration.exported) {
			typeAliases[declaration.name] = declaration.type
		}
		if ((declaration.kind === 'class') && declaration.name && declaration.exported) {
			const className        = declaration.name
			typeImports[className] = { import: runtimeFile, name: className }
			for (const member of declaration.members) {
				if ((member.kind !== 'property') || !member.type || (member.name === undefined)) continue
				const type    = nodeToType(member.type, typeImports, typeAliases)
				type.optional = member.optional
				propertyTypes[member.name as keyof T] = type
			}
		}
	}
	return propertyTypes
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
