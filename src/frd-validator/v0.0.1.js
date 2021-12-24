const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

const schema = {
	type: 'object',
	additionalProperties: false,
	patternProperties: {
		'^[0-9]+$': {
			type: 'object',
			properties: {
				timestamp: { type: 'number' },
				frames: { type: 'number' },
				pings: {
					type: 'object',
					properties: {
						twitch: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									average: { type: 'number' },
								},
								required: ['name', 'average']
							}
						},
						google: { type: 'number' },
						truewinter: { type: 'number' },
						framed: { type: 'number' }
					},
					required: ['twitch', 'google', 'truewinter', 'framed']
				},
				processes: { type: 'object' }, // Not yet implemented
				system: {
					type: 'object',
					properties: {
						memory: {
							type: 'object',
							properties: {
								memTotal: { type: 'number' },
								memUsed: { type: 'number' }
							},
							required: ['memTotal', 'memUsed']
						},
						network: {
							type: 'object',
							properties: {
								inBytes: { type: 'number' },
								outBytes: { type: 'number' },
								inErrors: { type: 'number' },
								outErrors: { type: 'number' },
								inDiscards: { type: 'number' },
								outDiscards: { type: 'number' }
							},
							required: ['inBytes', 'outBytes', 'inErrors', 'outErrors', 'inDiscards', 'outDiscards']
						},
						disk: {
							type: 'object',
							properties: {
								read: { type: 'number' },
								write: { type: 'number' }
							},
							required: ['read', 'write']
						},
						cpu: {
							type: 'object',
							properties: {
								percentage: { type: 'number' }
							},
							required: ['percentage']
						}
					},
					required: ['memory', 'network', 'disk', 'cpu']
				}
			},
			required: ['timestamp', 'frames', 'pings', 'processes', 'system']
		}
	}
};

function validate(data) {
	var validate = ajv.compile(schema);
	var valid = validate(data);

	if (valid) {
		return { valid: true, message: 'Valid' };
	} else {
		return {
			valid: false,
			message: ajv.errorsText(validate.errors)
		};
	}
}

module.exports.validate = validate;