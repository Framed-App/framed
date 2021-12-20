// Modified from psutil (https://github.com/giampaolo/psutil)
// and StackOverflow

// The psutil library mentioned above was the only way to effectively 
// get the private working set values shown in the task manager.
// Unfortunately, Python was too slow for code that needed to run once a second,
// so, with my limited (actually, non-existent) C++ knowledge,
// I ported only the needed code into a standalone executable.
// Yes, it's shit code. But it meets my requirements for this project:
// - Runs in less than a second
//   + My tests indicate that it runs in around 500-700ms (with many processes running)
//     or around 330ms (with few processes running), not great but still acceptable.
//     The Node.js file that runs the executable has code to detect if it takes longer than 1 second,
//     and waits until it's done before running again. An average value is shown to the user in this case.
//   + I could get the psutil library to run faster by splitting the processes into 10 equal
//     length arrays and running 10 instances of a Python script, but this caused high CPU usage
// - Doesn't require admin
//   + In fact, it will quit if run as admin. See main function for more info
// - ~~Doesn't use much CPU~~ Actually, it does :( See comments in main() for more information
//   + This is probably the most important requirement. The whole purpose of Framed is
//     to help streamers find the cause of dropped frames. The most common causes for this are
//     network issues, high network usage, and high CPU usage. Wouldn't want Framed to be causing
//     any of those.
// - The user doesn't need to install any other programs
//   + With the Python approach, the user would need to install Python and add it to their path for
//     it to be usable. The other alternative was including all the required Python files with the Framed app,
//     but this was undesirable for multiple reasons
// PS: Are you a C++ developer with knowledge of Windows APIs (and possibly Node.js native modules)?
//     I could use some help improving this code and making it run even faster. Initially, this was
//     intended to be a Node.js native module, but I had issues getting that working so made it
//     a standalone executable.

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <iostream>
#include <node.h>
#include <windows.h>
#include <stdio.h>
#include <psapi.h>
#include <string>
#include <wtsapi32.h>
#include <cstdlib>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <netioapi.h>
#include <winioctl.h>
#include <tlhelp32.h>
#include <vector>
#include <ctime>
#include <chrono>
#include <cmath>
#include <string>
//#include <d3dkmthk.h>
//#include <cfgmgr32.h>

#pragma comment(lib, "iphlpapi.lib")
//#pragma comment(lib, "netio.lib")

// memory_uss()
typedef struct _MEMORY_WORKING_SET_BLOCK {
    ULONG_PTR Protection : 5;
    ULONG_PTR ShareCount : 3;
    ULONG_PTR Shared : 1;
    ULONG_PTR Node : 3;
#ifdef _WIN64
    ULONG_PTR VirtualPage : 52;
#else
    ULONG VirtualPage : 20;
#endif
} MEMORY_WORKING_SET_BLOCK, *PMEMORY_WORKING_SET_BLOCK;

// memory_uss()
typedef struct _MEMORY_WORKING_SET_INFORMATION {
    ULONG_PTR NumberOfEntries;
    MEMORY_WORKING_SET_BLOCK WorkingSetInfo[1];
} MEMORY_WORKING_SET_INFORMATION, *PMEMORY_WORKING_SET_INFORMATION;

// memory_uss()
typedef struct _PSUTIL_PROCESS_WS_COUNTERS {
    SIZE_T NumberOfPages;
    SIZE_T NumberOfPrivatePages;
    SIZE_T NumberOfSharedPages;
    SIZE_T NumberOfShareablePages;
} PSUTIL_PROCESS_WS_COUNTERS, *PPSUTIL_PROCESS_WS_COUNTERS;

#define MALLOC(x) HeapAlloc(GetProcessHeap(), 0, (x))
#define MALLOC_ZERO(x) HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, (x))
#define FREE(x) HeapFree(GetProcessHeap(), 0, (x))

#undef  MemoryWorkingSetInformation
#define MemoryWorkingSetInformation 0x1

SYSTEM_INFO PSUTIL_SYSTEM_INFO;

