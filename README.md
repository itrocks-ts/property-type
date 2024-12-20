[![npm version](https://img.shields.io/npm/v/@itrocks/property-type?logo=npm)](https://www.npmjs.org/package/@itrocks/property-type)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/property-type)](https://www.npmjs.org/package/@itrocks/property-type)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/property-type?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/property-type)
[![issues](https://img.shields.io/github/issues/itrocks-ts/property-type)](https://github.com/itrocks-ts/property-type/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# property-type

Runtime type reflection from TypeScript declaration files for properties.

## Installation

```bash
npm install @itrocks/property-type
```

## Usage example

File `custom-class.ts`:
```bash
export default class CustomClass {}
```

File `demo.ts`:
```bash
import CustomClass           from './custom-class'
import propertyTypesFromFile from './property-type'

export class Something {
	name = 'a string'
	age = 118
	birthDay = new Date('1904-12-20')
	somethingBig = 154543321452000n
	somethingCustom = new CustomClass()
	aCollection = new Array<CustomClass>()
}

const propertyTypes = propertyTypesFromFile(__dirname + '/demo.js')
Object.entries(propertyTypes).forEach(([property, type]) => {
	console.log('-', property, 'type is', type)
})
console.log('is somethingBig a BigInt ?', propertyTypes['somethingBig'] === BigInt)
```

After building and executing the files, the output is:
```
- name type is [Function: String]
- age type is [Function: Number]
- birthDay type is [Function: Date]
- somethingBig type is [Function: BigInt]
- somethingCustom type is [class CustomClass]
- aCollection type is CollectionType {
  containerType: [Function: Array],
  elementType: [class CustomClass]
}
is somethingBig a BigInt ? true
```

## Overview

This library provides utilities to parse TypeScript .d.ts files and extract property types from classes.
It supports both primitive and complex types, including collections, and allows for the mapping of imported types.

**Current limitations:**

In the current version:
- it works only with `.js` files that have a corresponding `.d.ts` TypeScript declaration file in the same location,
- it supports scripts containing a **single class** only,
  aligning with the recommended architecture for [it.rocks](https://it.rocks) domain-driven apps,
- it handles relatively **simple type** expressions, with limited support for complex generics, unions, or intersections,
- the `.d.ts` file is parsed each time the function is called, which can be slightly slow;
  it is up to you to implement **caching** if needed.
- inherited property types are not parsed; handling **inheritance** is left to your implementation.

For a more structured approach, consider using the [it.rocks](https://it.rocks)
reflection library, [@itrocks/reflect](https://www.npmjs.com/package/@itrocks/reflect),
which leverages [propertyTypesFromFile](#propertytypesfromfile)
and additionally handles **caching** and **inheritance**.

## Functions

### propertyTypesFromFile

```ts
function propertyTypesFromFile<T extends object = object>(file: string): PropertyTypes<T>
```
Parses a declaration TypeScript file and extracts property types from the defined class.

**Parameters:**
- `file`: Absolute path to the `.js` file. The `.d.ts` file must be in the same directory.

**Returns:**
`PropertyTypes<T>`: A mapping of property names to their types.

### strToPrimitiveType

```ts
function strToPrimitiveType(type: string): PrimitiveType | Type
```
Converts a string representation of a [primitive type](https://developer.mozilla.org/docs/Glossary/Primitive)
into the corresponding `PrimitiveType`.

This function only works for JavaScript primitive type strings
and does not handle `CollectionType` or custom class `Type`.

## Types

### PrimitiveType

```ts
type PrimitiveType = typeof BigInt | Boolean | Number | Object | String | Symbol | undefined
```
Defines the set of supported primitive types. 

### PropertyType

```ts
type PropertyType<T extends object = object, PT extends object = object> = CollectionType<T, PT> | PrimitiveType | Type<PT>
```
Represents any single property type, either primitive or complex.

### PropertyTypes

```ts
type PropertyTypes<T extends object = object> = Record<string, PropertyType<T>>
```
A mapping of property names to their types.

## Classes

### CollectionType

```ts
class CollectionType<T extends object = object, PT extends object = object> {
	constructor(public containerType: Type<T>, public elementType: PrimitiveType | Type<PT>)
}
```
An instance of `CollectionType` represents a property type that contains multiple elements.

**Properties:**
- `collectionType`: The type of the collection container, such as
  [Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array),
  [Map](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Map),
  or [Set](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Set).
- `elementType`: the type of the elements contained in the collection.
