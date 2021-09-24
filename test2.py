from __future__ import print_function
import ctypes

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

def GetProcessPrivateUsage():
    mem_struct = PROCESS_MEMORY_COUNTERS_EX()

    #id = Kernel32.GetCurrentProcessId()
    id = 16836
    print_output('GetCurrentProcessId: {}'.format(id))

    handle = Kernel32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, id)
    print_output('GetCurrentProcess: {}'.format(handle))

    b = psapi.GetProcessMemoryInfo(handle, ctypes.byref(mem_struct), ctypes.sizeof(mem_struct))

    print_output('GetProcessMemoryInfo: {}'.format(b))
    return mem_struct.PrivateUsage

def print_output(text):
    print('{}. {}'.format(text, ctypes.FormatError(Kernel32.GetLastError())))

usage = GetProcessPrivateUsage()
print_output('private usage: {}'.format(usage))