#define NTSTATUS LONG
#define NT_SUCCESS(Status) (((NTSTATUS)(Status)) >= 0)
// https://github.com/ajkhoury/TestDll/blob/master/nt_ddk.h
#define STATUS_INFO_LENGTH_MISMATCH ((NTSTATUS)0xC0000004L)
#define STATUS_BUFFER_TOO_SMALL ((NTSTATUS)0xC0000023L)
#define STATUS_ACCESS_DENIED ((NTSTATUS)0xC0000022L)
#define STATUS_NOT_FOUND ((NTSTATUS)0xC0000225L)
#define STATUS_BUFFER_OVERFLOW ((NTSTATUS)0x80000005L)

// This was for added displaying network interface names. Keeping it for future use
// https://stackoverflow.com/a/5165240
#if defined(UNICODE) || defined(_UNICODE)
#define tcout std::wcout
#else
#define tcout std::cout
#endif


typedef enum _MEMORY_INFORMATION_CLASS {
    MemoryBasicInformation
} MEMORY_INFORMATION_CLASS, *PMEMORY_INFORMATION_CLASS;

typedef NTSTATUS(NTAPI *PNTAPI)(
    HANDLE ProcessHandle, 
    PVOID BaseAddress,
    int MemoryInformationClass, 
    PVOID Buffer, 
    SIZE_T Length, 
    PSIZE_T ResultLength
);

PNTAPI NtQueryVirtualMemory = (PNTAPI)GetProcAddress(GetModuleHandle("ntdll.dll"), "NtQueryVirtualMemory");

// https://stackoverflow.com/a/42126277
// Return 1 if PID exists, 0 if not, -1 on error.
int
pid_in_pids(DWORD pid) {
   WTS_PROCESS_INFO* processes = NULL;
   DWORD count = 0;

   if (WTSEnumerateProcesses(WTS_CURRENT_SERVER_HANDLE, NULL, 1, &processes, &count)) {
	   for (DWORD i = 0; i < count; i++) {
		   if (processes[i].ProcessId == pid) {
			   return 1;
		   }
	   }
   }

   if (processes) {
	   WTSFreeMemory(processes);
	   processes = NULL;
   }

   return 0;
}

// Given a process handle checks whether it's actually running. If it
// does return the handle, else return NULL with Python exception set.
// This is needed because OpenProcess API sucks.
HANDLE
psutil_check_phandle(HANDLE hProcess, DWORD pid, int check_exit_code) {
    DWORD exitCode;

    if (hProcess == NULL) {
        if (GetLastError() == ERROR_INVALID_PARAMETER) {
            // Yeah, this is the actual error code in case of
            // "no such process".
            //NoSuchProcess("OpenProcess -> ERROR_INVALID_PARAMETER");
            return NULL;
        }
        if (GetLastError() == ERROR_SUCCESS) {
            // Yeah, it's this bad.
            // https://github.com/giampaolo/psutil/issues/1877
            if (pid_in_pids(pid) == 1) {
                //psutil_debug("OpenProcess -> ERROR_SUCCESS turned into AD");
                //AccessDenied("OpenProcess -> ERROR_SUCCESS");
            }
            else {
                //psutil_debug("OpenProcess -> ERROR_SUCCESS turned into NSP");
                //NoSuchProcess("OpenProcess -> ERROR_SUCCESS");
            }
            return NULL;
        }
        //PyErr_SetFromOSErrnoWithSyscall("OpenProcess");
        return NULL;
    }

    if (check_exit_code == 0)
        return hProcess;

    if (GetExitCodeProcess(hProcess, &exitCode)) {
        // XXX - maybe STILL_ACTIVE is not fully reliable as per:
        // http://stackoverflow.com/questions/1591342/#comment47830782_1591379
        if (exitCode == STILL_ACTIVE) {
            return hProcess;
        }
        if (pid_in_pids(pid) == 1) {
            return hProcess;
        }
        CloseHandle(hProcess);
        //NoSuchProcess("GetExitCodeProcess != STILL_ACTIVE");
        return NULL;
    }

    if (GetLastError() == ERROR_ACCESS_DENIED) {
        //psutil_debug("GetExitCodeProcess -> ERROR_ACCESS_DENIED (ignored)");
        SetLastError(0);
        return hProcess;
    }
    //PyErr_SetFromOSErrnoWithSyscall("GetExitCodeProcess");
    CloseHandle(hProcess);
    return NULL;
}

