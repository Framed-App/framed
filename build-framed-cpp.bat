@echo off

:: This script will compile framed-api.cpp and output it to framed-cpp-api.exe
:: Update the imports if needed

g++ -o framed-cpp-api.exe framed-api.cpp -lpsapi -lwtsapi32 -liphlpapi