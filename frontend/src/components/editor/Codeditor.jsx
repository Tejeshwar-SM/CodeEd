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

  // Fetch project and files
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        const projectResponse = await projectsApi.get(projectId);
        setProject(projectResponse.data);

        const filesResponse = await filesApi.getAll(projectId);
        setFiles(filesResponse.data);
      } catch (err) {
        console.error('Error fetching project data:', err);
        setError('Failed to load project data.');
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
        // Send termination signal if the socket is open
        if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'terminate'
          }));
        }
        socketRef.current.close();
      } catch (e) {
        console.error("Error closing WebSocket:", e);
      }
      socketRef.current = null;
    }
    setIsRunning(false);
    setWaitingForInput(false);
    setSocketReady(false);
    setIsConnecting(false);
  };

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      closeWebSocket();
    };
  }, []);

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
        setError(`Failed to load file content: ${err.message}`);
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
    // Close existing socket if any
    closeWebSocket();
    setIsConnecting(true);
    setSocketReady(false);

    // Generate a unique session ID
    sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log("Setting up new WebSocket connection with session ID:", sessionIdRef.current);

    // Create new WebSocket connection
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
    const socket = new WebSocket(`${wsProtocol}//${wsHost}/ws/code/${sessionIdRef.current}/`);

    socket.onopen = () => {
      console.log('WebSocket connection established');
      addTerminalOutput('Connected to code execution service', 'system');
    };

    socket.onmessage = (event) => {
      try {
        console.log('Received:', event.data);
        const data = JSON.parse(event.data);

        switch(data.type) {
          case 'connection_established':
            console.log('Connection confirmed by server');
            setSocketReady(true);
            setIsConnecting(false);
            break;
          case 'output':
            addTerminalOutput(data.output);
            break;
          case 'error':
            addTerminalOutput(data.error, 'error');
            break;
          case 'input_prompt':
            setWaitingForInput(true);
            break;
          case 'execution_complete':
            addTerminalOutput(`\nExecution complete (exit code: ${data.exit_code})`, 'system');
            setIsRunning(false);
            break;
          case 'execution_terminated':
            addTerminalOutput(`\n${data.message}`, 'system');
            setIsRunning(false);
            break;
          default:
            console.log('Unknown message type:', data);
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
        addTerminalOutput(`Error processing server message: ${error.message}`, 'error');
      }
    };

    socket.onclose = (event) => {
      console.log('WebSocket connection closed', event);
      if (isRunning) {
        addTerminalOutput('Connection to execution service closed unexpectedly', 'error');
        setError('Connection to execution service closed unexpectedly');
      }
      setIsRunning(false);
      setWaitingForInput(false);
      setSocketReady(false);
      setIsConnecting(false);
      socketRef.current = null;
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      addTerminalOutput('Error connecting to execution service', 'error');
      setError('WebSocket connection error');
      setIsRunning(false);
      setSocketReady(false);
      setIsConnecting(false);
    };

    socketRef.current = socket;
    return socket;
  };

  const addTerminalOutput = (text, type = 'output') => {
    setTerminalOutput(prev => [...prev, { text, type }]);
  };

  const handleRunCode = async () => {
    if (!activeFile) return;

    try {
      clearTerminal();
      setIsRunning(true);
      setError(null);
      setWaitingForInput(false);

      // Setup WebSocket first
      const socket = setupWebSocket();

      // Wait for the connection to be established
      const checkReady = () => {
        return new Promise((resolve, reject) => {
          const maxAttempts = 50; // 5 seconds
          let attempts = 0;

          const interval = setInterval(() => {
            attempts++;

            if (socketReady) {
              clearInterval(interval);
              resolve();
            } else if (attempts >= maxAttempts) {
              clearInterval(interval);
              reject(new Error("WebSocket connection failed"));
            } else if (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED) {
              clearInterval(interval);
              reject(new Error("WebSocket connection failed"));
            }
          }, 100);
        });
      };

      // Wait for the connection to be ready
      await checkReady();

      // Now that the socket is ready, send the code
      addTerminalOutput(`Running ${activeFile.name}...`, 'system');

      // Send the code to be executed
      socket.send(JSON.stringify({
        type: 'execute',
        code: fileContent,
        language: getLanguage(activeFile.name)
      }));

    } catch (error) {
      console.error('Error running code:', error);
      setError(`Error connecting to execution service\n\n${error.message}`);
      setIsRunning(false);
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
        content: ''
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
        ...fileToUpdate,
        name: newName
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
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
                activeFile={activeFile}
                onSave={handleSave}
              />

              <div className="flex-1">
                <Editor
                  height="100%"
                  language={getLanguage(activeFile.name)}
                  theme="vs-dark"
                  value={fileContent}
                  onChange={handleContentChange}
                  onMount={handleEditorDidMount}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    automaticLayout: true,
                    wordWrap: 'on'
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              {files.length > 0 ? (
                <div className="text-center">
                  <p>Select a file from the sidebar to start editing</p>
                </div>
              ) : (
                <div className="text-center">
                  <p>No files yet. Create your first file to get started.</p>
                  <div className="mt-4">
                    {showNewFileInput ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={newFileName}
                          onChange={(e) => setNewFileName(e.target.value)}
                          placeholder="File name"
                          className="border p-2 rounded"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCreateFile(newFileName);
                              setShowNewFileInput(false);
                              setNewFileName('');
                            }
                          }}
                        />
                        <Button
                          onClick={() => {
                            handleCreateFile(newFileName);
                            setShowNewFileInput(false);
                            setNewFileName('');
                          }}
                        >
                          Create
                        </Button>
                      </div>
                    ) : (
                      <Button onClick={() => setShowNewFileInput(true)}>
                        Create File
                      </Button>
                    )}
                  </div>
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
                  className="terminal-toolbar-button"
                  onClick={clearTerminal}
                  title="Clear terminal"
                >
                  Clear
                </button>
                {isRunning && (
                  <button
                    className="terminal-toolbar-button"
                    onClick={stopExecution}
                    title="Stop execution"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>

            <div className="terminal-output" ref={terminalRef}>
              {terminalOutput.map((line, i) => (
                <p
                  key={i}
                  className={`terminal-line ${line.type ? `terminal-line-${line.type}` : ''}`}
                >
                  {line.text}
                </p>
              ))}
            </div>

            {isRunning && (
              <div className={`terminal-input-area ${waitingForInput ? 'terminal-waiting-input' : ''}`}>
                <span className="terminal-input-prompt">
                  {waitingForInput ? '>' : ''}
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  className="terminal-input"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={waitingForInput ? "Enter input..." : ""}
                  disabled={!waitingForInput}
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