// Check for PID existance. Return 1 if pid exists, 0 if not, -1 on error.
int
psutil_pid_is_running(DWORD pid) {
    HANDLE hProcess;

    // Special case for PID 0 System Idle Process
    if (pid == 0)
        return 1;
    if (pid < 0)
        return 0;

    hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);

    // Access denied means there's a process to deny access to.
    if ((hProcess == NULL) && (GetLastError() == ERROR_ACCESS_DENIED))
        return 1;

    hProcess = psutil_check_phandle(hProcess, pid, 1);
    if (hProcess != NULL) {
        CloseHandle(hProcess);
        return 1;
    }

    CloseHandle(hProcess);
    //PyErr_Clear();
    return pid_in_pids(pid);
}

static int psutil_GetProcWsetInformation(
        HANDLE hProcess,
        PMEMORY_WORKING_SET_INFORMATION *wSetInfo) {
    NTSTATUS status;
    PVOID buffer;
    SIZE_T bufferSize;

    bufferSize = 0x8000;
    buffer = MALLOC_ZERO(bufferSize);
    if (!buffer) {
        //PyErr_NoMemory();
        return 1;
    }

    while ((status = NtQueryVirtualMemory(
            hProcess,
            NULL,
            MemoryWorkingSetInformation,
            buffer,
            bufferSize,
            NULL)) == STATUS_INFO_LENGTH_MISMATCH)
    {
        FREE(buffer);
        bufferSize *= 2;
        // Fail if we're resizing the buffer to something very large.
        if (bufferSize > 256 * 1024 * 1024) {
            return 1;
        }
        buffer = MALLOC_ZERO(bufferSize);
        if (!buffer) {
            return 1;
        }
    }

    if (!NT_SUCCESS(status)) {
        HeapFree(GetProcessHeap(), 0, buffer);
        return 1;
    }

    *wSetInfo = (PMEMORY_WORKING_SET_INFORMATION)buffer;
    return 0;
}

/*
 * System memory page size as an int.
 */
int
psutil_getpagesize() {
    // XXX: we may want to use GetNativeSystemInfo to differentiate
    // page size for WoW64 processes (but am not sure).

	GetSystemInfo(&PSUTIL_SYSTEM_INFO);
    return PSUTIL_SYSTEM_INFO.dwPageSize;
}

typedef std::basic_string<TCHAR> tstring;

tstring getProcessName(int pid) {
	HANDLE hProcess;
	TCHAR szProcessName[MAX_PATH] = TEXT("<unknown>");

	hProcess = OpenProcess(  PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid );

	if (NULL != hProcess )
    {
        HMODULE hMod;
        DWORD cbNeeded;

        if ( EnumProcessModules( hProcess, &hMod, sizeof(hMod), 
             &cbNeeded) )
        {
            GetModuleBaseName( hProcess, hMod, szProcessName, 
                               sizeof(szProcessName)/sizeof(TCHAR) );
        }
    }

    // Release the handle to the process.
    CloseHandle( hProcess );

	return szProcessName;
}

