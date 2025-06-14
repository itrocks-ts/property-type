import { CustomClass }           from './custom-class'
import { isPrimitive }           from './property-type'
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
console.log('is name a String ?', isPrimitive(propertyTypes['name'], String))
console.log('is age a Number ?', isPrimitive(propertyTypes['age'], Number))
console.log('is birthday a Date ?', isType(propertyTypes['birthDay'], Date))
console.log('is somethingBig a BigInt ?', isPrimitive(propertyTypes['somethingBig'], BigInt))
console.log('is somethingCustom a CustomClass ?', isType(propertyTypes['somethingCustom'], CustomClass))
console.log('is aString optional', propertyTypes['aString'].optional)
