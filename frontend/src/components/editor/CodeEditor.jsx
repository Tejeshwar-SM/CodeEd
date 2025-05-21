import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { files as filesApi, projects as projectsApi } from '../../services/api';
import codeExecutionService from '../../services/codeExecutionService';
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
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Add these state variables for the empty state file creation
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Terminal state
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [waitingForInput, setWaitingForInput] = useState(false);
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch project and files
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        const projectResponse = await projectsApi.get(projectId);
        setProject(projectResponse.data);

        const filesResponse = await filesApi.getAll(projectId);
        setFiles(filesResponse.data);

        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch project data:', err);
        setError('Failed to load project. Please try again.');
        setLoading(false);
      }
    };

    if (projectId) {
      fetchProjectData();
    }

    // Check connection status periodically
    const checkConnectionStatus = () => {
      const isConnected = codeExecutionService.isConnected();
      setConnectionStatus(isConnected ? 'connected' : 'disconnected');
    };

    // Check connection status immediately and set up interval
    checkConnectionStatus();
    const intervalId = setInterval(checkConnectionStatus, 3000);

    // Register event handlers for the code execution service
    codeExecutionService.on('output', handleOutput);
    codeExecutionService.on('error', handleError);
    codeExecutionService.on('inputPrompt', handleInputPrompt);
    codeExecutionService.on('executionComplete', handleExecutionComplete);
    codeExecutionService.on('executionTerminated', handleExecutionTerminated);
    codeExecutionService.on('socketError', handleSocketError);
    codeExecutionService.on('connectionEstablished', handleConnectionEstablished);

    // Add event listener for beforeunload
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // Clean up event handlers
      codeExecutionService.off('output', handleOutput);
      codeExecutionService.off('error', handleError);
      codeExecutionService.off('inputPrompt', handleInputPrompt);
      codeExecutionService.off('executionComplete', handleExecutionComplete);
      codeExecutionService.off('executionTerminated', handleExecutionTerminated);
      codeExecutionService.off('socketError', handleSocketError);
      codeExecutionService.off('connectionEstablished', handleConnectionEstablished);

      // Clean up interval
      clearInterval(intervalId);

      // Close WebSocket connection
      codeExecutionService.closeConnection();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [projectId]);

  const handleBeforeUnload = () => {
    codeExecutionService.closeConnection();
  };

  // Event handlers for code execution service
  const handleOutput = (output) => {
    addTerminalOutput(output);
  };

  const handleError = (error) => {
    addTerminalOutput(error, 'error');
  };

  const handleInputPrompt = () => {
    setWaitingForInput(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleExecutionComplete = (exitCode) => {
    addTerminalOutput(`\nExecution completed with exit code ${exitCode}`, 'system');
    setIsRunning(false);
  };

  const handleExecutionTerminated = (message) => {
    addTerminalOutput(`\n${message || 'Execution terminated'}`, 'system');
    setIsRunning(false);
  };

  const handleSocketError = (error) => {
    console.error('Socket error:', error);
    setError(`Connection error: ${error}`);
    setConnectionStatus('error');
    if (isRunning) {
      setIsRunning(false);
      addTerminalOutput('Execution interrupted due to connection error', 'error');
    }
  };

  const handleConnectionEstablished = () => {
    setConnectionStatus('connected');
    addTerminalOutput('Connected to code execution service', 'system');
    setError(null);
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
      return response.data.content;
    } catch (err) {
      console.error('Failed to fetch file content:', err);
      setError('Failed to load file content. Please try again.');
      return null;
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
        setFileContent(content || '');

        // Update the content in our files state
        setFiles(files.map(f =>
          f.id === file.id ? { ...f, content } : f
        ));
      } catch (error) {
        console.error('Error fetching file content:', error);
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
        f.id === activeFile.id ? { ...f, content: value } : f
      ));
    }
  };

  const handleSave = async () => {
    if (!activeFile) return;

    try {
      setSaving(true);
      const response = await filesApi.updateContent(activeFile.id, { content: fileContent });

      // Update the content in our files state
      setFiles(files.map(f =>
        f.id === activeFile.id ? { ...f, content: fileContent } : f
      ));

      // Optionally show a success notification
    } catch (err) {
      console.error('Failed to save file:', err);
      setError('Failed to save file. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addTerminalOutput = (text, type = 'output') => {
    setTerminalOutput(prev => [...prev, { text, type }]);
  };

  const handleRunCode = async () => {
  if (!activeFile) return;

  try {
    // Clear previous output and set running state
    setTerminalOutput([]);
    setIsRunning(true);
    setError(null);

    // If not connected, set up the WebSocket first
    if (!codeExecutionService.isConnected()) {
      addTerminalOutput('Establishing connection...', 'system');
      codeExecutionService.setupWebSocket();

      // Give it a moment to connect before executing
      await new Promise(resolve => setTimeout(resolve, 500));

      // If still not connected after waiting, show an error
      if (!codeExecutionService.isConnected()) {
        throw new Error('Failed to establish connection');
      }
    }

    addTerminalOutput(`Running ${activeFile.name}...`, 'system');

    // Extract the language from the file extension
    const language = getLanguage(activeFile.name);

    // Execute the code
    await codeExecutionService.executeCode(
      fileContent,
      language === 'javascript' ? 'js' : language,
      activeFile.id
    );
  } catch (error) {
    console.error('Error running code:', error);
    setError(`Error running code: ${error.message}`);
    addTerminalOutput(`Error running code: ${error.message}`, 'error');
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
    if (!codeExecutionService.isConnected()) {
      addTerminalOutput('Connection lost. Cannot send input.', 'error');
      return;
    }

    // Add the input to terminal with a visual indicator
    addTerminalOutput(`> ${userInput}`, 'input');

    // Send to WebSocket using the service
    codeExecutionService.sendInput(userInput);

    // Reset input field and wait state
    setUserInput('');
    setWaitingForInput(false);
  };

  const stopExecution = () => {
    if (!codeExecutionService.isConnected()) {
      addTerminalOutput('Connection lost. Cannot stop execution.', 'error');
      setIsRunning(false);
      return;
    }

    codeExecutionService.terminateExecution();
    addTerminalOutput('Terminating execution...', 'system');
  };

  const reconnectToService = () => {
    addTerminalOutput('Attempting to reconnect...', 'system');
    setConnectionStatus('connecting');

    // Use setupWebSocket instead of connect (which doesn't exist)
    const socket = codeExecutionService.setupWebSocket();

    // Handle potential immediate connection errors
    socket.onerror = () => {
      setConnectionStatus('error');
      addTerminalOutput('Failed to reconnect. Please try again later.', 'error');
    };
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
      console.error('Failed to create file:', err);
      setError('Failed to create file. Please try again.');
    }
  };

  const handleRenameFile = async (fileId, newName) => {
  try {
    // First get the current file to ensure we have all required fields
    const currentFile = files.find(f => f.id === fileId);
    if (!currentFile) return;

    // Update with proper structure matching API expectations
    await filesApi.update(fileId, {
      name: newName,
      project: projectId
    });

    // Update files in state
    setFiles(files.map(f =>
      f.id === fileId ? { ...f, name: newName } : f
    ));

    // Update active file if it was the one renamed
    if (activeFile && activeFile.id === fileId) {
      setActiveFile({ ...activeFile, name: newName });
    }
  } catch (err) {
    console.error('Failed to rename file:', err);
    setError(`Failed to rename file: ${err.message}`);
  }
};


  const handleDeleteFile = async (fileId) => {
    try {
      await filesApi.delete(fileId);
      setFiles(files.filter(f => f.id !== fileId));

      if (activeFile?.id === fileId) {
        setActiveFile(null);
        setFileContent('');
      }
    } catch (err) {
      console.error('Failed to delete file:', err);
      setError('Failed to delete file. Please try again.');
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

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return isRunning ? 'Running...' : 'Terminal';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Connection error';
      case 'disconnected': return 'Disconnected';
      default: return 'Terminal';
    }
  };

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader />
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
            className="p-1 mr-2 text-white hover:bg-gray-700 rounded"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>
          <h1 className="text-xl font-bold">{project?.name || 'Code Editor'}</h1>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={handleRunCode}
            variant="primary"
            disabled={!activeFile || isRunning}
          >
            {isRunning ? 'Running...' : 'Run'}
          </Button>
          <Button onClick={goToSettings} variant="ghost">
            Settings
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-64 border-r bg-gray-50 flex-shrink-0 overflow-hidden flex flex-col">
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
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  language={getLanguage(activeFile.name)}
                  value={fileContent}
                  theme="vs-dark"
                  onChange={handleContentChange}
                  onMount={handleEditorDidMount}
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
            <div className="flex-1 flex items-center justify-center bg-gray-100">
              <div className="text-center p-6 max-w-md">
                <h2 className="text-2xl font-bold mb-4">No file selected</h2>
                <p className="mb-4 text-gray-600">
                  Select a file from the sidebar or create a new one to start coding.
                </p>
                <div className="flex justify-center">
                  <Button
                    onClick={() => setShowNewFileInput(true)}
                    variant="primary"
                  >
                    Create New File
                  </Button>
                </div>

                {showNewFileInput && (
                  <div className="mt-4">
                    <input
                      type="text"
                      className="border p-2 w-full mb-2 rounded"
                      placeholder="Enter file name"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateFile(newFileName);
                          setNewFileName('');
                          setShowNewFileInput(false);
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => {
                          handleCreateFile(newFileName);
                          setNewFileName('');
                          setShowNewFileInput(false);
                        }}
                        disabled={!newFileName.trim()}
                        variant="primary"
                        size="sm"
                      >
                        Create
                      </Button>
                      <Button
                        onClick={() => {
                          setNewFileName('');
                          setShowNewFileInput(false);
                        }}
                        variant="ghost"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Terminal - Always visible now */}
          <div className="terminal-panel">
            <div className="terminal-toolbar">
              <div className={`terminal-status terminal-status-${connectionStatus}`}>
                {getConnectionStatusText()}
                {connectionStatus !== 'connected' && (
                  <button
                    onClick={reconnectToService}
                    className="ml-2 text-xs bg-blue-500 px-1 rounded hover:bg-blue-600"
                    title="Reconnect to execution service"
                  >
                    Reconnect
                  </button>
                )}
              </div>
              <div>
                {isRunning && (
                  <button
                    onClick={stopExecution}
                    className="terminal-toolbar-button text-red-400"
                    title="Stop execution"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={clearTerminal}
                  className="terminal-toolbar-button"
                  title="Clear terminal"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="terminal-output" ref={terminalRef}>
              {terminalOutput.map((line, i) => (
                <p
                  key={i}
                  className={`terminal-line terminal-line-${line.type}`}
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
                  disabled={!waitingForInput || connectionStatus !== 'connected'}
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