void proc_memory_uss(DWORD pid, LPSTR pName, std::string& out) {
	HANDLE hProcess;
    PSUTIL_PROCESS_WS_COUNTERS wsCounters;
    PMEMORY_WORKING_SET_INFORMATION wsInfo;
    ULONG_PTR i;

    hProcess = OpenProcess(PROCESS_QUERY_INFORMATION, FALSE, pid);
    if (hProcess == NULL)
        return;

    if (psutil_GetProcWsetInformation(hProcess, &wsInfo) != 0) {
        CloseHandle(hProcess);
        return;
	}

    memset(&wsCounters, 0, sizeof(PSUTIL_PROCESS_WS_COUNTERS));

    for (i = 0; i < wsInfo->NumberOfEntries; i++) {
        // This is what ProcessHacker does.
        /*
        wsCounters.NumberOfPages++;
        if (wsInfo->WorkingSetInfo[i].ShareCount > 1)
            wsCounters.NumberOfSharedPages++;
        if (wsInfo->WorkingSetInfo[i].ShareCount == 0)
            wsCounters.NumberOfPrivatePages++;
        if (wsInfo->WorkingSetInfo[i].Shared)
            wsCounters.NumberOfShareablePages++;
        */

        // This is what we do: count shared pages that only one process
        // is using as private (USS).
		if (!wsInfo->WorkingSetInfo[i].Shared ||
                wsInfo->WorkingSetInfo[i].ShareCount <= 1) {
            wsCounters.NumberOfPrivatePages++;
        }
    }

	// While this won't give the exact value that task manager shows, it should be close enough to be a useful metric
	out = out + pName + "-" + std::to_string(pid) + ": mem: " + std::to_string(wsCounters.NumberOfPrivatePages * psutil_getpagesize()) + "\n";

	/*tcout << getProcessName(pid) << "-";
	tcout << std::to_string(pid) << ": mem: ";
	tcout << std::to_string(wsCounters.NumberOfPrivatePages * psutil_getpagesize()) << "\n";*/

	HeapFree(GetProcessHeap(), 0, wsInfo);
    CloseHandle(hProcess);
}

void proc_io(DWORD pid, std::string& out) {
	HANDLE hProcess;
	IO_COUNTERS ioCounters;

	hProcess = OpenProcess( PROCESS_QUERY_INFORMATION, FALSE, pid );
    if (hProcess == NULL)
        return;

	if (GetProcessIoCounters(hProcess, &ioCounters)) {
		out = out + getProcessName(pid) + "-" + std::to_string(pid) + ": ioRead: " + std::to_string(ioCounters.ReadTransferCount) + "\n";
		out = out + getProcessName(pid) + "-" + std::to_string(pid) + ": ioWrite: " + std::to_string(ioCounters.WriteTransferCount) + "\n";
	}

	CloseHandle(hProcess);
}

void sys_mem(std::string& out) {
	MEMORYSTATUSEX memInfo;
	memInfo.dwLength = sizeof(MEMORYSTATUSEX);
	GlobalMemoryStatusEx(&memInfo);
	DWORDLONG totalPhysMem = memInfo.ullTotalPhys;
	DWORDLONG physMemUsed = memInfo.ullTotalPhys - memInfo.ullAvailPhys;

	//tcout << "__framed_sys_mem: memTotal: " << totalPhysMem << "\n";
	//tcout << "__framed_sys_mem: memUsed: " << physMemUsed << "\n";
	
	out = out + "__framed_sys_mem: memTotal: " + std::to_string(totalPhysMem) + "\n";
	out = out + "__framed_sys_mem: memUsed: " + std::to_string(physMemUsed) + "\n";
}

static PIP_ADAPTER_ADDRESSES
psutil_get_nic_addresses(void) {
    ULONG bufferLength = 15000;
    PIP_ADAPTER_ADDRESSES buffer;

    if (GetAdaptersAddresses(AF_UNSPEC, 0, NULL, NULL, &bufferLength)
            != ERROR_BUFFER_OVERFLOW)
    {
        /*PyErr_SetString(PyExc_RuntimeError,
                        "GetAdaptersAddresses() syscall failed.");*/
        return NULL;
    }

    buffer = (IP_ADAPTER_ADDRESSES *) MALLOC(bufferLength);
    if (buffer == NULL) {
        //PyErr_NoMemory();
        return NULL;
    }
    memset(buffer, 0, bufferLength);

    if (GetAdaptersAddresses(AF_UNSPEC, 0, NULL, buffer, &bufferLength)
            != ERROR_SUCCESS)
    {
        free(buffer);
        /*PyErr_SetString(PyExc_RuntimeError,
                        "GetAdaptersAddresses() syscall failed.");*/
        return NULL;
    }

    return buffer;
}

/*
 * Return a Python list of named tuples with overall network I/O information
 */
