# This Python script will get memory and IO usages
# using the psutil library which seems to provide
# more accurate values than Node.js libraries provide

# Also, Python is so slow :(

import psutil
import json
import os
import time
from datetime import datetime

if (os.name != 'nt'):
	raise Exception('Framed currently only supports Windows')

previousIOCounters = {}

def testTime():
	print('start: ' + datetime.now().strftime('%H:%M:%S.%f'))
	testJSON = {}
	pids = iter(psutil.process_iter(['pid', 'name', 'io_counters', 'memory_info', 'memory_full_info']))
	for p in pids:
		with p.oneshot():
			testJSON[p.name() + '-' + str(p.pid)] = {
				'mem': p.memory_info().rss,
				'ioRead': p.io_counters().read_bytes,
				'ioWrite': p.io_counters().write_bytes
			}
	print('end: ' + datetime.now().strftime('%H:%M:%S.%f'))

def getProcesses():
	print('start: ' + datetime.now().strftime('%H:%M:%S.%f'))
	jsonOutput = {}
	ignoreList = ['System Idle Process']
	onlyList = ['ShareX.exe']

	#pids = iter(psutil.process_iter(['pid', 'name', 'io_counters', 'memory_info', 'memory_full_info']))
	pids = [psutil.Process(8848)]

	for process in pids:
		with process.oneshot():
			if (process.name() not in onlyList):
				continue
			if (process.name() not in jsonOutput):
				#print('Creating new object for ' + process.name())
				jsonOutput[process.name()] = {
					'mem': 0,
					'memtype': '',
					'ioRead': 0,
					'ioWrite': 0
				}

			if (process.name() + '-' + str(process.pid) not in previousIOCounters):
				previousIOCounters[process.name() + '-' + str(process.pid)] = {
					'ioRead': process.io_counters().read_bytes,
					'ioWrite': process.io_counters().write_bytes
				}
			
			#print(process.name() + ' (' + str(process.pid) + ')')
			try:
				meminfo = process.memory_full_info()
			except:
				meminfo = process.memory_info()
			currentMem = jsonOutput[process.name()]['mem']
			currentIORead = jsonOutput[process.name()]['ioRead'] - previousIOCounters[process.name() + '-' + str(process.pid)]['ioRead']
			currentIOWrite = jsonOutput[process.name()]['ioWrite'] - previousIOCounters[process.name() + '-' + str(process.pid)]['ioWrite']

			jsonOutput[process.name()]['ioRead'] = currentIORead + process.io_counters().read_bytes
			jsonOutput[process.name()]['ioWrite'] = currentIOWrite + process.io_counters().write_bytes

			previousIOCounters[process.name() + '-' + str(process.pid)]['ioRead'] = process.io_counters().read_bytes
			previousIOCounters[process.name() + '-' + str(process.pid)]['ioWrite'] = process.io_counters().write_bytes

			if (hasattr(meminfo, 'uss')):
				jsonOutput[process.name()]['mem'] = currentMem + meminfo.uss

				if ('memtype' in jsonOutput[process.name()]):
					if (jsonOutput[process.name()]['memtype'] != 'uss'):
						jsonOutput[process.name()]['memtype'] = 'mixed'
				else:
					jsonOutput[process.name()]['memtype'] = 'uss'

				#print('uss: ' + str(meminfo.uss))
			else:
				jsonOutput[process.name()]['mem'] = currentMem + meminfo.rss

				if ('memtype' in jsonOutput[process.name()]):
					if (jsonOutput[process.name()]['memtype'] != 'rss'):
						jsonOutput[process.name()]['memtype'] = 'mixed'
				else:
					jsonOutput[process.name()]['memtype'] = 'rss'
				#print('rss: ' + str(meminfo.rss))

			if (process.name() == 'ShareX.exe'):
				#print(process.memory_full_info().uss)
				#print(process.io_counters())
				#print(datetime.now().strftime('%H:%M:%S'))
				print(jsonOutput[process.name()])
				#print(previousIOCounters[process.name() + '-' + str(process.pid)]['ioWrite'])
				#print(process.io_counters().write_bytes);
				#print('---')
				#print(previousIOCounters[process.name() + '-' + str(process.pid)])

	print('start: ' + datetime.now().strftime('%H:%M:%S.%f'))

	#for p in jsonOutput:
		#previousIOCounters[p]['ioRead'] = jsonOutput[p]['ioRead']
		#previousIOCounters[p]['ioWrite'] = jsonOutput[p]['ioWrite']

		#if (p == 'ShareX.exe'):
			#print(previousIOCounters[p])
			#print(jsonOutput[p])

	#print(json.dumps(jsonOutput))
	#print(jsonOutput['ShareX.exe'])
	#print(json.dumps(previousIOCounters))


'''testTime()
time.sleep(1)
testTime()
time.sleep(1)
testTime()'''

getProcesses()
'''time.sleep(1)
getProcesses()
time.sleep(1)
getProcesses()
#time.sleep(1)
getProcesses()
time.sleep(1)
getProcesses()
time.sleep(1)
getProcesses()
time.sleep(1)
getProcesses()
time.sleep(1)
getProcesses()
time.sleep(1)
getProcesses()
time.sleep(1)
'''