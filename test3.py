# This Python script will get memory and IO usages
# using the psutil library which seems to provide
# more accurate values than Node.js libraries provide

# Also, Python is so slow :(

import psutil
import json
import os
import time
from datetime import datetime
import sys

if (os.name != 'nt'):
	raise Exception('Framed currently only supports Windows')

if (len(sys.argv) != 2):
	raise Exception('Process ID(s) required')

try:
	pids = [int(s) for s in sys.argv[1].split(',')]
	#print(pids)
except:
	raise Exception('Process ID(s) must be numerical. Received value: ' + sys.argv[1])

#print('start: ' + datetime.now().strftime('%H:%M:%S.%f'))

scriptJSONOutput = {}

for pid in pids:
	jsonOutput = {
		'success': True,
		'mem': 0,
		'memtype': '',
		'ioRead': 0,
		'ioWrite': 0
	}

	try:
		process = psutil.Process(pid)
		#print(process.pid)
		#print(process.name())
	except psutil.NoSuchProcess:
		#print('No such process ' + str(pid))
		scriptJSONOutput['nosuchprocess-' + str(pid)] = {
			"success": False, "message": "No process with that PID"
		}
		continue
	except psutil.AccessDenied:
		scriptJSONOutput[process.name() + '-' + str(process.pid)] = {
			"success": False, "message": "Access denied while attempting to get process information"
		}
		continue
		

	with process.oneshot():
		try:
			meminfo = process.memory_full_info()
		except:
			meminfo = process.memory_info()
		currentMem = jsonOutput['mem']

		jsonOutput['ioRead'] = process.io_counters().read_bytes
		jsonOutput['ioWrite'] = process.io_counters().write_bytes

		if (hasattr(meminfo, 'uss')):
			jsonOutput['mem'] = currentMem + meminfo.uss

			if (jsonOutput['memtype'] == 'rss' or jsonOutput['memtype'] == 'mixed'):
				jsonOutput['memtype'] = 'mixed'
			else:
				jsonOutput['memtype'] = 'uss'

		else:
			jsonOutput['mem'] = currentMem + meminfo.rss

			if (jsonOutput['memtype'] == 'uss' or jsonOutput['memtype'] == 'mixed'):
				jsonOutput['memtype'] = 'mixed'
			else:
				jsonOutput['memtype'] = 'rss'

	#print('end: ' + datetime.now().strftime('%H:%M:%S.%f'))


	#print(json.dumps(jsonOutput))
	scriptJSONOutput[process.name() + '-' + str(process.pid)] = jsonOutput

print(json.dumps(scriptJSONOutput))