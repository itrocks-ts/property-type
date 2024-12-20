import CustomClass           from './custom-class'
import propertyTypesFromFile from './property-type'

export class Something {
	name = 'a string'
	age = 118
	birthDay = new Date('1904-12-20')
	somethingBig = 154543321452000n
	somethingCustom = new CustomClass
	aCollection = new Array<CustomClass>()
}

const propertyTypes = propertyTypesFromFile(__dirname + '/demo.js')
Object.entries(propertyTypes).forEach(([property, type]) => {
	console.log('-', property, 'type is', type)
})
console.log('is somethingBig a BigInt ?', propertyTypes['somethingBig'] === BigInt)
