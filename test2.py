from __future__ import print_function
import ctypes
import sys

if (len(sys.argv) != 2):
	raise Exception('Process ID(s) required')

try:
	pids = [int(s) for s in sys.argv[1].split(',')]
	#print(pids)
except:
	raise Exception('Process ID(s) must be numerical. Received value: ' + sys.argv[1])

psapi = ctypes.windll.psapi
Kernel32 = ctypes.windll.Kernel32

PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010

class PROCESS_MEMORY_COUNTERS_EX(ctypes.Structure):
	_fields_ = [("cb", ctypes.c_ulong),
				("PageFaultCount", ctypes.c_ulong),
				("PeakWorkingSetSize", ctypes.c_size_t),
				("WorkingSetSize", ctypes.c_size_t),
				("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
				("QuotaPagedPoolUsage", ctypes.c_size_t),
				("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
				("QuotaNonPagedPoolUsage", ctypes.c_size_t),
				("PagefileUsage", ctypes.c_size_t),
				("PeakPagefileUsage", ctypes.c_size_t),
				("PrivateUsage", ctypes.c_size_t),
				]

def GetProcessPrivateUsage(id):
	mem_struct = PROCESS_MEMORY_COUNTERS_EX()
	handle = Kernel32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, id)
	if (handle == 0):
		return None
	b = psapi.GetProcessMemoryInfo(handle, ctypes.byref(mem_struct), ctypes.sizeof(mem_struct))
	if (b == 0):
		return None

	return {
		'PageFaultCount': mem_struct.PageFaultCount,
		'PeakWorkingSetSize': mem_struct.PeakWorkingSetSize,
		'WorkingSetSize': mem_struct.WorkingSetSize,
		'QuotaPeakPagedPoolUsage': mem_struct.QuotaPeakPagedPoolUsage,
		'QuotaPagedPoolUsage': mem_struct.QuotaPagedPoolUsage,
		'QuotaPeakNonPagedPoolUsage': mem_struct.QuotaPeakNonPagedPoolUsage,
		'QuotaNonPagedPoolUsage': mem_struct.QuotaNonPagedPoolUsage,
		'PagefileUsage': mem_struct.PagefileUsage,
		'PeakPagefileUsage': mem_struct.PeakPagefileUsage,
		'PrivateUsage': mem_struct.PrivateUsage
	}

for pid in pids:
	usage = GetProcessPrivateUsage(pid)
	print('private usage: {}'.format(usage))