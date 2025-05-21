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
    temp_files = {}

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        logger.info(f"WebSocket connection attempt for session: {self.session_id}")

        await self.accept()
        logger.info(f"WebSocket connection accepted for session: {self.session_id}")

        # Send confirmation message
        await self.send(json.dumps({
            'type': 'connection_established',
            'session_id': self.session_id
        }))

    async def disconnect(self, close_code):
        logger.info(f"WebSocket disconnecting with code {close_code} for session: {self.session_id}")

        # Clean up any running processes
        await self.terminate_execution()

        # Remove temp files if they exist
        if self.session_id in self.temp_files:
            try:
                file_path = self.temp_files[self.session_id]
                if os.path.exists(file_path):
                    os.unlink(file_path)
                    logger.info(f"Removed temp file: {file_path}")
                del self.temp_files[self.session_id]
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
            await self.send(json.dumps({
                'type': 'error',
                'error': 'Invalid JSON received'
            }))
        except Exception as e:
            logger.error(f"Error in receive: {e}")
            await self.send(json.dumps({
                'type': 'error',
                'error': f'Server error: {str(e)}'
            }))

    async def execute_code(self, data):
        # Clean up any previous process
        await self.terminate_execution()

        try:
            code = data.get('code', '')
            language = data.get('language', 'python').lower()

            if not code.strip():
                await self.send(json.dumps({
                    'type': 'error',
                    'error': 'No code provided'
                }))
                return

            # Create temp file with appropriate suffix
            if language in ['javascript', 'js']:
                suffix = '.js'
                run_cmd = ['node']
            else:  # Default to Python
                suffix = '.py'
                run_cmd = ['python']

            # Create a temporary file
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
                temp_file.write(code.encode('utf-8'))
                self.temp_files[self.session_id] = temp_file.name

            # Run the code asynchronously
            try:
                process = await asyncio.create_subprocess_exec(
                    *run_cmd, self.temp_files[self.session_id],
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    stdin=asyncio.subprocess.PIPE
                )

                # Store process
                self.processes[self.session_id] = process
                logger.info(f"Started process for session: {self.session_id}")

                # Process stdout
                asyncio.create_task(self.read_stdout(process))
                # Process stderr
                asyncio.create_task(self.read_stderr(process))

                # Wait for the process to finish in background
                asyncio.create_task(self.wait_for_process(process))

            except Exception as e:
                await self.send(json.dumps({
                    'type': 'error',
                    'error': f"Failed to execute: {str(e)}"
                }))
                # Clean up temp file if execution fails
                if self.session_id in self.temp_files:
                    try:
                        os.unlink(self.temp_files[self.session_id])
                        del self.temp_files[self.session_id]
                    except:
                        pass

        except Exception as e:
            logger.error(f"Error executing code: {e}")
            await self.send(json.dumps({
                'type': 'error',
                'error': f"Error preparing execution: {str(e)}"
            }))

    async def read_stdout(self, process):
        while not process.stdout.at_eof():
            try:
                line = await process.stdout.readline()
                if not line:
                    break

                line_str = line.decode('utf-8').rstrip('\n')

                # Check if this looks like an input request
                if await self.check_for_input_prompt(line_str):
                    await self.send(json.dumps({
                        'type': 'input_prompt'
                    }))
                else:
                    await self.send(json.dumps({
                        'type': 'output',
                        'output': line_str
                    }))
            except Exception as e:
                logger.error(f"Error reading from stdout: {e}")
                await self.send(json.dumps({
                    'type': 'error',
                    'error': f"Output reading error: {str(e)}"
                }))
                break

    async def read_stderr(self, process):
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
                logger.error(f"Error reading from stderr: {e}")
                await self.send(json.dumps({
                    'type': 'error',
                    'error': f"Error stream reading error: {str(e)}"
                }))
                break

    async def check_for_input_prompt(self, line):
        # Common patterns that might indicate an input prompt
        input_patterns = [
            r"input\(['\"].*['\"]?\)",  # Python input() function
            r"(?:Enter|Type|Input|Provide).*:",  # Natural language prompts
            r"[?:]\s*$",  # Line ending with ? or :
            r"^>>>\s*$",  # Python REPL prompt
        ]

        for pattern in input_patterns:
            if re.search(pattern, line):
                return True
        return False

    async def wait_for_process(self, process):
        try:
            exit_code = await process.wait()

            # Process complete
            if self.session_id in self.processes:
                del self.processes[self.session_id]

            # Remove temp file
            if self.session_id in self.temp_files:
                try:
                    os.unlink(self.temp_files[self.session_id])
                    del self.temp_files[self.session_id]
                except:
                    logger.error(f"Failed to remove temp file for session {self.session_id}")

            await self.send(json.dumps({
                'type': 'execution_complete',
                'exit_code': exit_code
            }))

        except asyncio.CancelledError:
            logger.info(f"Process wait task cancelled for session: {self.session_id}")
            pass
        except Exception as e:
            logger.error(f"Error waiting for process: {e}")
            await self.send(json.dumps({
                'type': 'error',
                'error': f"Error during execution: {str(e)}"
            }))

    async def send_input(self, data):
        input_value = data.get('input', '')

        if self.session_id in self.processes:
            process = self.processes[self.session_id]
            try:
                # Send the input to the process
                process.stdin.write(f"{input_value}\n".encode())
                await process.stdin.drain()
            except Exception as e:
                logger.error(f"Error sending input: {e}")
                await self.send(json.dumps({
                    'type': 'error',
                    'error': f"Failed to send input: {str(e)}"
                }))

    async def terminate_execution(self):
        if hasattr(self, 'session_id') and self.session_id in self.processes:
            process = self.processes[self.session_id]
            try:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), 2.0)
                except asyncio.TimeoutError:
                    process.kill()

                del self.processes[self.session_id]

                await self.send(json.dumps({
                    'type': 'execution_terminated',
                    'message': 'Execution terminated'
                }))
            except Exception as e:
                logger.error(f"Error terminating process: {e}")
                await self.send(json.dumps({
                    'type': 'error',
                    'error': f"Error terminating process: {str(e)}"
                }))