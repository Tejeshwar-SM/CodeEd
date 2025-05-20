import json
import asyncio
import uuid
import os
import tempfile
import subprocess
import re
import signal
import sys
from channels.generic.websocket import AsyncWebsocketConsumer

class CodeConsumer(AsyncWebsocketConsumer):
    processes = {}

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        await self.accept()

        # Send confirmation message
        await self.send(json.dumps({
            'type': 'connection_established',
            'session_id': self.session_id
        }))

    async def disconnect(self, close_code):
        # Clean up any running processes
        await self.terminate_execution()

        # Remove temp files if they exist
        if hasattr(self, 'temp_file_name') and self.temp_file_name:
            try:
                if os.path.exists(self.temp_file_name):
                    os.unlink(self.temp_file_name)
            except Exception as e:
                print(f"Error removing temp file: {e}")

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type')

        if message_type == 'execute':
            await self.execute_code(data)
        elif message_type == 'input':
            await self.send_input(data)
        elif message_type == 'terminate':
            await self.terminate_execution()

    async def execute_code(self, data):
        # Clean up any previous process
        await self.terminate_execution()

        code = data.get('code', '')
        language = data.get('language', 'python').lower()

        # Create temp file with appropriate suffix
        if language in ['javascript', 'js']:
            suffix = '.js'
            run_cmd = ['node']
        else:  # Default to Python
            suffix = '.py'
            # Modify Python code to handle input better
            # Add a wrapper that redirects stdin/stdout for better control
            input_wrapper = """
import sys
import threading
from io import StringIO

class InputRedirector:
    def __init__(self, console):
        self.console = console
        self.input_ready = threading.Event()
        self.input_value = None
        
    def readline(self):
        # Signal that input is needed
        print("__WAITING_FOR_INPUT__", flush=True)
        self.input_ready.clear()
        # Wait for input from the console
        self.input_ready.wait()
        value = self.input_value + '\\n'
        self.input_value = None
        return value

# Setup redirectors
input_redirector = InputRedirector(sys)
original_stdin = sys.stdin
sys.stdin = input_redirector

# Define a custom input function
def custom_input(prompt=''):
    if prompt:
        print(prompt, end='', flush=True)
    return input_redirector.readline().rstrip('\\n')

# Replace the built-in input with our custom one
__builtins__['input'] = custom_input

# Your code starts here
"""
            code = input_wrapper + "\n\n" + code
            run_cmd = ['python']

        # Create a temporary file
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_file.write(code.encode())
            self.temp_file_name = temp_file.name

        # Run the code asynchronously
        process = await asyncio.create_subprocess_exec(
            *run_cmd, self.temp_file_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.PIPE,
            shell=False
        )

        # Store process
        self.processes[self.session_id] = process

        # Function to handle input detection
        async def detect_input(line):
            # For Python, look for our special marker
            if line == "__WAITING_FOR_INPUT__":
                await self.send(json.dumps({
                    'type': 'input_prompt',
                }))
                return True

            # Other common patterns
            input_patterns = [
                r"^input\(['\"]?(.+?)['\"]?\)",  # Check for input() calls
                r"(?:Enter|Type|Provide|Give|Insert).+?:",  # Natural language prompts
                r"Please .+?:",  # Please followed by a colon
                r"\w+: $",  # Word followed by colon and space at end of line
                r"\w+\?\s*$",  # Word followed by question mark at end of line
                r"^>>>\s*$",  # Python prompt
            ]

            for pattern in input_patterns:
                if re.search(pattern, line):
                    await self.send(json.dumps({
                        'type': 'input_prompt',
                    }))
                    return True
            return False

        # Process stdout
        async def read_stdout():
            while not process.stdout.at_eof():
                try:
                    line = await process.stdout.readline()
                    if not line:
                        break

                    line_str = line.decode('utf-8').rstrip('\n')

                    # Check if the line is asking for input
                    is_input = await detect_input(line_str)
                    if not is_input:
                        await self.send(json.dumps({
                            'type': 'output',
                            'output': line_str
                        }))
                except Exception as e:
                    await self.send(json.dumps({
                        'type': 'error',
                        'error': f"Output reading error: {str(e)}"
                    }))
                    break

        # Process stderr
        async def read_stderr():
            while not process.stderr.at_eof():
                try:
                    line = await process.stderr.readline()
                    if not line:
                        break
                    line_str = line.decode('utf-8').rstrip('\n')
                    await self.send(json.dumps({
                        'type': 'error',
                        'error': line_str
                    }))
                except Exception as e:
                    await self.send(json.dumps({
                        'type': 'error',
                        'error': f"Error reading error: {str(e)}"
                    }))
                    break

        # Start reading in the background
        asyncio.create_task(read_stdout())
        asyncio.create_task(read_stderr())

        # Wait for the process to finish
        try:
            exit_code = await process.wait()

            # Process complete
            if self.session_id in self.processes:
                del self.processes[self.session_id]

            await self.send(json.dumps({
                'type': 'execution_complete',
                'exit_code': exit_code
            }))

            # Clean up temp file
            if self.temp_file_name and os.path.exists(self.temp_file_name):
                try:
                    os.unlink(self.temp_file_name)
                    self.temp_file_name = None
                except Exception as e:
                    print(f"Error removing temp file: {e}")
        except asyncio.CancelledError:
            # Execution was terminated
            if self.session_id in self.processes:
                process = self.processes[self.session_id]
                try:
                    process.kill()
                except:
                    pass
                del self.processes[self.session_id]

    async def send_input(self, data):
        input_value = data.get('input', '')

        if self.session_id in self.processes:
            process = self.processes[self.session_id]
            try:
                # Send the input to the process
                process.stdin.write(f"{input_value}\n".encode())
                await process.stdin.drain()
            except Exception as e:
                await self.send(json.dumps({
                    'type': 'error',
                    'error': f"Failed to send input: {str(e)}"
                }))

    async def terminate_execution(self):
        if hasattr(self, 'session_id') and self.session_id in self.processes:
            process = self.processes[self.session_id]
            try:
                # Try graceful termination first
                process.terminate()
                try:
                    # Give it a short time to terminate
                    await asyncio.wait_for(process.wait(), 1.0)
                except asyncio.TimeoutError:
                    # If it doesn't terminate gracefully, force kill
                    process.kill()

                # Remove from processes dict
                del self.processes[self.session_id]

                await self.send(json.dumps({
                    'type': 'execution_terminated',
                    'message': 'Execution terminated'
                }))
            except Exception as e:
                await self.send(json.dumps({
                    'type': 'error',
                    'error': f"Error terminating process: {str(e)}"
                }))