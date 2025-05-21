import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useParams, useNavigate } from 'react-router-dom';
import { files as filesApi, projects as projectsApi } from '../../services/api';
import codeExecutionService from '../../services/codeExecutionService';
import { useWebSocket } from '../../contexts/useWebSocket';
import Terminal from './Terminal';
import Button from '../ui/Button';
import FileExplorer from './FileExplorer';
import FileOperationsBar from './FileOperationsBar';
import Loader from '../ui/Loader';

const CodeEditor = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isContentModified, setIsContentModified] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Editor state
  const editorRef = useRef(null);

  // Terminal state
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [userInput, setUserInput] = useState('');

  // WebSocket connection state
  const { connectionStatus, connect, reconnect } = useWebSocket();

  // Load project and files data
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

    // Connect to WebSocket when component mounts
    if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      connect();
    }

    // Add event listener for beforeunload to properly close connections
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // Clean up when component unmounts
      if (isRunning) {
        handleStopExecution();
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [projectId, connectionStatus, connect, isRunning]);

  // Handle WebSocket events
  useEffect(() => {
    const handleOutput = (output) => {
      setTerminalOutput(prev => [...prev, { text: output, type: 'output' }]);
    };

    const handleError = (errorMsg) => {
      setTerminalOutput(prev => [...prev, { text: errorMsg, type: 'error' }]);
    };

    const handleInputPrompt = () => {
      setWaitingForInput(true);
    };

    const handleExecutionComplete = (exitCode) => {
      setTerminalOutput(prev => [
        ...prev,
        { text: `\nExecution complete (exit code: ${exitCode})`, type: 'system' }
      ]);
      setIsRunning(false);
    };

    const handleExecutionTerminated = (message) => {
      setTerminalOutput(prev => [...prev, { text: `\n${message}`, type: 'system' }]);
      setIsRunning(false);
    };

    const handleSocketError = (errorMsg) => {
      setTerminalOutput(prev => [...prev, { text: errorMsg, type: 'error' }]);
      setError(errorMsg);
      setIsRunning(false);
    };

    // Register event listeners
    codeExecutionService.on('output', handleOutput);
    codeExecutionService.on('error', handleError);
    codeExecutionService.on('inputPrompt', handleInputPrompt);
    codeExecutionService.on('executionComplete', handleExecutionComplete);
    codeExecutionService.on('executionTerminated', handleExecutionTerminated);
    codeExecutionService.on('socketError', handleSocketError);

    return () => {
      // Cleanup event listeners
      codeExecutionService.off('output', handleOutput);
      codeExecutionService.off('error', handleError);
      codeExecutionService.off('inputPrompt', handleInputPrompt);
      codeExecutionService.off('executionComplete', handleExecutionComplete);
      codeExecutionService.off('executionTerminated', handleExecutionTerminated);
      codeExecutionService.off('socketError', handleSocketError);
    };
  }, []);

  const handleBeforeUnload = () => {
    if (isRunning) {
      handleStopExecution();
    }
  };

  // Update editor content when active file changes
  useEffect(() => {
    if (!activeFile) return;

    const fetchFileContent = async () => {
      try {
        const response = await filesApi.getContent(activeFile.id);
        const content = response.data.content || '';

        // Update files state with the content
        setFiles(prev => prev.map(f =>
          f.id === activeFile.id ? { ...f, content } : f
        ));

        setFileContent(content);
        setIsContentModified(false); // Reset modified state
      } catch (err) {
        console.error(`Error fetching file content for file ${activeFile.id}:`, err);
        setError(`Failed to load file content: ${err.message}`);
      }
    };

    // Check if the content is already in our state
    const existingFile = files.find(f => f.id === activeFile.id);
    if (existingFile && existingFile.content !== undefined) {
      setFileContent(existingFile.content);
      setIsContentModified(false); // Reset modified state
    } else {
      fetchFileContent();
    }
  }, [activeFile, files]);

  // File operations
  const handleFileSelect = (file) => {
    if (!file) {
      setActiveFile(null);
      setFileContent('');
      return;
    }

    if (activeFile?.id === file.id) return;

    if (isContentModified) {
      if (window.confirm("You have unsaved changes. Do you want to save them before switching files?")) {
        saveActiveFile().then(() => {
          setActiveFile(file);
        });
      } else {
        setActiveFile(file);
      }
    } else {
      setActiveFile(file);
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

  const handleRenameFile = async (fileId, newName) => {
    try {
      const fileToUpdate = files.find(f => f.id === fileId);
      if (!fileToUpdate) return;

      // Only send the name field to avoid 400 Bad Request errors
      const response = await filesApi.update(fileId, {
        name: newName
      });

      setFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, name: response.data.name } : f
      ));

      if (activeFile && activeFile.id === fileId) {
        setActiveFile(prev => ({ ...prev, name: response.data.name }));
      }
    } catch (err) {
      console.error('File rename error:', err);
      setError(`Failed to rename file: ${err.message}`);
    }
  };

  const saveActiveFile = async () => {
    if (!activeFile || !editorRef.current) return;

    try {
      setSaving(true);
      await filesApi.updateContent(activeFile.id, { content: fileContent });
      setIsContentModified(false);
    } catch (err) {
      setError(`Failed to save file: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Editor functions
  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value) => {
    setFileContent(value || '');
    if (!isContentModified) {
      setIsContentModified(true);
    }
  };

  // Code execution functions
  const handleRunCode = async () => {
    if (!activeFile || !editorRef.current) {
      setError("No file selected or editor not initialized");
      return;
    }

    // Save file before running if it's modified
    if (isContentModified) {
      await saveActiveFile();
    }

    setTerminalOutput([]);
    setIsRunning(true);
    setError(null);

    const code = editorRef.current.getValue();
    const language = getLanguage(activeFile.name);

    try {
      await codeExecutionService.executeCode(code, language, activeFile.id);
    } catch (err) {
      setError(`Execution error: ${err.message}`);
      setIsRunning(false);
    }
  };

  const handleStopExecution = () => {
    codeExecutionService.terminateExecution();
  };

  const handleClearTerminal = () => {
    setTerminalOutput([]);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && waitingForInput) {
      e.preventDefault();

      // Add the input to terminal with a visual indicator
      setTerminalOutput(prev => [...prev, { text: `> ${userInput}`, type: 'input' }]);

      // Send input to the execution service
      codeExecutionService.sendInput(userInput);

      // Reset input field and wait state
      setUserInput('');
      setWaitingForInput(false);
    }
  };

  // Helper functions
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
      saveActiveFile();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunCode();
    }
  };

  if (loading) {
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
            onClick={saveActiveFile}
            disabled={!activeFile || saving || !isContentModified}
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
            onClick={() => navigate('/settings')}
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeFile ? (
            <>
              <FileOperationsBar
                activeFile={activeFile}
                onSave={saveActiveFile}
              />

              <div className="flex-1">
                <Editor
                  height="100%"
                  language={getLanguage(activeFile.name)}
                  theme="vs-dark"
                  value={fileContent}
                  onChange={handleEditorChange}
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
                    <Button onClick={() => handleCreateFile("main.py")}>
                      Create First File
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Terminal */}
          <Terminal
            terminalOutput={terminalOutput}
            isRunning={isRunning}
            waitingForInput={waitingForInput}
            userInput={userInput}
            setUserInput={setUserInput}
            connectionStatus={connectionStatus}
            handleInputKeyDown={handleInputKeyDown}
            stopExecution={handleStopExecution}
            clearTerminal={handleClearTerminal}
            reconnectToService={reconnect}
          />
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