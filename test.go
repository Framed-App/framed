// This is giving the same value as the Node.js script
// Would've thought it would expose USS value like the Python
// library it's based on does

package main

import (
	"fmt"
	"log"

	//"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
)

func main() {
	//v, _ := mem.VirtualMemory()
	processes, err := process.Processes()

	if err != nil {
		log.Fatal(err)
	}

	//fmt.Println(processes)

	for _, process := range processes {
		running, _ := process.IsRunning()
		if !running {
			continue
		}
		percent, percentErr := process.CPUPercent()

		if percentErr == nil {
			//log.Fatal(percentErr)
			name, _ := process.Name()
			memory, _ := process.MemoryInfo()
			fmt.Println(memory)
			fmt.Println(name + "-" + fmt.Sprint(process.Pid) + ": " + fmt.Sprint(percent))
			fmt.Println("---")
		}
	}

	// almost every return value is a struct
	//fmt.Printf("Total: %v, Free:%v, UsedPercent:%f%%\n", v.Total, v.Free, v.UsedPercent)

	// convert to JSON. String() is also implemented
	//fmt.Println(v)
}
