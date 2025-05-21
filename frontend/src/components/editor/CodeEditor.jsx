import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { files as filesApi, projects as projectsApi } from '../../services/api';
import Loader from '../ui/Loader';
import Button from '../ui/Button';
import FileExplorer from './FileExplorer';
import FileOperationsBar from './FileOperationsBar';

const CodeEditor = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const editorRef = useRef(null);

  // Add these state variables for the empty state file creation
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Terminal state
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [waitingForInput, setWaitingForInput] = useState(false);
  const terminalRef = useRef(null);
  const socketRef = useRef(null);
  const sessionIdRef = useRef(null);
  const inputRef = useRef(null);
  const [socketReady, setSocketReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectionPromiseRef = useRef(null);

  // Fetch project and files
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        setLoading(true);

        // Fetch project details
        const projectResponse = await projectsApi.get(projectId);
        setProject(projectResponse.data);

        // Fetch project files
        const filesResponse = await filesApi.getAll(projectId);
        setFiles(filesResponse.data);

        // Select first file if any
        if (filesResponse.data.length > 0) {
          handleFileSelect(filesResponse.data[0]);
        }
      } catch (err) {
        console.error('Error fetching project data:', err);
        setError('Failed to load project data');
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      fetchProjectData();
    }

    // Add event listener for beforeunload
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // Clean up when component unmounts
      closeWebSocket();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [projectId]);

  const handleBeforeUnload = () => {
    closeWebSocket();
  };

  // Properly close the WebSocket connection
  const closeWebSocket = () => {
    if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      try {
        socketRef.current.close();
      } catch (e) {
        console.error('Error closing WebSocket:', e);
      }
      socketRef.current = null;
    }
    setIsRunning(false);
    setWaitingForInput(false);
    setSocketReady(false);
    setIsConnecting(false);
    connectionPromiseRef.current = null;
  };

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  // Focus input when waiting for input
  useEffect(() => {
    if (waitingForInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [waitingForInput]);

  const fetchFileContent = async (fileId) => {
    try {
      const response = await filesApi.getContent(fileId);
      const content = response.data.content || '';

      // Update our files state with the content
      setFiles(files.map(f =>
        f.id === fileId ? { ...f, content } : f
      ));

      return content;
    } catch (err) {
      console.error(`Error fetching file content for file ${fileId}:`, err);
      throw err;
    }
  };

  const handleFileSelect = async (file) => {
    if (!file) {
      setActiveFile(null);
      setFileContent('');
      return;
    }

    if (activeFile?.id === file.id) return;

    setActiveFile(file);

    const existingFileState = files.find(f => f.id === file.id);
    if (existingFileState && existingFileState.content !== undefined) {
      setFileContent(existingFileState.content);
    }
    else if (file.content !== undefined) {
      setFileContent(file.content);
    }
    else {
      try {
        const content = await fetchFileContent(file.id);
        setFileContent(content);
      } catch (err) {
        setError(`Failed to load file: ${err.message}`);
      }
    }
  };

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleContentChange = (value) => {
    setFileContent(value || '');
    if (activeFile) {
      // Update file content in state
      setFiles(files.map(f =>
        f.id === activeFile.id ? { ...f, content: value || '' } : f
      ));
    }
  };

  const handleSave = async () => {
    if (!activeFile) return;

    try {
      setSaving(true);
      await filesApi.updateContent(activeFile.id, { content: fileContent });
    } catch (err) {
      setError(`Failed to save file: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setupWebSocket = () => {
    // If we already have a connection promise, return it
    if (connectionPromiseRef.current) {
      return connectionPromiseRef.current;
    }

    // Create a new connection promise
    const connectionPromise = new Promise((resolve, reject) => {
      // Close existing socket if any
      if (socketRef.current) {
        try {
          socketRef.current.close();
          socketRef.current = null;
        } catch (e) {
          console.error('Error closing existing WebSocket:', e);
        }
      }

      setIsConnecting(true);
      setSocketReady(false);

      // Generate a unique session ID
      sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log("Setting up new WebSocket connection with session ID:", sessionIdRef.current);

      // Create new WebSocket connection
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
      const socket = new WebSocket(`${wsProtocol}//${wsHost}/ws/code/${sessionIdRef.current}/`);

      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket connection timeout"));
          socket.close();
          connectionPromiseRef.current = null;
        }
      }, 5000); // 5 second timeout

      socket.onopen = () => {
        console.log('WebSocket connection established');
        addTerminalOutput('Connected to code execution service', 'system');
        // Wait for the connection_established message from the server before resolving
      };

      socket.onmessage = (event) => {
        try {
          console.log('Received:', event.data);
          const data = JSON.parse(event.data);

          if (data.type === 'connection_established') {
            console.log('Connection confirmed by server');
            clearTimeout(connectionTimeout);
            setSocketReady(true);
            setIsConnecting(false);
            resolve(socket); // Resolve only after server confirms connection
          } else if (data.type === 'output') {
            addTerminalOutput(data.output);
          } else if (data.type === 'error') {
            addTerminalOutput(data.error, 'error');
          } else if (data.type === 'input_prompt') {
            setWaitingForInput(true);
          } else if (data.type === 'execution_complete') {
            addTerminalOutput(`\nExecution completed with exit code ${data.exit_code}`, 'system');
            setIsRunning(false);
          } else if (data.type === 'execution_terminated') {
            addTerminalOutput('\nExecution terminated', 'system');
            setIsRunning(false);
          }
        } catch (error) {
          console.error('Error handling message:', error);
          addTerminalOutput('Error handling message from server', 'error');
        }
      };

      socket.onclose = (event) => {
        console.log('WebSocket connection closed', event);
        clearTimeout(connectionTimeout);

        // If we're still trying to establish connection, reject the promise
        if (isConnecting && connectionPromiseRef.current === connectionPromise) {
          reject(new Error("WebSocket connection closed during connection attempt"));
        }

        if (isRunning) {
          addTerminalOutput('Connection to execution service closed unexpectedly', 'error');
          setError('Connection to execution service closed unexpectedly');
        }

        setIsRunning(false);
        setWaitingForInput(false);
        setSocketReady(false);
        setIsConnecting(false);
        socketRef.current = null;
        connectionPromiseRef.current = null;
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        addTerminalOutput('Error connecting to execution service', 'error');
        setError('WebSocket connection error');
        setIsRunning(false);
        setSocketReady(false);
        setIsConnecting(false);
        clearTimeout(connectionTimeout);
        reject(error);
        connectionPromiseRef.current = null;
      };

      socketRef.current = socket;
    });

    // Store the promise for reuse
    connectionPromiseRef.current = connectionPromise;
    return connectionPromise;
  };

  const addTerminalOutput = (text, type = 'output') => {
    setTerminalOutput(prev => [...prev, { text, type }]);
  };

  const handleRunCode = async () => {
    if (!activeFile || !activeFile.id) {
      console.warn("handleRunCode: Aborted due to missing activeFile or activeFile.id");
      return;
    }

    const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB
    // Estimate byte size using string length (UTF-8 can be larger, but this is a common proxy)
    if (fileContent.length > MAX_FILE_SIZE_BYTES) { 
      const errorMsg = `File is too large to execute (approx > ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB).`;
      console.error(errorMsg);
      setError(errorMsg);
      addTerminalOutput(errorMsg, 'error');
      setIsRunning(false); // Ensure isRunning is reset if it was set before this check
      return;
    }

    clearTerminal();
    setIsRunning(true); 
    setError(null);     
    setWaitingForInput(false);

    try {
      // Setup WebSocket and wait for it to be fully connected
      const socket = await setupWebSocket();

      // Now that the socket is ready, send the code
      addTerminalOutput(`Running ${activeFile.name}...`, 'system');

      // Get the programming language based on file extension
      const language = getLanguage(activeFile.name);

      // Send the code to be executed
      const payload = {
        type: 'execute',
        code: fileContent,
        language: language,
        file_id: activeFile.id
      };
      console.log('Sending execute message with payload:', JSON.stringify(payload));
      socket.send(JSON.stringify(payload));
    } catch (error) {
      console.error('Error running code:', error);
      setError(`Error connecting to execution service: ${error.message}`);
      setIsRunning(false);
      closeWebSocket(); // Clean up the socket on error
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && waitingForInput) {
      e.preventDefault();
      sendInput();
    }
  };

  const sendInput = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Add the input to terminal with a visual indicator
    addTerminalOutput(`> ${userInput}`, 'input');

    // Send to WebSocket
    socketRef.current.send(JSON.stringify({
      type: 'input',
      input: userInput
    }));

    // Reset input field and wait state
    setUserInput('');
    setWaitingForInput(false);
  };

  const stopExecution = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'terminate'
      }));

      addTerminalOutput('Terminating execution...', 'system');
    }
  };

  const handleCreateFile = async (fileName) => {
    try {
      const response = await filesApi.create({
        name: fileName,
        project: projectId,
      });

      setFiles([...files, response.data]);
      handleFileSelect(response.data);
    } catch (err) {
      setError(`Failed to create file: ${err.message}`);
    }
  };

  const handleRenameFile = async (fileId, newName) => {
    try {
      const fileToUpdate = files.find(f => f.id === fileId);
      if (!fileToUpdate) return;

      const response = await filesApi.update(fileId, {
        name: newName,
        project: projectId,
      });

      setFiles(files.map(f => f.id === fileId ? response.data : f));

      if (activeFile && activeFile.id === fileId) {
        setActiveFile(response.data);
      }
    } catch (err) {
      setError(`Failed to rename file: ${err.message}`);
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await filesApi.delete(fileId);

      setFiles(files.filter(f => f.id !== fileId));

      if (activeFile && activeFile.id === fileId) {
        setActiveFile(null);
        setFileContent('');
      }
    } catch (err) {
      setError(`Failed to delete file: ${err.message}`);
    }
  };

  const getLanguage = (fileName) => {
    const extension = fileName?.split('.').pop()?.toLowerCase();
    const extensionMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
    };
    return extensionMap[extension] || 'plaintext';
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunCode();
    }
  };

  const clearTerminal = () => {
    setTerminalOutput([]);
  };

  const goToSettings = () => {
    navigate('/settings');
  };

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen"
      onKeyDown={handleKeyDown}
      tabIndex="-1"
    >
      {/* Header */}
      <div className="bg-gray-800 text-white p-2 flex justify-between items-center shadow-md">
        <div className="flex items-center">
          <button
            className="p-1 mr-2 rounded hover:bg-gray-700"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
          <h1 className="text-lg font-semibold">
            {project?.name || 'Code Editor'}
          </h1>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSave}
            disabled={!activeFile || saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleRunCode}
            disabled={!activeFile || isRunning}
          >
            {isRunning ? 'Running...' : 'Run'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={goToSettings}
          >
            Settings
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-64 bg-gray-100 border-r">
            <FileExplorer
              files={files}
              activeFileId={activeFile?.id}
              onFileSelect={handleFileSelect}
              onCreateFile={handleCreateFile}
              onDeleteFile={handleDeleteFile}
              onRenameFile={handleRenameFile}
              projectName={project?.name}
            />
          </div>
        )}

        {/* Editor Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {activeFile ? (
            <>
              <FileOperationsBar
                file={activeFile}
                onSave={handleSave}
                onRun={handleRunCode}
                saving={saving}
                running={isRunning}
              />

              <div className="flex-1">
                <Editor
                  height="100%"
                  language={getLanguage(activeFile.name)}
                  value={fileContent}
                  onChange={handleContentChange}
                  onMount={handleEditorDidMount}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on',
                    automaticLayout: true,
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              {files.length > 0 ? (
                <div className="text-center">
                  <p>Select a file from the sidebar to edit</p>
                </div>
              ) : (
                <div className="text-center">
                  <p>No files in this project yet</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-4"
                    onClick={() => setShowNewFileInput(true)}
                  >
                    Create a file
                  </Button>

                  {showNewFileInput && (
                    <div className="mt-4">
                      <input
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="File name (e.g. main.py)"
                        className="px-2 py-1 border rounded text-sm"
                        autoFocus
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="ml-2"
                        onClick={() => {
                          if (newFileName.trim()) {
                            handleCreateFile(newFileName);
                            setShowNewFileInput(false);
                            setNewFileName('');
                          }
                        }}
                      >
                        Create
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Terminal - Always visible now */}
          <div className="terminal-panel">
            <div className="terminal-toolbar">
              <div className="terminal-status">
                {isConnecting ? 'Connecting...' : isRunning ? 'Running...' : 'Terminal'}
              </div>
              <div>
                <button
                  onClick={clearTerminal}
                  title="Clear terminal"
                  className="terminal-btn"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                </button>
                {isRunning && (
                  <button
                    onClick={stopExecution}
                    title="Stop execution"
                    className="terminal-btn terminal-btn-stop"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="terminal-output" ref={terminalRef}>
              {terminalOutput.map((line, i) => (
                <p
                  key={i}
                  className={`terminal-line terminal-${line.type}`}
                >
                  {line.text}
                </p>
              ))}
            </div>

            {isRunning && (
              <div className={`terminal-input-area ${waitingForInput ? 'terminal-waiting-input' : ''}`}>
                <span className="terminal-input-prompt">
                  {waitingForInput ? ">" : ""}
                </span>
                <input
                  type="text"
                  ref={inputRef}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  disabled={!waitingForInput}
                  className="terminal-input"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div className="bg-red-500 text-white p-2 text-center">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;