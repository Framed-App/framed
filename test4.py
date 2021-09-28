import psutil
from datetime import datetime

def get_process_list():
	process_list = []
	for p in psutil.process_iter():
		mem = p.memory_info()

		proc = {
			'pid': p.pid,
			'name': p.name(),
			'mem_rss': mem.rss,
		}
		process_list.append(proc)

	return process_list

print('start: ' + datetime.now().strftime('%H:%M:%S.%f'))
get_process_list()
print('end: ' + datetime.now().strftime('%H:%M:%S.%f'))