void psutil_net_io_counters(std::string& out) {
    DWORD dwRetVal = 0;
    MIB_IF_ROW2 *pIfRow = NULL;
    PIP_ADAPTER_ADDRESSES pAddresses = NULL;
    PIP_ADAPTER_ADDRESSES pCurrAddresses = NULL;

	// Assume that the first non-zero counter interface is the main interface
	BOOL interfaceFound = false;
	int intId = 0;

    pAddresses = psutil_get_nic_addresses();
    if (pAddresses == NULL)
        return;
    pCurrAddresses = pAddresses;

    while (pCurrAddresses) {
		if (interfaceFound) {
			// Will instead return all interfaces and pick highest bytes as main one in Node.js
			//break;
		}
        pIfRow = (MIB_IF_ROW2 *) MALLOC_ZERO(sizeof(MIB_IF_ROW2));
        if (pIfRow == NULL) {
            //PyErr_NoMemory();
			FREE(pAddresses);
            return;
        }

        //SecureZeroMemory((PVOID)pIfRow, sizeof(MIB_IF_ROW2));
        pIfRow->InterfaceIndex = pCurrAddresses->IfIndex;
        dwRetVal = GetIfEntry2(pIfRow);
        if (dwRetVal != NO_ERROR) {
            /*PyErr_SetString(PyExc_RuntimeError,
                            "GetIfEntry() or GetIfEntry2() syscalls failed.");*/
			FREE(pAddresses);
            return;
        }

		if (pIfRow->InOctets == 0 && pIfRow->OutOctets == 0) {
			FREE(pIfRow);
			pCurrAddresses = pCurrAddresses->Next;
			continue;
		}

		// Would preferably want the actual interface name, but this works too
		out = out + "__framed_sys_net-" + std::to_string(intId) + ": inBytes: " + std::to_string(pIfRow->InOctets) + "\n";
		out = out + "__framed_sys_net-" + std::to_string(intId) + ": outBytes: " + std::to_string(pIfRow->OutOctets) + "\n";
		out = out + "__framed_sys_net-" + std::to_string(intId) + ": inErrors: " + std::to_string(pIfRow->InErrors) + "\n";
		out = out + "__framed_sys_net-" + std::to_string(intId) + ": outErrors: " + std::to_string(pIfRow->OutErrors) + "\n";
		out = out + "__framed_sys_net-" + std::to_string(intId) + ": inDiscards: " + std::to_string(pIfRow->InDiscards) + "\n";
		out = out + "__framed_sys_net-" + std::to_string(intId) + ": outDiscards: " + std::to_string(pIfRow->OutDiscards) + "\n";

		interfaceFound = true;
		intId++;

        FREE(pIfRow);
        pCurrAddresses = pCurrAddresses->Next;
    }

    FREE(pAddresses);
}

void sys_disk(std::string& out) {
    HANDLE dev = CreateFile("\\\\.\\C:", 
        FILE_READ_ATTRIBUTES, 
        FILE_SHARE_READ | FILE_SHARE_WRITE, 
        NULL, 
        OPEN_EXISTING, 
        0, 
        NULL);

    DISK_PERFORMANCE disk_info { };
    DWORD bytes;

    if (dev == INVALID_HANDLE_VALUE) {
        std::cerr << "Error opening disk\n";
        return;
    }

    if (!DeviceIoControl(dev, 
            IOCTL_DISK_PERFORMANCE, 
            NULL, 
            0, 
            &disk_info, 
            sizeof(disk_info), 
            &bytes, 
            NULL))
    {
        std::cerr << "Failure in DeviceIoControl\n";
        return;
    }

    out = out + "__framed_sys_disk-c: read: " + std::to_string(disk_info.BytesRead.QuadPart) + "\n";
    out = out + "__framed_sys_disk-c: write: " + std::to_string(disk_info.BytesWritten.QuadPart) + "\n";
}

uint64_t getEpochTime() {
	return std::chrono::duration_cast< std::chrono::milliseconds >(
    	std::chrono::system_clock::now().time_since_epoch()
	).count();
}

std::chrono::milliseconds getDifferenceBetweenTimes(std::chrono::milliseconds t1, std::chrono::milliseconds t2) {
	return std::chrono::duration_cast<std::chrono::milliseconds>(t2 - t1);
}

