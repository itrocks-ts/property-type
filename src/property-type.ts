import { dirname }                from 'node:path'
import { normalize }              from 'node:path'
import { resolve }                from 'node:path'
import { isArrayTypeNode }        from 'typescript/unstable/ast'
import { isClassDeclaration }     from 'typescript/unstable/ast'
import { isIdentifier }           from 'typescript/unstable/ast'
import { isImportDeclaration }    from 'typescript/unstable/ast'
import { isIntersectionTypeNode } from 'typescript/unstable/ast'
import { isLiteralTypeNode }      from 'typescript/unstable/ast'
import { isNamedImports }         from 'typescript/unstable/ast'
import { isNumericLiteral }       from 'typescript/unstable/ast'
import { isPropertyDeclaration }  from 'typescript/unstable/ast'
import { isStringLiteral }        from 'typescript/unstable/ast'
import { isTypeAliasDeclaration } from 'typescript/unstable/ast'
import { isTypeReferenceNode }    from 'typescript/unstable/ast'
import { isUnionTypeNode }        from 'typescript/unstable/ast'
import { type Node }              from 'typescript/unstable/ast'
import { type PropertyName }      from 'typescript/unstable/ast'
import { SyntaxKind }             from 'typescript/unstable/ast'
import { type TypeNode }          from 'typescript/unstable/ast'
import { API }                    from 'typescript/unstable/sync'

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

type TypeAliases = Record<string, TypeNode>
type TypeImports = Record<string, { import: string, name: string }>

function getPropertyName(name: PropertyName): string | undefined
{
	return (isIdentifier(name) || isStringLiteral(name) || isNumericLiteral(name))
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

function nodeToCanonicalType(node: TypeNode): CanonicalType | void
{
	const kind  = node.kind
	const kinds = SyntaxKind
	switch (kind) {
		case kinds.BigIntKeyword:  return new CanonicalType(BigInt)
		case kinds.BooleanKeyword: return new CanonicalType(Boolean)
		case kinds.NumberKeyword:  return new CanonicalType(Number)
		case kinds.ObjectKeyword:  return new CanonicalType(Object)
		case kinds.StringKeyword:  return new CanonicalType(String)
		case kinds.SymbolKeyword:  return new CanonicalType(Symbol)
	}
}

function nodeToLiteralType(node: TypeNode): LiteralType | void
{
	if (!isLiteralTypeNode(node)) return
	const kinds   = SyntaxKind
	const literal = node.literal
	switch (literal.kind) {
		case kinds.FalseKeyword:     return new LiteralType(false)
		case kinds.NullKeyword:      return new LiteralType(null)
		case kinds.TrueKeyword:      return new LiteralType(true)
		case kinds.UndefinedKeyword: return new LiteralType(undefined)
	}
	if (isNumericLiteral(literal)) {
		return new LiteralType(+literal.text)
	}
	if (isStringLiteral(literal)) {
		return new LiteralType(literal.text)
	}
}

function nodeToType(node: TypeNode, typeImports: TypeImports, typeAliases: TypeAliases): PropertyType
{
	if (isArrayTypeNode(node)) {
		return new CollectionType(Array, nodeToType(node.elementType, typeImports, typeAliases))
	}
	if (isIntersectionTypeNode(node)) {
		return new IntersectionType(node.types.map(node => nodeToType(node, typeImports, typeAliases)))
	}
	if (isUnionTypeNode(node)) {
		const types = node.types.map(node => nodeToType(node, typeImports, typeAliases))
		return literalUnionToCanonicalType(types) ?? new UnionType(types)
	}
	return nodeToCanonicalType(node)
		?? nodeToLiteralType(node)
		?? nodeToTypeType(node, typeImports, typeAliases)
		?? new UnknownType(node.getText())
}

function nodeToTypeType(
	node: TypeNode,
	typeImports: TypeImports,
	typeAliases: TypeAliases
): RecordType | TypeType | PropertyType | void
{
	if (!isTypeReferenceNode(node)) return

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
	const runtimeFile     = resolve(file)
	const declarationFile = runtimeFile.substring(0, runtimeFile.lastIndexOf('.')) + '.d.ts'
	const filePath        = dirname(runtimeFile)
	const api             = new API({ cwd: filePath })

	try {
		const snapshot   = api.updateSnapshot({ openFiles: [declarationFile] })
		const project    = snapshot.getDefaultProjectForFile(declarationFile)
		const sourceFile = project?.program.getSourceFile(declarationFile)
		if (!sourceFile) {
			throw new Error('TypeScript could not parse declaration file: ' + declarationFile)
		}

		const propertyTypes = {} as PropertyTypes<T>
		const typeAliases   = {} as TypeAliases
		const typeImports   = {} as TypeImports

		function parseNode(node: Node)
		{
			if (isImportDeclaration(node) && node.importClause && isStringLiteral(node.moduleSpecifier)) {
				let importPath = node.moduleSpecifier.text
				if ((importPath[0] === '.') && !importPath.endsWith('.js')) {
					importPath += '.js'
				}
				const importFile = (importPath[0] === '.')
					? normalize(filePath + '/' + importPath)
					: importPath
				if (node.importClause.name) {
					typeImports[node.importClause.name.text] = { import: importFile, name: 'default' }
				}
				const namedBindings = node.importClause.namedBindings
				if (namedBindings && isNamedImports(namedBindings)) {
					for (const importSpecifier of namedBindings.elements) {
						const alias = importSpecifier.name.text
						const name  = importSpecifier.propertyName?.text ?? alias
						typeImports[alias] = { import: importFile, name }
					}
				}
			}

			if (
				isTypeAliasDeclaration(node)
				&& node.modifiers?.some(modifier => modifier.kind === SyntaxKind.ExportKeyword)
			) {
				typeAliases[node.name.text] = node.type
			}

			if (
				isClassDeclaration(node)
				&& node.name
				&& node.modifiers?.some(modifier => modifier.kind === SyntaxKind.ExportKeyword)
			) {
				const className        = node.name.text
				typeImports[className] = { import: runtimeFile, name: className }
				for (const member of node.members) {
					if (!isPropertyDeclaration(member) || !member.type) continue
					const propertyName = getPropertyName(member.name)
					if (propertyName === undefined) continue
					const type    = nodeToType(member.type, typeImports, typeAliases)
					type.optional = member.postfixToken?.kind === SyntaxKind.QuestionToken
					propertyTypes[propertyName as keyof T] = type
				}
				return
			}

			node.forEachChild(parseNode)
		}

		parseNode(sourceFile)
		return propertyTypes
	}
	finally {
		api.close()
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
