import json
import asyncio
import os
import tempfile
import subprocess
import re
import sys
import logging
from channels.generic.websocket import AsyncWebsocketConsumer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CodeConsumer(AsyncWebsocketConsumer):
    processes = {}

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.temp_file_name = None  # Instance-level tracking for better cleanup
        
        logger.info(f"WebSocket connection attempt for session: {self.session_id}")
        await self.accept()
        logger.info(f"WebSocket connection accepted for session: {self.session_id}")

        # Send confirmation message
        await self._send_json_safe({
            'type': 'connection_established',
            'session_id': self.session_id
        })

    async def disconnect(self, close_code):
        logger.info(f"WebSocket disconnecting with code {close_code} for session: {self.session_id}")
        
        # Clean up any running processes
        await self.terminate_execution()

        # Remove temp files if they exist
        if self.temp_file_name and os.path.exists(self.temp_file_name):
            try:
                os.unlink(self.temp_file_name)
                logger.info(f"Removed temp file: {self.temp_file_name}")
                self.temp_file_name = None
            except Exception as e:
                logger.error(f"Error removing temp file: {e}")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            logger.info(f"Received message type: {message_type} for session: {self.session_id}")

            if message_type == 'execute':
                await self.execute_code(data)
            elif message_type == 'input':
                await self.send_input(data)
            elif message_type == 'terminate':
                await self.terminate_execution()
        except json.JSONDecodeError:
            await self._send_json_safe({
                'type': 'error',
                'error': 'Invalid JSON received'
            })
        except Exception as e:
            logger.error(f"Error in receive: {e}")
            await self._send_json_safe({
                'type': 'error',
                'error': f'Server error: {str(e)}'
            })

    async def execute_code(self, data):
        # Clean up any previous process
        await self.terminate_execution()

        try:
            code = data.get('code', '')
            language = data.get('language', 'python').lower()

            if not code.strip():
                await self._send_json_safe({
                    'type': 'error',
                    'error': 'No code provided'
                })
                return

            # Create temp file with appropriate suffix
            if language in ['javascript', 'js']:
                suffix = '.js'
                run_cmd = ['node']
            else:  # Default to Python
                suffix = '.py'
                # Wrap Python code to handle input better
                input_wrapper = """
import sys
import threading

class InputRedirector:
    def __init__(self):
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
input_redirector = InputRedirector()
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
                temp_file.write(code.encode('utf-8'))
                self.temp_file_name = temp_file.name
                logger.info(f"Created temp file: {self.temp_file_name}")

            # Run the code asynchronously
            process = await asyncio.create_subprocess_exec(
                *run_cmd, self.temp_file_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.PIPE
            )

            # Store process
            self.processes[self.session_id] = process
            logger.info(f"Started process for session: {self.session_id}")

            # Handle the process streams
            await self.handle_process_streams(process)

        except Exception as e:
            logger.error(f"Error executing code: {e}")
            await self._send_json_safe({
                'type': 'error',
                'error': f"Error preparing execution: {str(e)}"
            })
            # Clean up temp file if execution fails
            if self.temp_file_name and os.path.exists(self.temp_file_name):
                try:
                    os.unlink(self.temp_file_name)
                    self.temp_file_name = None
                    logger.info("Cleaned up temp file after execution error")
                except Exception as unlink_e:
                    logger.error(f"Failed to clean up temp file: {unlink_e}")

    async def handle_process_streams(self, process):
        # Function to handle input detection
        async def detect_input(line):
            if line == "__WAITING_FOR_INPUT__":
                await self._send_json_safe({'type': 'input_prompt'})
                return True

            # Other common patterns (fallback)
            input_patterns = [
                r"^input\(['\"]?(.+?)['\"]?\)",
                r"(?:Enter|Type|Provide|Give|Insert).+?:",
                r"Please .+?:",
                r"\w+: $",
                r"\w+\?\s*$",
                r"^>>>\s*$",
            ]

            for pattern in input_patterns:
                if re.search(pattern, line):
                    await self._send_json_safe({'type': 'input_prompt'})
                    return True
            return False

        # Process stdout
        async def read_stdout():
            while not process.stdout.at_eof():
                try:
                    line = await process.stdout.readline()
                    if not line:
                        break

                    line_str = line.decode('utf-8', errors='replace').rstrip('\n')
                    logger.debug(f"STDOUT: {line_str}")

                    # Check if the line is asking for input
                    is_input = await detect_input(line_str)
                    if not is_input:
                        await self._send_json_safe({
                            'type': 'output',
                            'output': line_str
                        })
                except Exception as e:
                    logger.error(f"Error reading from stdout: {e}")
                    await self._send_json_safe({
                        'type': 'error',
                        'error': f"Output reading error: {str(e)}"
                    })
                    break

        # Process stderr
        async def read_stderr():
            while not process.stderr.at_eof():
                try:
                    line = await process.stderr.readline()
                    if not line:
                        break
                    line_str = line.decode('utf-8', errors='replace').rstrip('\n')
                    logger.debug(f"STDERR: {line_str}")
                    await self._send_json_safe({
                        'type': 'error',
                        'error': line_str
                    })
                except Exception as e:
                    logger.error(f"Error reading from stderr: {e}")
                    await self._send_json_safe({
                        'type': 'error',
                        'error': f"Error stream reading error: {str(e)}"
                    })
                    break

        # Start reading in the background
        stdout_task = asyncio.create_task(read_stdout())
        stderr_task = asyncio.create_task(read_stderr())

        # Wait for the process to finish
        try:
            exit_code = await process.wait()

            # Wait for stdout and stderr to be fully read
            await stdout_task
            await stderr_task

            # Process complete
            if self.session_id in self.processes:
                del self.processes[self.session_id]

            await self._send_json_safe({
                'type': 'execution_complete',
                'exit_code': exit_code
            })

            # Clean up temp file
            if self.temp_file_name and os.path.exists(self.temp_file_name):
                try:
                    os.unlink(self.temp_file_name)
                    logger.info(f"Removed temp file after completion: {self.temp_file_name}")
                    self.temp_file_name = None
                except Exception as e:
                    logger.error(f"Error removing temp file: {e}")
        except asyncio.CancelledError:
            logger.info(f"Process wait task cancelled for session: {self.session_id}")
            # Execution was terminated
            if self.session_id in self.processes:
                process = self.processes[self.session_id]
                try:
                    process.kill()
                except:
                    pass
                del self.processes[self.session_id]
        except Exception as e:
            logger.error(f"Error waiting for process: {e}")
            await self._send_json_safe({
                'type': 'error',
                'error': f"Error during execution: {str(e)}"
            })

    async def send_input(self, data):
        input_value = data.get('input', '')

        if self.session_id in self.processes:
            process = self.processes[self.session_id]
            try:
                # Send the input to the process
                process.stdin.write(f"{input_value}\n".encode())
                await process.stdin.drain()
                logger.info(f"Input sent to process: {input_value}")
            except Exception as e:
                logger.error(f"Error sending input: {e}")
                await self._send_json_safe({
                    'type': 'error',
                    'error': f"Failed to send input: {str(e)}"
                })

    async def terminate_execution(self):
        if hasattr(self, 'session_id') and self.session_id in self.processes:
            process = self.processes[self.session_id]
            try:
                # Try graceful termination first
                process.terminate()
                logger.info(f"Terminating process for session: {self.session_id}")
                
                try:
                    # Give it a short time to terminate
                    await asyncio.wait_for(process.wait(), 1.0)
                except asyncio.TimeoutError:
                    # If it doesn't terminate gracefully, force kill
                    logger.warning(f"Process did not terminate gracefully, killing: {self.session_id}")
                    process.kill()

                # Remove from processes dict
                del self.processes[self.session_id]

                await self._send_json_safe({
                    'type': 'execution_terminated',
                    'message': 'Execution terminated'
                })
            except Exception as e:
                logger.error(f"Error terminating process: {e}")
                await self._send_json_safe({
                    'type': 'error',
                    'error': f"Error terminating process: {str(e)}"
                })

    async def _send_json_safe(self, data_dict):
        try:
            json_string = json.dumps(data_dict)
            await self.send(text_data=json_string)
        except Exception as e:
            logger.error(f"Failed to send message to client: {e}")
            # Try to send a simplified error message
            try:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'error': 'Internal error while sending message'
                }))
            except:
                pass  # If this fails too, we can't do much more