struct processCPUTime {
	DWORD pid;
	tstring processName;
	double userTime;
	double systemTime;
	uint64_t initTime;
};

std::vector<processCPUTime> processCPUTimes;

// https://stackoverflow.com/a/8477355
double filetime_to_double(struct _FILETIME &ft) {
	ULARGE_INTEGER t;

	t.LowPart = ft.dwLowDateTime;
	t.HighPart = ft.dwHighDateTime;

	// t is in 100 nano second increments
	// 1e6 is the conversion from nanosecond to millisecond
	return t.QuadPart / 1e6 * 100;
}

int getCPUTime(DWORD pid, processCPUTime* p) {
	HANDLE hProcess;
	FILETIME createTime;
	FILETIME exitTime;
	FILETIME kernelTime;
	FILETIME userTime;

	hProcess = OpenProcess( PROCESS_QUERY_INFORMATION, FALSE, pid );
    if (hProcess == NULL)
        return 0;

	if (GetProcessTimes(hProcess, &createTime, &exitTime, &kernelTime, &userTime)) {
		//processCPUTime p;
		p->pid = pid;
		p->processName = getProcessName(pid);
		p->userTime = filetime_to_double(userTime);
		p->systemTime = filetime_to_double(kernelTime);
		p->initTime = getEpochTime();

		CloseHandle(hProcess);
		//return p;
		return 1;
	}

	CloseHandle(hProcess);
	return 0;
}

void storeInitialCPUTimes(DWORD pid) {
	processCPUTime p;
	
	if (getCPUTime(pid, &p)) {
		processCPUTimes.push_back(p);
	}
}

void getAwaitedCPUTimes() {
	for (int i = 0; i < processCPUTimes.size(); i++) {
		processCPUTime p = processCPUTimes[i];
		if (psutil_pid_is_running(p.pid) == 0) {
			continue;
		}

		processCPUTime pNow;
		
		if (!getCPUTime(p.pid, &pNow)) {
			continue;
		}

		double userTime = pNow.userTime - p.userTime;
		double systemTime = pNow.systemTime - p.systemTime;

		double cpuT = static_cast<double>(userTime + systemTime) / (pNow.initTime - p.initTime);
		double cpu = cpuT * 100.0;

		/*tcout << p.processName << "-" << p.pid << ": user: " << p.userTime << "\n";
		tcout << p.processName << "-" << p.pid << ": system: " << p.systemTime << "\n";
		tcout << p.processName << "-" << p.pid << ": time: " << p.initTime << "\n";
		tcout << p.processName << "-" << p.pid << ": cpu: " << cpu << "\n";
		tcout << p.processName << "-" << p.pid << ": cpuP: " << std::ceil(cpu * 100.0) / 100.0 << "\n";

		tcout << pNow.processName << "-" << pNow.pid << ": usern: " << pNow.userTime << "\n";
		tcout << pNow.processName << "-" << pNow.pid << ": systemn: " << pNow.systemTime << "\n";
		tcout << pNow.processName << "-" << pNow.pid << ": timen: " << pNow.initTime << "\n";
		tcout << pNow.processName << "-" << pNow.pid << ": timed: " << (pNow.initTime - p.initTime) << "\n";*/

		// TODO: Fix a bug where this sometimes shows 0%
		tcout << p.processName << "-" << p.pid << ": cpu: " << std::ceil(cpu * 100.0) / 100.0 << "\n";
	}
}

