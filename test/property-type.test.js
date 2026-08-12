const assert = require('node:assert/strict')
const { join } = require('node:path')
const { test } = require('node:test')

const { CustomClass } = require('./custom-class.fixture.js')
const {
	CanonicalType,
	CollectionType,
	IntersectionType,
	LiteralType,
	RecordType,
	TypeType,
	UnionType,
	UnknownType,
	isCanonical,
	isLiteral,
	isType,
	propertyTypesFromFile
} = require('../cjs/property-type.js')

const fixtureFile = join(__dirname, 'property-type.fixture.js')

test('reads the canonical and class types from the former demo', () =>
{
	const types = propertyTypesFromFile(fixtureFile)

	assert.ok(types.name instanceof CanonicalType)
	assert.ok(isCanonical(types.name, String))
	assert.ok(isCanonical(types.age, Number))
	assert.ok(isCanonical(types.somethingBig, BigInt))
	assert.ok(isType(types.birthDay, Date))
	assert.ok(isType(types.somethingCustom, CustomClass))
})

test('reads generic and shorthand collections', () =>
{
	const types = propertyTypesFromFile(fixtureFile)

	assert.ok(types.aCollection instanceof TypeType)
	assert.equal(types.aCollection.lead, Array)
	assert.equal(types.aCollection.args.length, 1)
	assert.ok(isType(types.aCollection.args[0], CustomClass))

	assert.ok(types.anotherCollection instanceof CollectionType)
	assert.equal(types.anotherCollection.lead, Array)
	assert.ok(isType(types.anotherCollection.elementType, CustomClass))
})

test('marks optional properties without changing their type', () =>
{
	const types = propertyTypesFromFile(fixtureFile)

	assert.equal(types.name.optional, false)
	assert.equal(types.aString.optional, true)
	assert.ok(isCanonical(types.aString, String))
	assert.equal(types.anotherCollection.optional, true)
})

test('resolves aliases and homogeneous literal unions', () =>
{
	const types = propertyTypesFromFile(fixtureFile)

	assert.ok(types.identifier instanceof UnionType)
	assert.deepEqual(types.identifier.types.map(type => type.lead), [Number, String])
	assert.ok(isCanonical(types.status, String))
	assert.ok(isCanonical(types.flags, Boolean))
	assert.ok(types.literal instanceof LiteralType)
	assert.ok(isLiteral(types.literal, 'ready'))
})

test('reads records, intersections and unsupported syntax', () =>
{
	const types = propertyTypesFromFile(fixtureFile)

	assert.ok(types.metadata instanceof RecordType)
	assert.ok(isCanonical(types.metadata.keyType, String))
	assert.ok(isCanonical(types.metadata.elementType, Number))
	assert.ok(types.combined instanceof IntersectionType)
	assert.ok(isType(types.combined.types[0], CustomClass))
	assert.ok(isCanonical(types.combined.types[1], Object))
	assert.ok(types.unknown instanceof UnknownType)
	assert.equal(types.unknown.raw, '{ nested: string }')
})

test('only includes typed properties', () =>
{
	const types = propertyTypesFromFile(fixtureFile)

	assert.equal('method' in types, false)
})

test('type predicates accept an omitted expected value', () =>
{
	const types = propertyTypesFromFile(fixtureFile)

	assert.equal(isCanonical(types.name), true)
	assert.equal(isCanonical(types.birthDay), false)
	assert.equal(isType(types.birthDay), true)
	assert.equal(isLiteral(types.literal), true)
})
