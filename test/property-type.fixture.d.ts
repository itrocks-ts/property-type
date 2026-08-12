import { CustomClass } from './custom-class.fixture.js'

export type Identifier = number | string
export type Status = 'draft' | 'published'

export declare class Something
{
	name: string
	age: number
	birthDay: Date
	somethingBig: bigint
	somethingCustom: CustomClass
	aCollection: Array<CustomClass>
	anotherCollection?: CustomClass[]
	aString?: string
	identifier: Identifier
	status: Status
	literal: 'ready'
	flags: true | false
	metadata: Record<string, number>
	combined: CustomClass & object
	unknown: { nested: string }
	method(): void
}