// Without d3dkmthk.h, this function isn't useful
/*int sys_gpu() {
	D3DKMT_QUERYSTATISTICS queryStatistics;
	CONFIGRET cr = CR_SUCCESS;
	PWSTR DeviceInterfaceList = NULL;
    ULONG DeviceInterfaceListLength = 0;

	cr = CM_Get_Device_Interface_List_Size(&DeviceInterfaceListLength,
		(LPGUID)&GUID_DISPLAY_DEVICE_ARRIVAL,
        NULL,
        CM_GET_DEVICE_INTERFACE_LIST_PRESENT);

	if (cr != CR_SUCCESS) {
		return 1;
	}

	if (DeviceInterfaceList != NULL) {
		HeapFree(GetProcessHeap(), 0, DeviceInterfaceList);
	}

	DeviceInterfaceList = (PWSTR)HeapAlloc(GetProcessHeap(),
		HEAP_ZERO_MEMORY,
		DeviceInterfaceListLength * sizeof(WCHAR));

	if (DeviceInterfaceList == NULL) {
		//cr = CR_OUT_OF_MEMORY;
		return 1;
	}

	cr = CM_Get_Device_Interface_List((LPGUID)&GUID_DISPLAY_DEVICE_ARRIVAL,
		NULL,
		DeviceInterfaceList,
		DeviceInterfaceListLength,
		CM_GET_DEVICE_INTERFACE_LIST_PRESENT);

	if (cr == CR_BUFFER_SMALL) {
		return 1;
	}

	std::cout << DeviceInterfaceList;

	return 0;
}*/

struct sysCPUTimes {
	double idleTime;
	double userTime;
	double systemTime;
	uint64_t time;
};

sysCPUTimes cpuTimes1;

int sys_cpu_init() {
	FILETIME idleTime;
	FILETIME kernelTime;
	FILETIME userTime;

	if (!GetSystemTimes(&idleTime, &kernelTime, &userTime)) {
		return 0;
	}

	cpuTimes1.idleTime = filetime_to_double(idleTime);
	cpuTimes1.userTime = filetime_to_double(userTime);
	cpuTimes1.systemTime = filetime_to_double(kernelTime);
	cpuTimes1.time = getEpochTime();

	return 1;
}

void sys_cpu(std::string& out) {
	sysCPUTimes cpuTimes2;
	FILETIME idleTime;
	FILETIME kernelTime;
	FILETIME userTime;

	if (!GetSystemTimes(&idleTime, &kernelTime, &userTime)) {
		out = out + "__framed_sys_cpu: cpu: 0\n";
		return;
	}

	cpuTimes2.idleTime = filetime_to_double(idleTime);
	cpuTimes2.userTime = filetime_to_double(userTime);
	cpuTimes2.systemTime = filetime_to_double(kernelTime);
	cpuTimes2.time = getEpochTime();

	double idleTimeD = cpuTimes2.idleTime - cpuTimes1.idleTime;
	double userTimeD = cpuTimes2.userTime - cpuTimes1.userTime;
	double systemTimeD = cpuTimes2.systemTime - cpuTimes1.systemTime;

	//double cpuT = static_cast<double>(100 / ((userTimeD + systemTimeD) / (cpuTimes2.time - cpuTimes1.time)));
	double cpuT = static_cast<double>((systemTimeD + userTimeD - idleTimeD) * 100 / (systemTimeD + userTimeD));
	// Due to limitations of the parser, this needs to be an integer
	int cpu = ceil(cpuT * 100.0);

	//std::cout << "_framed_sys_cpu: ut1: " << std::to_string(cpuTimes1.userTime) << "\n";
	//std::cout << "_framed_sys_cpu: ut2: " << std::to_string(cpuTimes2.userTime) << "\n";
	//std::cout << "_framed_sys_cpu: tt1: " << cpuTimes1.time << "\n";
	//std::cout << "_framed_sys_cpu: st1: " << std::to_string(cpuTimes1.systemTime) << "\n";
	//std::cout << "_framed_sys_cpu: st2: " << std::to_string(cpuTimes2.systemTime) << "\n";
	//std::cout << "_framed_sys_cpu: tt2: " << cpuTimes2.time << "\n";
	//std::cout << "_framed_sys_cpu: utd: " << userTimeD << "\n";
	//std::cout << "_framed_sys_cpu: std: " << systemTimeD << "\n";

	//std::cout << "_framed_sys_cpu: add: " << (userTimeD + systemTimeD) << "\n";
	//std::cout << "_framed_sys_cpu: time: " << (cpuTimes2.time - cpuTimes1.time) << "\n";

	out = out + "__framed_sys_cpu: cpu: " + std::to_string(cpu) + "\n";
}

