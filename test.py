import psutil

pids = psutil.pids()

# TODO: Ensure the actual process is used (PIDs can be re-assigned)

for p in pids:
	process = psutil.Process(p)
	if process.name() == 'firefox.exe':
		print(process.name() + ' (' + str(p) + ')')
		print(process.memory_full_info())