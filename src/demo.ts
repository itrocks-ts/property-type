import { CustomClass }           from './custom-class'
import { isCanonical }           from './property-type'
import { isType }                from './property-type'
import { propertyTypesFromFile } from './property-type'

export class Something {
	name = 'a string'
	age = 118
	birthDay = new Date('1904-12-20')
	somethingBig = 154543321452000n
	somethingCustom = new CustomClass
	aCollection = new Array<CustomClass>()
	anotherCollection?: CustomClass[]
	aString?: string
}

const propertyTypes = propertyTypesFromFile(__dirname + '/demo.js')
Object.entries(propertyTypes).forEach(
	([property, type]) => console.log('-', property, 'is a', type)
)
console.log('is name a String ?', isCanonical(propertyTypes['name'], String))
console.log('is age a Number ?', isCanonical(propertyTypes['age'], Number))
console.log('is birthday a Date ?', isType(propertyTypes['birthDay'], Date))
console.log('is somethingBig a BigInt ?', isCanonical(propertyTypes['somethingBig'], BigInt))
console.log('is somethingCustom a CustomClass ?', isType(propertyTypes['somethingCustom'], CustomClass))
console.log('is aString optional', propertyTypes['aString'].optional)
