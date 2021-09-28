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
// - Doesn't use much CPU
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

#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "netio.lib")

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

static int
psutil_GetProcWsetInformation(
        DWORD pid,
        HANDLE hProcess,
        PMEMORY_WORKING_SET_INFORMATION *wSetInfo)
{
    NTSTATUS status;
    PVOID buffer;
    SIZE_T bufferSize;

    bufferSize = 0x8000;
    buffer = MALLOC_ZERO(bufferSize);
    if (! buffer) {
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
            /*PyErr_SetString(PyExc_RuntimeError,
                            "NtQueryVirtualMemory bufsize is too large");*/
            return 1;
        }
        buffer = MALLOC_ZERO(bufferSize);
        if (! buffer) {
            //PyErr_NoMemory();
            return 1;
        }
    }

    if (!NT_SUCCESS(status)) {
        if (status == STATUS_ACCESS_DENIED) {
            //AccessDenied("NtQueryVirtualMemory -> STATUS_ACCESS_DENIED");
			return 1;
        }
        else if (psutil_pid_is_running(pid) == 0) {
            //NoSuchProcess("psutil_pid_is_running -> 0");
        }
        else {
            /*PyErr_Clear();
            psutil_SetFromNTStatusErr(
                status, "NtQueryVirtualMemory(MemoryWorkingSetInformation)");*/
        }
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

tstring
getProcessName(int pid) {
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

void proc_memory_uss(DWORD pid) {
	HANDLE hProcess;
    PSUTIL_PROCESS_WS_COUNTERS wsCounters;
    PMEMORY_WORKING_SET_INFORMATION wsInfo;
    ULONG_PTR i;

    hProcess = OpenProcess(  PROCESS_QUERY_INFORMATION, FALSE, pid );
    if (hProcess == NULL)
        return;

    if (psutil_GetProcWsetInformation(pid, hProcess, &wsInfo) != 0) {
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
	tcout << getProcessName(pid) << "-" << pid << ": mem:" << wsCounters.NumberOfPrivatePages * psutil_getpagesize() << "\n";

	HeapFree(GetProcessHeap(), 0, wsInfo);
    CloseHandle(hProcess);
}

void proc_io(DWORD pid) {
	HANDLE hProcess;
	IO_COUNTERS ioCounters;

	hProcess = OpenProcess( PROCESS_QUERY_INFORMATION, FALSE, pid );
    if (hProcess == NULL)
        return;

	if (GetProcessIoCounters(hProcess, &ioCounters)) {
		tcout << getProcessName(pid) << "-" << pid << ": read: " << ioCounters.ReadTransferCount << "\n";
		tcout << getProcessName(pid) << "-" << pid << ": write: " << ioCounters.WriteTransferCount << "\n";
	}

	CloseHandle(hProcess);
}

void sys_mem() {
	MEMORYSTATUSEX memInfo;
	memInfo.dwLength = sizeof(MEMORYSTATUSEX);
	GlobalMemoryStatusEx(&memInfo);
	DWORDLONG totalPhysMem = memInfo.ullTotalPhys;
	DWORDLONG physMemUsed = memInfo.ullTotalPhys - memInfo.ullAvailPhys;

	tcout << "__framed_sys-0: memTotal: " << totalPhysMem << "\n";
	tcout << "__framed-sys-0: memUsed: " << physMemUsed << "\n";
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
void psutil_net_io_counters() {
    DWORD dwRetVal = 0;
    MIB_IF_ROW2 *pIfRow = NULL;
    PIP_ADAPTER_ADDRESSES pAddresses = NULL;
    PIP_ADAPTER_ADDRESSES pCurrAddresses = NULL;

    pAddresses = psutil_get_nic_addresses();
    if (pAddresses == NULL)
        return;
    pCurrAddresses = pAddresses;

    while (pCurrAddresses) {
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

		// Would preferably want the actual interface name, but this works too
		std::cout << "__framed_sys_net-" << pIfRow->InterfaceIndex << ": inBytes: " << pIfRow->InOctets << "\n";
		std::cout << "__framed_sys_net-" << pIfRow->InterfaceIndex << ": outBytes: " << pIfRow->OutOctets << "\n";
		std::cout << "__framed_sys_net-" << pIfRow->InterfaceIndex << ": inErrors: " << pIfRow->InErrors << "\n";
		std::cout << "__framed_sys_net-" << pIfRow->InterfaceIndex << ": outErrors: " << pIfRow->OutErrors << "\n";
		std::cout << "__framed_sys_net-" << pIfRow->InterfaceIndex << ": inDiscards: " << pIfRow->InDiscards << "\n";
		std::cout << "__framed_sys_net-" << pIfRow->InterfaceIndex << ": outDiscards: " << pIfRow->OutDiscards << "\n";

        FREE(pIfRow);
        pCurrAddresses = pCurrAddresses->Next;
    }

    FREE(pAddresses);
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

int main( void ) {
	if (IsElevated()) {
		std::cout << "Due to a bug, Framed C++ API must be run without administrative privileges";
		return 1;
	}

	sys_mem();
	// TODO: Fix this function stopping anything else from running
	psutil_net_io_counters();

	WTS_PROCESS_INFO* processes = NULL;
	DWORD count = 0;

	if (WTSEnumerateProcesses(WTS_CURRENT_SERVER_HANDLE, NULL, 1, &processes, &count)) {
		for (DWORD i = 0; i < count; i++) {
			proc_memory_uss(processes[i].ProcessId);
			proc_io(processes[i].ProcessId);
		}
	}

	if (processes) {
		WTSFreeMemory(processes);
		processes = NULL;
   }

   return 0;
}