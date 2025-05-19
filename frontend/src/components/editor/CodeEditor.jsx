import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { files as filesApi, projects as projectsApi, code } from '../../services/api';
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

  // State for code execution
  const [isRunning, setIsRunning] = useState(false);
  const [executionOutput, setExecutionOutput] = useState('');
  const [executionError, setExecutionError] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);

  // Fetch project and files
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        setLoading(true);
        const projectResponse = await projectsApi.get(projectId);
        setProject(projectResponse.data);

        const filesResponse = await filesApi.getAll(projectId);
        setFiles(filesResponse.data);

        setLoading(false);
      } catch (err) {
        setError('Failed to load project data');
        setLoading(false);
      }
    };

    if (projectId) {
      fetchProjectData();
    }
  }, [projectId]);

  const fetchFileContent = async (fileId) => {
    try {
      const response = await filesApi.getContent(fileId);
      setFileContent(response.data.content || '');
    } catch (err) {
      setError('Failed to load file content');
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
        setFileContent(existingFileState.content || '');
    } else if (file.content !== undefined) {
        setFileContent(file.content || '');
    }
    else {
        await fetchFileContent(file.id);
    }
  };

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleContentChange = (value) => {
    setFileContent(value || '');
    if (activeFile) {
      setFiles(prevFiles => prevFiles.map(f =>
        f.id === activeFile.id ? { ...f, content: value || '' } : f
      ));
    }
  };

  const handleSave = async () => {
    if (!activeFile) return;

    try {
      setSaving(true);
      await filesApi.updateContent(activeFile.id, { content: fileContent });
      // Update the file in the state
      setFiles(prevFiles => prevFiles.map(f =>
        f.id === activeFile.id ? { ...f, content: fileContent } : f
      ));
      setSaving(false);
    } catch (err) {
      setError('Failed to save file');
      setSaving(false);
    }
  };

  const handleRunCode = async () => {
    if (!activeFile) return;

    try {
      setIsRunning(true);
      setExecutionError(null);
      setShowTerminal(true); // Always show terminal when running code

      const response = await code.execute({
        file_id: activeFile.id,
        language: getLanguage(activeFile.name),
        code: fileContent
      });

      setExecutionOutput(response.data.output || '');
      if (response.data.error) {
        setExecutionError(response.data.error);
      }
    } catch (err) {
      setExecutionError(`Error executing code: ${err.message}`);
      console.error('Run code error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCreateFile = async (fileName) => {
    try {
      const response = await filesApi.create({
        name: fileName,
        project: projectId,
        content: ''
      });
      setFiles(prevFiles => [...prevFiles, response.data]);
      handleFileSelect(response.data);
    } catch (err) {
      setError('Failed to create file');
    }
  };

  const handleRenameFile = async (fileId, newName) => {
    try {
      const response = await filesApi.update(fileId, { name: newName });
      setFiles(prevFiles => prevFiles.map(f =>
        f.id === fileId ? { ...f, name: newName } : f
      ));
      if (activeFile?.id === fileId) {
        setActiveFile({ ...activeFile, name: newName });
      }
    } catch (err) {
      setError('Failed to rename file');
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await filesApi.delete(fileId);
      setFiles(prevFiles => prevFiles.filter(f => f.id !== fileId));
      if (activeFile?.id === fileId) {
        setActiveFile(null);
        setFileContent('');
      }
    } catch (err) {
      setError('Failed to delete file');
    }
  };

  const getLanguage = (fileName) => {
    const extension = fileName?.split('.').pop()?.toLowerCase();
    const extensionMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown'
    };
    return extensionMap[extension] || 'plaintext';
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      handleRunCode();
    }
  };

  const toggleTerminal = () => {
    setShowTerminal(prev => !prev);
  };

  const goToSettings = () => {
    navigate('/settings');
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
      tabIndex={-1}
    >
      <div className="bg-gray-800 text-white px-4 py-2 flex justify-between items-center">
        <div className="flex items-center">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mr-4 text-gray-300 hover:text-white"
          >
            ☰
          </button>
          <h1 className="text-lg font-semibold">{project?.name || 'Editor'}</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToSettings}
          >
            Settings
          </Button>
          <Button
            variant={showTerminal ? "primary" : "outline"}
            size="sm"
            onClick={toggleTerminal}
          >
            Terminal
          </Button>
          <Button
            variant="outline"
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
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2">
          {error}
          <button
            className="ml-2 text-red-700 hover:text-red-900"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div className="w-64 bg-gray-100 border-r">
            <FileExplorer
              files={files}
              activeFileId={activeFile?.id}
              onFileSelect={handleFileSelect}
              onCreateFile={handleCreateFile}
              onDeleteFile={handleDeleteFile}
              onRenameFile={handleRenameFile}
              projectName={project?.name || ''}
            />
          </div>
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          {activeFile ? (
            <>
              <FileOperationsBar activeFile={activeFile} onSave={handleSave} />
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  language={getLanguage(activeFile.name)}
                  value={fileContent}
                  onChange={handleContentChange}
                  onMount={handleEditorDidMount}
                  options={{
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                    automaticLayout: true,
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Select a file to edit or create a new one.
            </div>
          )}

          {/* Terminal Output Panel */}
          {showTerminal && (
            <div className="terminal-panel bg-gray-900 text-white overflow-auto" style={{ height: '240px' }}>
              <div className="flex justify-between items-center bg-gray-800 px-3 py-1">
                <div className="text-sm font-mono">Output</div>
                <div className="flex">
                  {isRunning && <div className="mr-2 text-yellow-400">Running...</div>}
                  <button
                    className="text-gray-400 hover:text-white focus:outline-none"
                    onClick={() => setShowTerminal(false)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="p-3 font-mono text-sm overflow-auto h-full">
                {executionOutput ? (
                  <pre className="whitespace-pre-wrap">{executionOutput}</pre>
                ) : executionError ? (
                  <pre className="text-red-400 whitespace-pre-wrap">{executionError}</pre>
                ) : (
                  <span className="text-gray-500">No output to display. Run your code to see results here.</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;