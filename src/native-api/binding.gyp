{
	"targets": [
		{
			"target_name": "framedNative",
			"sources": [ "native-api.cpp" ],
			"libraries": [
				"-lpsapi",
				"-lwtsapi32",
				"-liphlpapi"
			]
		}
	]
}