BOOL IsElevated( ) {
    BOOL fRet = FALSE;
    HANDLE hToken = NULL;
    if( OpenProcessToken( GetCurrentProcess( ),TOKEN_QUERY,&hToken ) ) {
        TOKEN_ELEVATION Elevation;
        DWORD cbSize = sizeof( TOKEN_ELEVATION );
        if( GetTokenInformation( hToken, TokenElevation, &Elevation, sizeof( Elevation ), &cbSize ) ) {
            fRet = Elevation.TokenIsElevated;
        }
    }
    if( hToken ) {
        CloseHandle( hToken );
    }
    return fRet;
}

void FramedGetPerfData(const v8::FunctionCallbackInfo<v8::Value>& args) {
	v8::Isolate* isolate = args.GetIsolate();

	std::string outputString = "";

	bool cpuInit = sys_cpu_init();

	sys_mem(outputString);
	psutil_net_io_counters(outputString);
	sys_disk(outputString);

	if (cpuInit) {
		// By initializing above, we can run other things and
		// sleep for less time while still getting WAIT_TIME of data.
		// With the current (v0.0.2) code, this only results in ~5ms
		// time saved, but could be useful for the future.
		uint64_t diff = getEpochTime() - cpuTimes1.time;

		int WAIT_TIME = 500;

		if (diff < WAIT_TIME) {
			Sleep(WAIT_TIME - diff);
		}

		// CPU calculation is still kinda buggy though
		sys_cpu(outputString);
	} else {
		outputString = outputString + "__framed_sys_cpu: cpu: 0\n";
	}

	// Until I can find a solution to the high CPU usage, comment this out
	/*WTS_PROCESS_INFO* processes = NULL;
	DWORD count = 0;

	if (WTSEnumerateProcesses(WTS_CURRENT_SERVER_HANDLE, NULL, 1, &processes, &count)) {
		for (DWORD i = 0; i < count; i++) {
			proc_memory_uss(processes[i].ProcessId, processes[i].pProcessName, outputString);
			//proc_io(processes[i].ProcessId, outputString);
			//storeInitialCPUTimes(processes[i].ProcessId);

			//tcout << processes[i].pProcessName << "-" << processes[i].ProcessId << "\n";
		}

		//Sleep(100);
		//getAwaitedCPUTimes();
	}

	if (processes) {
		WTSFreeMemory(processes);
		processes = NULL;
	}*/

	v8::Local<v8::String> output = v8::String::NewFromUtf8(isolate, outputString.c_str()).ToLocalChecked();
	args.GetReturnValue().Set(output);
}

void Init(v8::Local<v8::Object> exports) {
	NODE_SET_METHOD(exports, "getPerfData", FramedGetPerfData);
}



/*int main( void ) {
	if (IsElevated()) {
		std::cout << "Due to a bug, Framed C++ API must be run without administrative privileges";
		return 1;
	}

	sys_mem();
	psutil_net_io_counters();
	sys_disk();

	/*if (sys_cpu_init()) {
		Sleep(100);
		sys_cpu();
	}*/

	// Task manager updates CPU usage once per second. This program is designed
	// to finish in less time than that. Due to this, task manager shows 0% CPU usage
	// for Framed C++ API, when this is not the case. The system CPU usage graphs
	// clearly show an increase in CPU usage when this program runs.
	// In other words, je suis un idiot.
	/*WTS_PROCESS_INFO* processes = NULL;
	DWORD count = 0;

	if (WTSEnumerateProcesses(WTS_CURRENT_SERVER_HANDLE, NULL, 1, &processes, &count)) {
		for (DWORD i = 0; i < count; i++) {
			proc_memory_uss(processes[i].ProcessId);
			proc_io(processes[i].ProcessId);
			storeInitialCPUTimes(processes[i].ProcessId);
		}

		Sleep(100);
		getAwaitedCPUTimes();
	}

	if (processes) {
		WTSFreeMemory(processes);
		processes = NULL;
	}*/

   /*return 0;
}*/

NODE_MODULE(NODE_GYP_MODULE_NAME, Init)