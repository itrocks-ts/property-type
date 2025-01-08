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

(async () =>
{

	const propertyTypes = await propertyTypesFromFile(__dirname + '/demo.js')
	Object.entries(propertyTypes).forEach(
		([property, type]) => console.log('-', property, 'is a', type)
	)
	console.log('is name a String ?', propertyTypes['name'] === String)
	console.log('is age a Number ?', propertyTypes['age'] === Number)
	console.log('is birthday a Date ?', propertyTypes['birthDay'] === Date)
	console.log('is somethingBig a BigInt ?', propertyTypes['somethingBig'] === BigInt)
	console.log('is somethingCustom a CustomClass ?', propertyTypes['somethingCustom'] === CustomClass)

})()
