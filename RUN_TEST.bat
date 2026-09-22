@echo off
title Orchestrator Real-World Test Runner
cd /d "C:\Users\PC\Projects\hobby\orchestrator"
echo ==============================================================================
echo STARTING COMPOSER / ORCHESTRATOR END-TO-END VALIDATION
echo Target Desktop Project: C:\Users\PC\Desktop\test-orchestrator-app
echo Log file: C:\Users\PC\Desktop\test-orchestrator-app\logs\test_run.log
echo ==============================================================================
echo Compiling latest orchestrator_tester.exe...
go build -o orchestrator_tester.exe ./cmd/orchestrator_tester
if %ERRORLEVEL% neq 0 (
    echo Compilation failed!
    pause
    exit /b %ERRORLEVEL%
)
echo Running test suite...
.\orchestrator_tester.exe
echo ==============================================================================
echo TEST RUN FINISHED.
echo ==============================================================================
pause
